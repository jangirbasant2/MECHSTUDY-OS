import { GoogleGenAI } from '@google/genai';
import { getAiSettings } from './settings';
import type { ToolDefinition } from './toolRegistry';
import type {
  AiToolCall,
  ExamHalvingPlanRequest,
  ExamHalvingPlanResult,
  ExamHalvingPlanDaySchedule
} from '../../../shared/types';
import { setSetting, tx } from '../../db';
import { createTask } from '../study';

export interface ChatStreamGeminiOptions {
  apiKey?: string;
  model?: string;
  systemPrompt?: string;
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
    images?: string[]; // base64 strings
    toolCalls?: AiToolCall[];
    toolCallId?: string;
  }>;
  tools?: ToolDefinition[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  onChunk: (chunk: { delta: string; toolCalls?: AiToolCall[] }) => void;
}

export interface ChatStreamGeminiResult {
  content: string;
  toolCalls?: AiToolCall[];
}

export function normalizeGeminiModel(model?: string): string {
  if (!model) return 'gemini-2.5-flash';
  const m = model.trim().toLowerCase();
  if (m === 'gemini-2.5-pro' || m.includes('carbon') || m.includes('pro')) return 'gemini-2.5-pro';
  if (m === 'gemini-2.0-flash') return 'gemini-2.0-flash';
  if (m === 'gemini-1.5-flash') return 'gemini-1.5-flash';
  if (m === 'gemini-2.5-flash' || m.includes('flash') || m.includes('hydrogen') || m.includes('lite')) return 'gemini-2.5-flash';
  return 'gemini-2.5-flash';
}

export function getEffectiveApiKey(explicitKey?: string): string {
  if (explicitKey && explicitKey.trim()) return explicitKey.trim();
  const settingsKey = getAiSettings().apiKey;
  if (settingsKey && settingsKey.trim()) return settingsKey.trim();
  return (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim();
}

/**
 * Return a GoogleGenAI client explicitly configured for v1beta.
 * v1beta is required for function calling (tool use), structured JSON outputs, and modern multimodal schemas.
 */
export function getGeminiClient(apiKey: string): GoogleGenAI {
  return new GoogleGenAI({
    apiKey,
    httpOptions: { apiVersion: 'v1beta' },
  });
}

/**
 * Validate a Google AI Studio API key by issuing a minimal test generation.
 */
export async function testGeminiApiKey(
  apiKey: string,
  model: string = 'gemini-2.5-flash'
): Promise<{ ok: boolean; model?: string; error?: string }> {
  const key = apiKey.trim();
  if (!key) {
    return { ok: false, error: 'Google AI Studio API Key is empty.' };
  }
  const cleanModel = normalizeGeminiModel(model);
  try {
    const ai = getGeminiClient(key);
    const response = await ai.models.generateContent({
      model: cleanModel,
      contents: 'Respond with "OK" if this connection test is successful.',
      config: {
        maxOutputTokens: 16,
        temperature: 0.1,
      },
    });
    const text = response?.text?.trim() || 'OK';
    return { ok: true, model: cleanModel };
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || String(err),
    };
  }
}

/**
 * Stream Gemini responses using @google/genai.
 */
