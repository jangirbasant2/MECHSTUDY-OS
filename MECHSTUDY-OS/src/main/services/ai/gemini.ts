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
