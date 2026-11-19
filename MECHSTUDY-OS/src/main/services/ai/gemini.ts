import { GoogleGenAI } from '@google/genai';
import { getAiSettings } from './settings';
import type { ToolDefinition } from './toolRegistry';
import type { AiToolCall } from '../../../shared/types';

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

export function getEffectiveApiKey(explicitKey?: string): string {
  if (explicitKey && explicitKey.trim()) return explicitKey.trim();
  const settingsKey = getAiSettings().apiKey;
  if (settingsKey && settingsKey.trim()) return settingsKey.trim();
  return (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim();
}

/**
 * Validate a Google AI Studio API key by issuing a minimal test generation.
 */
export async function testGeminiApiKey(
  apiKey: string,
  model: string = 'gemini-3.5-flash-lite'
): Promise<{ ok: boolean; model?: string; error?: string }> {
  const key = apiKey.trim();
  if (!key) {
    return { ok: false, error: 'Google AI Studio API Key is empty.' };
  }
  try {
    const ai = new GoogleGenAI({ apiKey: key });
    const response = await ai.models.generateContent({
      model,
      contents: 'Respond with "OK" if this connection test is successful.',
      config: {
        maxOutputTokens: 16,
        temperature: 0.1,
      },
    });
    const text = response?.text?.trim() || 'OK';
    return { ok: true, model: model };
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

  const model = options.model || getAiSettings().selectedModel || 'gemini-3.5-flash-lite';
  const ai = new GoogleGenAI({ apiKey });

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

  const selectedModel = model || getAiSettings().selectedModel || 'gemini-3.5-flash-lite';
  const ai = new GoogleGenAI({ apiKey: key });

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

  const selectedModel = model || getAiSettings().selectedModel || 'gemini-3.5-flash-lite';
  const ai = new GoogleGenAI({ apiKey: key });

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

  const selectedModel = model || getAiSettings().selectedModel || 'gemini-3.5-flash-lite';
  const ai = new GoogleGenAI({ apiKey: key });

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

  const selectedModel = model || getAiSettings().selectedModel || 'gemini-3.5-flash-lite';
  const ai = new GoogleGenAI({ apiKey: key });

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