export async function chatStreamGemini(
  options: ChatStreamGeminiOptions
): Promise<ChatStreamGeminiResult> {
  const apiKey = getEffectiveApiKey(options.apiKey);
  if (!apiKey) {
    throw new Error(
      'Google AI Studio API Key is not configured. Please enter your Gemini API key in the top header menu.'
    );
  }

  const model = normalizeGeminiModel(options.model || getAiSettings().selectedModel);
  const ai = getGeminiClient(apiKey);

  // Separate system prompt and conversation messages
  const systemInstruction = options.systemPrompt || '';

  // Format contents for @google/genai
  const contents: any[] = [];

  for (const m of options.messages) {
    if (m.role === 'system') continue; // Handled via systemInstruction

    const parts: any[] = [];

    // If images are present (e.g. diagram snips or page screenshots)
    if (Array.isArray(m.images) && m.images.length > 0) {
      for (const img of m.images) {
        const cleanBase64 = img.replace(/^data:image\/[a-z]+;base64,/, '');
        parts.push({
          inlineData: {
            mimeType: 'image/png',
            data: cleanBase64,
          },
        });
      }
    }

    if (m.content) {
      parts.push({ text: m.content });
    }

    // Role mapping: 'user' -> 'user', 'assistant' -> 'model'
    const role = m.role === 'assistant' ? 'model' : 'user';
    contents.push({ role, parts });
  }

  // Format tools if provided
  let toolsConfig: any = undefined;
  if (options.tools && options.tools.length > 0) {
    const declarations = options.tools.map((t) => ({
      name: t.function.name,
      description: t.function.description,
      parametersJsonSchema: t.function.parameters,
    }));
    toolsConfig = [{ functionDeclarations: declarations }];
  }

  const config: any = {
    temperature: options.temperature ?? 0.7,
    maxOutputTokens: options.maxTokens ?? 2048,
  };
  if (systemInstruction) {
    config.systemInstruction = systemInstruction;
  }
  if (toolsConfig) {
    config.tools = toolsConfig;
  }

  let fullContent = '';
  const detectedToolCalls: AiToolCall[] = [];

  try {
    const responseStream = await ai.models.generateContentStream({
      model,
      contents,
      config,
    });

    for await (const chunk of responseStream) {
      if (options.signal?.aborted) {
        throw new Error('AI request was aborted by user.');
      }

      const textDelta = chunk.text || '';
      if (textDelta) {
        fullContent += textDelta;
        options.onChunk({ delta: textDelta });
      }

      // Check for function calls in chunk
      const functionCalls = chunk.functionCalls;
      if (functionCalls && functionCalls.length > 0) {
        for (const fc of functionCalls) {
          const callId = `call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          const toolCall: AiToolCall = {
            id: callId,
            name: fc.name || '',
            arguments: (fc.args as Record<string, unknown>) || {},
          };
          detectedToolCalls.push(toolCall);
          options.onChunk({ delta: '', toolCalls: [toolCall] });
        }
      }
    }
  } catch (err: any) {
    if (options.signal?.aborted) {
      throw new Error('Generation aborted');
    }
    throw err;
  }

  return {
    content: fullContent,
    toolCalls: detectedToolCalls.length > 0 ? detectedToolCalls : undefined,
  };
}

/**
 * Perform high-accuracy OCR on a scanned page image with Gemini.
 * Extracts text, mathematical equations (formatted as LaTeX math $...$ and $$...$$),
 * headings, and diagram labels.
 */
export async function geminiOcrPage(
  imageBuffer: Buffer,
  mimeType: string = 'image/png',
  apiKey?: string,
  model?: string
): Promise<string> {
  const key = getEffectiveApiKey(apiKey);
  if (!key) {
    throw new Error('Google AI Studio API Key is required for Scanned PDF OCR.');
  }

  const selectedModel = normalizeGeminiModel(model || getAiSettings().selectedModel);
  const ai = getGeminiClient(key);

  const base64Data = imageBuffer.toString('base64');

  const prompt =
    'You are an expert engineering OCR and mathematical digitizer for MECHSTUDY OS.\n' +
    'Extract all readable text, mathematical formulas, equations, tables, section headings, and diagram annotations from this page image.\n' +
    'CRITICAL FORMATTING INSTRUCTIONS:\n' +
    '1. Use standard LaTeX math: inline formulas in $...$ (e.g. $\\sigma = \\frac{P}{A}$), display/derivation equations in $$...$$.\n' +
    '2. Preserve structure, lists, numbered steps, and section titles faithfully.\n' +
    '3. Do not add introductory remarks, conversational greetings, or concluding remarks.\n' +
    '4. Output ONLY the extracted markdown text.';

  const response = await ai.models.generateContent({
    model: selectedModel,
    contents: [
      {
        role: 'user',
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType,
              data: base64Data,
            },
          },
        ],
      },
    ],
    config: {
      temperature: 0.1,
      maxOutputTokens: 4096,
    },
  });

  return response.text?.trim() || '';
}

/**
 * Intelligent Bulk PYQ Extraction & Classification using Google AI Studio (Gemini).
 */
export async function extractPyqsWithGemini(
  content: string | { imageBuffer: Buffer; mimeType?: string },
  examTrackHint?: 'RTU' | 'GATE' | 'AUTO',
  apiKey?: string,
  model?: string
): Promise<any> {
  const key = getEffectiveApiKey(apiKey);
  if (!key) {
    throw new Error('Google AI Studio API Key is required for intelligent PYQ ingestion.');
  }

  const selectedModel = normalizeGeminiModel(model || getAiSettings().selectedModel);
  const ai = getGeminiClient(key);

  const prompt = `You are an expert academic paper classifier and digitizer for MECHSTUDY OS.
Your task is to analyze this previous year question paper (PYQ) document and parse all questions into structured JSON.

CRITICAL INSTRUCTIONS:
1. Detect Exam Track:
   - "RTU" for Rajasthan Technical University Kota B.Tech exams (features Part A, Part B, Part C, Semester terms, Main/Back).
   - "GATE" for Graduate Aptitude Test in Engineering (features General Aptitude, Engineering Mathematics, Mechanical Engineering, 1-mark & 2-mark MCQs/MSQs/NATs).
   ${examTrackHint && examTrackHint !== 'AUTO' ? `Note: User provided preferred hint: "${examTrackHint}".` : ''}

2. Detect Subject, Year, Paper Code:
   - Identify Subject Name (e.g. "Mechanics of Solids", "Engineering Thermodynamics", "Fluid Mechanics", "Theory of Machines", etc.)
   - Identify Exam Year (e.g. 2024, 2023, 2022, etc.).

3. Extract each question faithfully:
   - Use standard LaTeX math in $...$ for inline expressions (e.g. $\\sigma = \\frac{My}{I}$) and $$...$$ for display equations.
   - For GATE: parse 'type' as 'MCQ' (single choice), 'MSQ' (multiple correct), or 'NAT' (numerical answer type). For NAT, extract answer number or numerical range [min, max].
   - For RTU: parse 'part' as 'Part A' (2-mark short questions), 'Part B' (analytical/numerical), or 'Part C' (long derivation/comprehensive problem).
   - Extract options where available and answer key/solution if present in document.

Return ONLY a valid JSON object matching this schema:
{
  "examTrack": "RTU" | "GATE",
  "subjectName": "string",
  "subjectCode": "string",
  "year": 2023,
  "examTerm": "string",
  "questions": [
    {
      "number": "string or number",
      "part": "Part A" | "Part B" | "Part C",
      "section": "GA" | "EM" | "ME",
      "type": "MCQ" | "MSQ" | "NAT" | "THEORY" | "NUMERICAL",
      "unitNumber": 1,
      "questionText": "string formatted with LaTeX",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "answerKey": "string or option index or NAT value",
      "natRange": [10.5, 11.2],
      "marks": 2,
      "negativeMarks": 0.66,
      "solution": "step-by-step solution if available"
    }
  ]
}`;

  const parts: any[] = [{ text: prompt }];

  if (typeof content === 'string') {
    parts.push({ text: `DOCUMENT CONTENT:\n${content.slice(0, 50000)}` });
  } else {
    parts.push({
      inlineData: {
        mimeType: content.mimeType || 'image/png',
        data: content.imageBuffer.toString('base64'),
      },
    });
  }

  const response = await ai.models.generateContent({
    model: selectedModel,
    contents: [{ role: 'user', parts }],
    config: {
      temperature: 0.1,
      maxOutputTokens: 8192,
      responseMimeType: 'application/json',
    },
  });

  const rawJson = response.text?.trim() || '{}';
  try {
    return JSON.parse(rawJson);
  } catch {
    const match = rawJson.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('Failed to parse structured JSON from AI PYQ extraction response.');
  }
}

/**
 * Generate 1 rigorous theory/conceptual quiz question for Topic Mastery Gate.
 */
export async function generateMasteryQuizWithGemini(
  topicTitle: string,
  subjectName: string,
  examTrack: 'RTU' | 'GATE' = 'RTU',
  apiKey?: string,
  model?: string
): Promise<{
  questionText: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
}> {
  const key = getEffectiveApiKey(apiKey);
  if (!key) {
    throw new Error('Google AI Studio API Key is required to verify topic mastery.');
  }

  const selectedModel = normalizeGeminiModel(model || getAiSettings().selectedModel);
  const ai = getGeminiClient(key);

  const prompt = `You are a strict academic examiner for MECHSTUDY OS.
A student is attempting to mark the following curriculum topic as "Completed":
- Topic: "${topicTitle}"
- Subject: "${subjectName}"
- Exam Track: "${examTrack}"

Generate exactly ONE rigorous, high-quality conceptual/theory verification question testing the core fundamental concept of this topic.
Rules:
1. The question must test deep conceptual understanding, physical insight, or mathematical foundation, not trivial recall.
2. Provide exactly 4 distinct, plausible options (A, B, C, D).
3. Clearly specify the exact correct option string.
4. Provide a thorough, pedagogically sound explanation with LaTeX equations where appropriate.

Return ONLY a valid JSON object:
{
  "questionText": "Question with $LaTeX$ math",
  "options": [
    "Option text A",
    "Option text B",
    "Option text C",
    "Option text D"
  ],
  "correctAnswer": "The exact matching text of the correct option",
  "explanation": "Clear derivation/concept explanation why this is correct and why other options are wrong."
}`;

  const response = await ai.models.generateContent({
    model: selectedModel,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      temperature: 0.3,
      maxOutputTokens: 1500,
      responseMimeType: 'application/json',
    },
  });

  const text = response.text?.trim() || '{}';
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('Failed to parse topic mastery quiz response.');
  }
}

/**
 * Generate RTU Mid-Term or End-Sem Predicted Question Paper with Gemini.
 */
export async function generateRtuPaperWithGemini(
  subjectName: string,
  mode: 'END_SEM' | 'MT1' | 'MT2',
  selectedUnits: Array<{ unitNumber: number; title: string; topics?: string[] }>,
  existingPyqSnippets: string[] = [],
  apiKey?: string,
  model?: string
): Promise<any> {
  const key = getEffectiveApiKey(apiKey);
  if (!key) {
    throw new Error('Google AI Studio API Key is required for RTU Paper Generation.');
  }

  const selectedModel = normalizeGeminiModel(model || getAiSettings().selectedModel);
  const ai = getGeminiClient(key);

  const prompt = `You are the Chief Controller of Examinations for Rajasthan Technical University (RTU) Kota.
Generate an official-format RTU Question Paper for:
- Subject: "${subjectName}"
- Exam Sub-Mode: ${mode === 'END_SEM' ? 'RTU End-Semester Predicted Paper' : mode === 'MT1' ? 'RTU Mid-Term 1 (MT-1) Hybrid Paper' : 'RTU Mid-Term 2 (MT-2) Hybrid Paper'}
- Selected Units: ${JSON.stringify(selectedUnits)}

FORMAT SPECIFICATIONS:
${
  mode === 'END_SEM'
    ? `RTU End-Semester Pattern (Total 80/100 Marks):
- Part A: 10 Short conceptual/formula questions (2 marks each = 20 Marks). Compulsory, 2 from each unit.
- Part B: 7 Analytical / Numerical problems (8 marks each, answer any 5 = 40 Marks).
- Part C: 5 Comprehensive derivations / design problems with internal choices (15 marks each, answer any 2 = 30 Marks).`
    : `RTU Mid-Term Exam Pattern (Total 30 Marks, 90 Minutes):
- Part A: 4 Short questions covering selected units (2 marks each = 8 Marks).
- Part B: 3 Numerical / Analytical problems (4 marks each, answer 2 = 8 Marks).
- Part C: 2 In-depth derivations / design questions (7 marks each, answer 2 = 14 Marks).`
}

${existingPyqSnippets.length > 0 ? `REFERENCE RECURRING RTU PYQS TO INCORPORATE / ADAPT:\n${existingPyqSnippets.slice(0, 10).join('\n---\n')}` : ''}

Use standard LaTeX ($...$ and $$...$$) for all engineering formulas and equations.
Return ONLY valid JSON matching this structure:
{
  "title": "${subjectName} - ${mode === 'END_SEM' ? 'Predicted End-Semester Paper' : mode === 'MT1' ? 'Mid-Term 1 Exam' : 'Mid-Term 2 Exam'}",
  "totalMarks": ${mode === 'END_SEM' ? 100 : 30},
  "durationMinutes": ${mode === 'END_SEM' ? 180 : 90},
  "sections": [
    {
      "name": "Part A",
      "description": "Short answer questions (2 Marks each)",
      "questions": [
        { "number": "1(a)", "text": "Question text", "marks": 2, "unit": 1, "solution": "Model answer / key steps" }
      ]
    },
    {
      "name": "Part B",
      "description": "Analytical / Numerical problems",
      "questions": [
        { "number": "2", "text": "Question text", "marks": ${mode === 'END_SEM' ? 8 : 4}, "unit": 1, "solution": "Step by step numerical solution" }
      ]
    },
    {
      "name": "Part C",
      "description": "Long derivations / Comprehensive problems",
      "questions": [
        { "number": "3", "text": "Derivation text", "marks": ${mode === 'END_SEM' ? 15 : 7}, "unit": 2, "solution": "Full derivation / schematic explanation" }
      ]
    }
  ]
}`;

  const response = await ai.models.generateContent({
    model: selectedModel,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      temperature: 0.2,
      maxOutputTokens: 8192,
      responseMimeType: 'application/json',
    },
  });

  const text = response.text?.trim() || '{}';
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('Failed to parse generated RTU paper response.');
  }
}

/**
 * Evaluate student's written RTU examination answers against university step-marking rubrics.
 */
export async function evaluateRtuAnswersWithGemini(
  subjectName: string,
  paperTitle: string,
  questions: Array<{ number: string; part?: string; questionText: string; marks: number }>,
  studentAnswers: Array<{ questionNumber: string; answerText?: string; imageBase64?: string }>,
  apiKey?: string,
  model?: string
): Promise<any> {
  const key = getEffectiveApiKey(apiKey);
  if (!key) {
    throw new Error('Google AI Studio API Key is required to evaluate answers.');
  }

  const selectedModel = normalizeGeminiModel(model || getAiSettings().selectedModel);
  const ai = getGeminiClient(key);

  const prompt = `You are a strict, veteran professor and university evaluator at Rajasthan Technical University (RTU), Kota.
You are evaluating a student's answer sheet for the paper: "${paperTitle}" in "${subjectName}".

RTU OFFICIAL STEP-MARKING RUBRIC:
- 1. Formula & Governing Equations (approx 25% weightage): Correct formula with standard variable definitions.
- 2. Step-by-Step Derivation / Analytical Working (approx 40% weightage): Clear substitution, logical progression, intermediate values.
- 3. Diagram & Schematic Representation (approx 20% weightage): Neat labeled sketches, free body diagrams, or state diagrams where applicable.
- 4. Final Result & Units (approx 15% weightage): Correct magnitude, correct SI units, and boxed answer.

STUDENT ANSWERS TO EVALUATE:
${JSON.stringify(studentAnswers, null, 2)}

OFFICIAL QUESTIONS:
${JSON.stringify(questions, null, 2)}

CRITICAL INSTRUCTIONS:
- Grade every attempted question strictly according to the marks allocated.
- For non-attempted questions, award 0 marks.
- Award partial marks fairly based on the 4 rubric criteria.
- Provide constructive, detailed feedback for each question highlighting where marks were lost.

Return ONLY a JSON object matching this schema:
{
  "totalScore": 68,
  "maxScore": 100,
  "overallGrade": "A" | "B" | "C" | "D" | "F",
  "keyStrengths": ["string", "string"],
  "improvementAreas": ["string", "string"],
  "evaluations": [
    {
      "questionNumber": "string",
      "marksAwarded": 6.5,
      "maxMarks": 8,
      "rubricBreakdown": {
        "formulaMarks": 2,
        "stepMarks": 3,
        "diagramMarks": 1,
        "finalAnswerMarks": 0.5
      },
      "feedback": "string explaining marks breakdown and errors",
      "modelAnswerSummary": "string highlighting ideal steps/formulas"
    }
  ]
}`;

  const parts: any[] = [{ text: prompt }];

  // Attach any uploaded handwritten answer sheet images
  for (const ans of studentAnswers) {
    if (ans.imageBase64) {
      const cleanBase64 = ans.imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');
      parts.push({
        inlineData: {
          mimeType: 'image/jpeg',
          data: cleanBase64,
        },
      });
    }
  }

  const response = await ai.models.generateContent({
    model: selectedModel,
    contents: [{ role: 'user', parts }],
    config: {
      temperature: 0.1,
      maxOutputTokens: 8192,
      responseMimeType: 'application/json',
    },
  });

  const rawJson = response.text?.trim() || '{}';
  try {
    return JSON.parse(rawJson);
  } catch {
    const match = rawJson.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('Failed to parse structured answer evaluation response from AI.');
  }
}

/**
 * Generate an authentic GATE-level NAT practice numerical for a specific formula.
 */
export async function generateFormulaPracticeNumerical(
  formulaTitle: string,
  latex: string,
  subject: string,
  variables: Array<{ symbol: string; name: string }>,
  apiKey?: string,
  model?: string
): Promise<any> {
  const key = getEffectiveApiKey(apiKey);
  if (!key) {
    throw new Error('Google AI Studio API Key is required to generate practice numerical.');
  }

  const selectedModel = normalizeGeminiModel(model || getAiSettings().selectedModel);
  const ai = getGeminiClient(key);

  const prompt = `You are a Senior GATE Mechanical Engineering Professor and test-setter.
Create an authentic, challenging GATE-level NAT (Numerical Answer Type) problem testing this specific formula:
- Formula Name: "${formulaTitle}"
- Formula LaTeX: $$${latex}$$
- Subject: "${subject}"
- Key Variables: ${JSON.stringify(variables)}

REQUIREMENTS:
1. The question MUST test actual mechanical engineering understanding (thermodynamics, fluid mechanics, SOM, or machine design).
2. Include realistic engineering values and tricky unit traps (e.g., mixing MPa and kPa, mm and m, Celsius and Kelvin, rpm and rad/s).
3. The numerical answer must be precise and unambiguous.
4. Clearly state the required unit and rounding (e.g. "round off to 2 decimal places").
5. Provide a step-by-step KaTeX derivation/solution showing where students commonly make unit conversion errors.

Respond with ONLY valid JSON:
{
  "question": "Full question statement with all given values and units...",
  "givenValues": { "key": "value" },
  "formulaTested": "${formulaTitle}",
  "correctAnswer": 12.34,
  "tolerance": 0.5,
  "unit": "kW",
  "unitTraps": ["Mixing °C with K in Carnot calculation", "Failing to divide diameter by 1000 for mm to m"],
  "stepByStepSolution": "Step 1: ... \\nStep 2: ... \\nFinal Answer = ..."
}`;

  const response = await ai.models.generateContent({
    model: selectedModel,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      temperature: 0.2,
      maxOutputTokens: 2048,
      responseMimeType: 'application/json',
    },
  });

  const rawJson = response.text?.trim() || '{}';
  try {
    return JSON.parse(rawJson);
  } catch {
    const match = rawJson.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('Failed to parse formula numerical response from AI.');
  }
}

export interface ExamQuestionCoachingRequest {
  questionNumber: number | string;
  questionText: string;
  type?: string;
  options?: string[];
  correctAnswer: string;
  userAnswer?: string;
  isCorrect: boolean;
  solution?: string;
  marks?: number;
}

export interface ExamQuestionCoachingResult {
  diagnosis: string;
  stepByStepSolution: string;
  shortcutOrSpeedTrick: string;
  optionsBreakdown: Array<{ option: string; analysis: string; isTrap?: boolean }>;
  keyTakeaway: string;
}

export async function coachExamQuestionWithGemini(
  data: ExamQuestionCoachingRequest
): Promise<ExamQuestionCoachingResult> {
  const key = getEffectiveApiKey();
  if (!key) {
    throw new Error('Google AI Studio API Key is required for exam coaching.');
  }

  const selectedModel = normalizeGeminiModel(getAiSettings().selectedModel);
  const ai = getGeminiClient(key);

  const optionsText = data.options && data.options.length
    ? `Options:\n${data.options.map((opt, i) => `${String.fromCharCode(65 + i)}) ${opt}`).join('\n')}`
    : '';

  const prompt = `You are an elite GATE & Mechanical Engineering Professor and Exam Coach.
Analyze the following exam question and provide deep active-learning coaching for a student:

Question #${data.questionNumber} (${data.type || 'MCQ'}, Marks: ${data.marks || 1}):
${data.questionText}

${optionsText}

Official Correct Answer: ${data.correctAnswer}
Student's Submitted Answer: ${data.userAnswer || 'Unattempted'}
Outcome: ${data.isCorrect ? 'CORRECT (Focus on speed, shortcuts & exam tricks)' : 'WRONG/MISSED (Diagnose misconception, option traps & step-by-step fix)'}
${data.solution ? `Reference Solution:\n${data.solution}` : ''}

Instructions:
1. "diagnosis": Concise diagnosis. If wrong, pinpoint the exact trap/misconception. If right, explain why this concept is critical in GATE and celebrate efficiency.
2. "stepByStepSolution": Clean markdown with KaTeX math ($...$ inline, $$...$$ block) showing the first-principles derivation.
3. "shortcutOrSpeedTrick": Crucial GATE shortcut (e.g. dimensional check, limits/boundary test, symmetry, or quick ratio) to solve in <45s.
4. "optionsBreakdown": Array of objects for each option explaining why it is correct or incorrect, and why examiners chose that distractor as a trap.
5. "keyTakeaway": Single high-yield sentence rule to remember.

Return strictly valid JSON matching this schema:
{
  "diagnosis": "...",
  "stepByStepSolution": "...",
  "shortcutOrSpeedTrick": "...",
  "optionsBreakdown": [
    { "option": "A", "analysis": "...", "isTrap": false }
  ],
  "keyTakeaway": "..."
}`;

  const response = await ai.models.generateContent({
    model: selectedModel,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      temperature: 0.2,
      maxOutputTokens: 2048,
      responseMimeType: 'application/json',
    },
  });

  const rawJson = response.text?.trim() || '{}';
  try {
    return JSON.parse(rawJson);
  } catch {
    const match = rawJson.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('Failed to parse coaching response from AI.');
  }
}

/* ---------------- AI Viva-Voce & Technical Interview Simulator ---------------- */

export interface VivaStartRequest {
  track: 'RTU_LAB' | 'GATE_PSU_INTERVIEW';
  subjectOrLab: string;
  difficulty?: 'basic' | 'moderate' | 'rigorous';
}

export interface VivaStartResult {
  openingGreeting: string;
  initialQuestion: string;
  contextNotes: string;
}

export interface VivaEvaluationRequest {
  track: 'RTU_LAB' | 'GATE_PSU_INTERVIEW';
  subjectOrLab: string;
  questionHistory: Array<{ question: string; studentAnswer: string; score?: number }>;
  currentQuestion: string;
  studentAnswer: string;
}

export interface VivaEvaluationResult {
  score: number;
  verdict: 'Excellent' | 'Good' | 'Needs Improvement' | 'Incorrect';
  strengths: string[];
  missedConcepts: string[];
  modelAnswer: string;
  examinerFeedback: string;
  followUpQuestion: string;
  isSessionFinished?: boolean;
}

const FALLBACK_VIVA_STARTERS: Record<string, { greeting: string; question: string; notes: string }> = {
  'Materials Testing Lab': {
    greeting: "Good morning candidate. Welcome to the Materials Testing practical examination. Let us begin with experimental fundamentals.",
    question: "During a standard tensile test on a Mild Steel specimen on a UTM, why does the stress-strain curve exhibit distinct Upper and Lower Yield Points, and what physical dislocation phenomenon causes this?",
    notes: "Focus on Cottrell atmosphere, interstitial carbon/nitrogen pin-up of dislocations, and Lüders band formation."
  },
  'Fluid Mechanics Lab': {
    greeting: "Welcome to the Fluid Mechanics and Hydraulic Machines viva panel. Let us start with flow measurement devices.",
    question: "Between an Orifice Meter and a Venturi Meter, why is the coefficient of discharge (Cd) of a Venturi meter (~0.98) significantly higher than that of an Orifice meter (~0.62)?",
    notes: "Explain gradual divergent cone preventing boundary layer separation vs sudden contraction/expansion with vena contracta and eddy dissipation."
  },
  'Heat Transfer Lab': {
    greeting: "Welcome to the Thermal Engineering and Heat Transfer practical examination.",
    question: "In transient heat conduction, what is the physical significance of the Biot Number, and why must Bi < 0.1 for lumped capacitance heat transfer analysis to be valid?",
    notes: "Biot number is the ratio of internal conduction resistance to external convection resistance. Bi < 0.1 means internal temperature gradients are negligible."
  },
  'Engineering Thermodynamics': {
    greeting: "Welcome to the PSU / BARC Mechanical Engineering technical interview panel.",
    question: "Can entropy of a closed system decrease during an actual process? Differentiate clearly between entropy change of the system (dS), entropy transfer across boundaries (dQ/T), and entropy generation (S_gen).",
    notes: "dS = dQ/T + S_gen. For heat rejection, dQ/T < 0; if |dQ/T| > S_gen, system entropy decreases, while total entropy of the universe always increases."
  },
  'Mechanics of Solids': {
    greeting: "Welcome to the Technical Interview panel. Let us evaluate your structural mechanics foundation.",
    question: "What is the physical meaning of Mohr's Circle pole point? How does the state of pure shear relate to equal and opposite principal stresses inclined at 45 degrees?",
    notes: "Pure shear on orthogonal planes corresponds to a Mohr's circle centered at the origin (sigma_avg = 0), yielding sigma1 = tau and sigma2 = -tau at 45 deg."
  }
};

export async function startVivaSessionWithGemini(
  req: VivaStartRequest,
  apiKey?: string,
  model?: string
): Promise<VivaStartResult> {
  const key = getEffectiveApiKey(apiKey);
  if (!key) {
    const fallback = FALLBACK_VIVA_STARTERS[req.subjectOrLab] || FALLBACK_VIVA_STARTERS['Engineering Thermodynamics'];
    return {
      openingGreeting: fallback.greeting,
      initialQuestion: fallback.question,
      contextNotes: fallback.notes,
    };
  }

  const selectedModel = normalizeGeminiModel(model || getAiSettings().selectedModel);
  const ai = getGeminiClient(key);

  const persona = req.track === 'RTU_LAB'
    ? 'Strict, authoritative RTU External Practical Examiner conducting an engineering laboratory viva-voce'
    : 'Senior Scientist / Director on a BARC / PSU / IIT M.Tech Technical Interview Board';

  const prompt = `You are a ${persona} for Mechanical Engineering.
Topic/Subject/Lab: "${req.subjectOrLab}".
Difficulty Level: ${req.difficulty || 'moderate'}.

Generate an opening formal greeting and ONE sharp, fundamental technical question to test the student's core conceptual and practical understanding.

Return STRICT JSON with schema:
{
  "openingGreeting": "Formal examiner greeting welcoming student to practical viva/interview...",
  "initialQuestion": "The first technical question testing deep physical understanding or experiment principle...",
  "contextNotes": "Key physical concepts, formulas, or standard assumptions expected in an ideal answer..."
}`;

  try {
    const res = await ai.models.generateContent({
      model: selectedModel,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        temperature: 0.3,
        maxOutputTokens: 1024,
        responseMimeType: 'application/json',
      },
    });
    const raw = res.text?.trim() || '{}';
    return JSON.parse(raw);
  } catch {
    const fallback = FALLBACK_VIVA_STARTERS[req.subjectOrLab] || FALLBACK_VIVA_STARTERS['Engineering Thermodynamics'];
    return {
      openingGreeting: fallback.greeting,
      initialQuestion: fallback.question,
      contextNotes: fallback.notes,
    };
  }
}

export async function evaluateVivaAnswerWithGemini(
  req: VivaEvaluationRequest,
  apiKey?: string,
  model?: string
): Promise<VivaEvaluationResult> {
  const key = getEffectiveApiKey(apiKey);
  if (!key) {
    // Offline heuristic fallback evaluation
    const len = req.studentAnswer?.trim().length || 0;
    const score = len > 80 ? 7.5 : len > 30 ? 5.5 : 3.0;
    return {
      score,
      verdict: score >= 7 ? 'Good' : 'Needs Improvement',
      strengths: ['Identified main parameters', 'Direct attempt to answer question'],
      missedConcepts: ['Missing rigorous thermodynamic / experimental assumptions', 'Could state relevant governing equations or units'],
      modelAnswer: 'A comprehensive answer should define the fundamental physical mechanism, state all governing assumptions, and cite the governing equation or experimental standard.',
      examinerFeedback: 'Satisfactory attempt, but clarify your physical reasoning and ensure unit consistency.',
      followUpQuestion: 'Can you state the primary assumptions made in deriving this relationship, and what happens when those assumptions break down in practice?',
      isSessionFinished: req.questionHistory.length >= 4,
    };
  }

  const selectedModel = normalizeGeminiModel(model || getAiSettings().selectedModel);
  const ai = getGeminiClient(key);

  const persona = req.track === 'RTU_LAB'
    ? 'RTU Kota B.Tech Mechanical External Practical Lab Examiner'
    : 'Senior Scientist / Professor on a GATE / PSU / BARC Mechanical Interview Board';

  const historyText = req.questionHistory.map((h, i) =>
    `[Q${i + 1}]: ${h.question}\n[Student A${i + 1}]: ${h.studentAnswer}`
  ).join('\n\n');

  const isFinalRound = req.questionHistory.length >= 4;

  const prompt = `You are a ${persona} for Mechanical Engineering.
Track: ${req.track === 'RTU_LAB' ? 'RTU Practical Lab Viva-Voce' : 'PSU / BARC Technical Interview'}.
Subject / Lab: "${req.subjectOrLab}".

Prior Q&A History:
${historyText || 'None (First question)'}

Current Question: "${req.currentQuestion}"
Student's Verbal Answer: "${req.studentAnswer}"

Evaluate the student's answer strictly yet constructively on:
1. Technical correctness & physical intuition
2. Identification of governing assumptions & boundary conditions
3. Mathematical precision (equations, units, signs)

Then provide:
- Score (1.0 to 10.0)
- Verdict: 'Excellent' | 'Good' | 'Needs Improvement' | 'Incorrect'
- Strengths (1-2 bullet points)
- Missed Concepts / Pitfalls (1-2 bullet points)
- Model Answer (Concise, accurate ideal response in 2-3 sentences)
- Examiner's spoken feedback (as if speaking directly to the candidate in the viva)
- A sharp Follow-Up Question probing deeper into the candidate's understanding (or conclusion if final round)

Return STRICT JSON matching:
{
  "score": 8.0,
  "verdict": "Good",
  "strengths": ["...", "..."],
  "missedConcepts": ["..."],
  "modelAnswer": "...",
  "examinerFeedback": "...",
  "followUpQuestion": "...",
  "isSessionFinished": ${isFinalRound}
}`;

  const res = await ai.models.generateContent({
    model: selectedModel,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      temperature: 0.2,
      maxOutputTokens: 2048,
      responseMimeType: 'application/json',
    },
  });

  const raw = res.text?.trim() || '{}';
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('Failed to parse Viva-Voce evaluation from AI.');
  }
}

/**
 * Generates an intensive Exam Halving Study Plan using Gemini AI (with robust offline fallback).
 * Divides the remaining days until the exam date in half:
 * - Phase 1: Deep, complete coverage of the professor's syllabus & topics
 * - Phase 2: Exam pattern focus, daily midterm papers, timed mocks, and mistake review drills.
 */
export async function generateExamHalvingPlanWithGemini(
  req: ExamHalvingPlanRequest,
  apiKey?: string,
  model?: string
): Promise<ExamHalvingPlanResult> {
  const now = new Date();
  const targetDateStr = req.examDate;
  const targetTimestamp = new Date(targetDateStr).getTime();
  const diffMs = targetTimestamp - now.getTime();
  const totalDays = Math.max(2, Math.round(diffMs / 86400000));
  const phase1Days = Math.ceil(totalDays / 2);
  const phase2Days = totalDays - phase1Days;

  const examName = req.examName?.trim() || 'RTU Midterm Exam';
  const examTime = req.examTime?.trim() || '10:00 AM';
  const dailyMinutes = Math.max(60, req.dailyMinutes || 150);
  const pattern = req.examPattern || 'RTU_MIDTERM';

  // Persist target exam metadata for email dispatches & countdown widgets
  setSetting('exam.targetName', examName);
  setSetting('exam.targetDate', targetDateStr);
  setSetting('exam.targetTime', examTime);

  // Parse professor topics (strictly excluding Technical Communication)
  const rawTopics = (req.professorTopics || '')
    .split(/[\n;]+/)
    .map(t => t.trim().replace(/^[-*•\d.)\s]+/, ''))
    .filter(t => t.length > 2)
    .filter(t => !t.toLowerCase().includes('technical communication'));

  const parsedTopics = rawTopics.length > 0 ? rawTopics : [
    'Unit 1: Stresses, Strains & Elastic Constants',
    'Unit 2: Shear Force and Bending Moment Diagrams (SFD & BMD)',
    'Unit 3: Bending & Shear Stresses in Beams',
    'Unit 4: Torsion of Circular Shafts & Springs',
    'Unit 5: Deflection of Beams & Euler Column Buckling',
  ];

  const key = getEffectiveApiKey(apiKey);
  let schedule: ExamHalvingPlanDaySchedule[] = [];
  let aiGenerated = false;

  if (key) {
    try {
      const selectedModel = normalizeGeminiModel(model || getAiSettings().selectedModel);
      const ai = getGeminiClient(key);

      const prompt = `You are an expert Academic Advisor and Mechanical Engineering Professor creating an intensive exam preparation timetable for a university student.

Exam: "${examName}"
Subject: "${req.subjectName || 'Mechanical Engineering'}"
Exam Date: ${targetDateStr} at ${examTime}
Total Days Remaining: ${totalDays} days.
Daily Study Budget: ${dailyMinutes} minutes/day.
Exam Pattern: ${pattern === 'RTU_MIDTERM' ? 'RTU Midterm Exam (1 Hour: Part A short concept questions 2 marks each, Part B analytical/numerical problems 4 marks each)' : pattern === 'RTU_ENDSEM' ? 'RTU End-Semester Exam (3 Hours: Part A, Part B, Part C)' : 'GATE Examination (Objective & NAT)'}

SYLLABUS / TOPICS PROVIDED BY PROFESSOR:
${parsedTopics.map((t, i) => `${i + 1}. ${t}`).join('\n')}

MANDATORY TIMETABLE HALVING STRATEGY:
1. Divide the ${totalDays} days into exactly two halves:
   - Phase 1 (First ${phase1Days} days, Day 1 to Day ${phase1Days}): DEEP SYLLABUS COVERAGE.
     Distribute all the professor's topics/units across these ${phase1Days} days so the student thoroughly completes the required theory, derivations, formulas, and standard textbook numericals.
   - Phase 2 (Second ${phase2Days} days, Day ${phase1Days + 1} to Day ${totalDays}): EXAM PATTERN & MIDTERM PAPERS.
     Focus strictly on test-taking skills, daily midterm papers/mock drills (e.g. 1-hour RTU timed tests, Part A 2-mark speed runs, Part B 4-mark numericals, mistake analysis, and formula memorization). The final day should be a comprehensive exam rehearsal.
2. Note: Technical Communication is completely excluded. Do NOT mention it.
3. Every day must have 2 to 3 actionable, high-yield tasks with realistic estMinutes summing close to ${dailyMinutes} minutes.

Return STRICT JSON matching this schema:
{
  "schedule": [
    {
      "dayNumber": 1,
      "phase": "PHASE_1",
      "phaseTitle": "Phase 1: Syllabus & Concept Deep-Dive",
      "focusTitle": "Topic name or unit focus for today",
      "tasks": [
        {
          "title": "[Midterm Sprint - Phase 1] Theory & Derivations: ...",
          "priority": "HIGH",
          "estMinutes": 60,
          "notes": "Actionable notes on what concepts, derivations, and textbook chapters to master"
        },
        {
          "title": "[Midterm Sprint - Phase 1] Numerical Problem Solving: ...",
          "priority": "MEDIUM",
          "estMinutes": 50,
          "notes": "Solve 3-5 standard problems from notes/textbooks"
        },
        {
          "title": "[Midterm Sprint - Phase 1] Formula Recall & Flashcards: ...",
          "priority": "MEDIUM",
          "estMinutes": 40,
          "notes": "Verify formulas in Formula Vault and review flashcards"
        }
      ]
    }
  ]
}`;

      const res = await ai.models.generateContent({
        model: selectedModel,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          temperature: 0.2,
          maxOutputTokens: 8192,
          responseMimeType: 'application/json',
        },
      });

      const raw = res.text?.trim() || '{}';
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.schedule) && parsed.schedule.length > 0) {
        schedule = parsed.schedule.map((day: any, idx: number) => {
          const plannedDate = new Date(now.getTime() + idx * 86400000).toISOString().slice(0, 10);
          const isPhase1 = idx < phase1Days;
          return {
            dayNumber: idx + 1,
            plannedDate,
            phase: isPhase1 ? 'PHASE_1' : 'PHASE_2',
            phaseTitle: isPhase1 ? 'Phase 1: Syllabus & Concept Mastery' : 'Phase 2: Exam Pattern & Midterm Papers',
            focusTitle: day.focusTitle || (isPhase1 ? parsedTopics[idx % parsedTopics.length] : `Midterm Mock Paper ${idx - phase1Days + 1}`),
            tasks: Array.isArray(day.tasks) ? day.tasks : [],
          };
        });
        aiGenerated = true;
      }
    } catch {
      // Fall through to algorithmic generation
    }
  }

  // Algorithmic Fallback if AI not available or returned empty
  if (schedule.length === 0) {
    const slot1Min = Math.round(dailyMinutes * 0.45);
    const slot2Min = Math.round(dailyMinutes * 0.35);
    const slot3Min = Math.max(20, dailyMinutes - slot1Min - slot2Min);

    for (let dayIdx = 0; dayIdx < totalDays; dayIdx++) {
      const plannedDate = new Date(now.getTime() + dayIdx * 86400000).toISOString().slice(0, 10);
      const isPhase1 = dayIdx < phase1Days;

      if (isPhase1) {
        // Phase 1: Syllabus Coverage
        const topic = parsedTopics[dayIdx % parsedTopics.length];
        schedule.push({
          dayNumber: dayIdx + 1,
          plannedDate,
          phase: 'PHASE_1',
          phaseTitle: 'Phase 1: Syllabus & Concept Mastery',
          focusTitle: topic,
          tasks: [
            {
              title: `[Midterm Sprint - Phase 1] Theory & Derivations: ${topic}`,
              priority: 'HIGH',
              estMinutes: slot1Min,
              notes: `Master governing equations, assumptions, and physical derivations from handwritten notes.`,
            },
            {
              title: `[Midterm Sprint - Phase 1] Numerical Problem Solving: ${topic}`,
              priority: 'MEDIUM',
              estMinutes: slot2Min,
              notes: `Solve 4-6 textbook numerical problems and verify calculations with the Virtual Calculator.`,
            },
            {
              title: `[Midterm Sprint - Phase 1] Formula Vault & Flashcards: ${topic}`,
              priority: 'MEDIUM',
              estMinutes: slot3Min,
              notes: `Review formula definitions and test active recall with Flashcards.`,
            },
          ],
        });
      } else {
        // Phase 2: Exam Pattern & Midterm Papers
        const mockNum = dayIdx - phase1Days + 1;
        const isFinalDay = dayIdx === totalDays - 1;

        if (isFinalDay) {
          schedule.push({
            dayNumber: dayIdx + 1,
            plannedDate,
            phase: 'PHASE_2',
            phaseTitle: 'Phase 2: Exam Pattern & Midterm Papers',
            focusTitle: 'Final Pre-Exam Rehearsal & Formula Blitz',
            tasks: [
              {
                title: `[Midterm Sprint - Phase 2] Full-Length Mock Exam Rehearsal`,
                priority: 'HIGH',
                estMinutes: slot1Min + slot2Min,
                notes: `Simulate the exact ${pattern} test environment under strict time constraints.`,
              },
              {
                title: `[Midterm Sprint - Phase 2] High-Yield Formula Blitz & Exam Pack Check`,
                priority: 'HIGH',
                estMinutes: slot3Min,
                notes: `Quickly review all high-yield formulas, unit conversion traps, and stationery.`,
              },
            ],
          });
        } else {
          schedule.push({
            dayNumber: dayIdx + 1,
            plannedDate,
            phase: 'PHASE_2',
            phaseTitle: 'Phase 2: Exam Pattern & Midterm Papers',
            focusTitle: `Midterm Mock Paper #${mockNum} & RTU PYQ Drill`,
            tasks: [
              {
                title: `[Midterm Sprint - Phase 2] Timed Mock Paper #${mockNum} (${pattern === 'RTU_MIDTERM' ? 'Part A 2M + Part B 4M' : 'Full Exam'})`,
                priority: 'HIGH',
                estMinutes: slot1Min,
                notes: `Simulate real exam timing. Practice concise step-by-step presentation for maximum marks.`,
              },
              {
                title: `[Midterm Sprint - Phase 2] Post-Exam Error Log & Mistake Notebook Fix`,
                priority: 'MEDIUM',
                estMinutes: slot2Min,
                notes: `Analyze every calculation slip, missed boundary condition, and unit trap.`,
              },
              {
                title: `[Midterm Sprint - Phase 2] RTU High-Frequency PYQ Speed Run`,
                priority: 'MEDIUM',
                estMinutes: slot3Min,
                notes: `Speed-solve repeated previous year questions from the last 5 years.`,
              },
            ],
          });
        }
      }
    }
  }

  // Insert generated tasks into SQLite study_tasks table inside a transaction
  let tasksCreated = 0;
  let totalEstimatedMinutes = 0;

  tx(() => {
    for (const day of schedule) {
      for (const t of day.tasks) {
        createTask({
          title: t.title,
          subjectId: req.subjectId,
          plannedDate: day.plannedDate,
          priority: t.priority,
          estMinutes: t.estMinutes,
          notes: `📅 ${day.phaseTitle} · Day ${day.dayNumber}/${totalDays} (${day.focusTitle})\n${t.notes}`,
          examTarget: pattern === 'GATE' ? 'GATE' : 'RTU',
        });
        tasksCreated++;
        totalEstimatedMinutes += t.estMinutes;
      }
    }
  });

  return {
    examName,
    examDate: targetDateStr,
    examTime,
    totalDays,
    phase1Days,
    phase2Days,
    tasksCreated,
    totalEstimatedMinutes,
    schedule,
    aiGenerated,
  };
}



