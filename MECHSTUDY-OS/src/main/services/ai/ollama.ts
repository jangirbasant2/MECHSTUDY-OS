import { spawn, exec } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { getAiSettings } from './settings';
import type { AiEngineStatus, AiModelInfo, AiToolCall } from '../../../shared/types';

export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  tool_calls?: any[];
  images?: string[];
}

export function isVisionModel(modelName: string): boolean {
  if (!modelName) return false;
  const m = modelName.toLowerCase();
  return (
    m.includes('vision') ||
    m.includes('llava') ||
    m.includes('minicpm') ||
    m.includes('moondream') ||
    m.includes('vl') ||
    m.includes('bakllava') ||
    m.includes('mllama')
  );
}

export interface OllamaChatChunk {
  model: string;
  created_at: string;
  message?: {
    role: string;
    content: string;
    thinking?: string;
    tool_calls?: Array<{
      id?: string;
      function?: {
        name: string;
        arguments: Record<string, unknown> | string;
      };
      name?: string;
      arguments?: Record<string, unknown> | string;
    }>;
  };
  done: boolean;
  total_duration?: number;
  eval_count?: number;
}

export async function checkOllamaInstallation(): Promise<{ installed: boolean; path?: string }> {
  const defaultWinPath = join(process.env.LOCALAPPDATA || '', 'Programs', 'Ollama', 'ollama.exe');
  if (existsSync(defaultWinPath)) {
    return { installed: true, path: defaultWinPath };
  }
  return new Promise((resolve) => {
    exec('where.exe ollama', (err, stdout) => {
      if (!err && stdout.trim()) {
        resolve({ installed: true, path: stdout.split(/\r?\n/)[0].trim() });
      } else {
        resolve({ installed: false });
      }
    });
  });
}

export async function startOllamaDaemon(): Promise<{ started: boolean; error?: string; message: string }> {
  const install = await checkOllamaInstallation();
  if (!install.installed) {
    return {
      started: false,
      error: 'Ollama is not installed on this system. Please download and install Ollama from https://ollama.com.',
      message: 'Ollama executable not found.',
    };
  }

  // If already running
  const current = await pingOllama();
  if (current.connected) {
    return { started: true, message: 'Ollama server is already running and connected.' };
  }

  const exePath = install.path || 'ollama';
  try {
    const child = spawn(exePath, ['serve'], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.unref();

    // Poll for up to 6 seconds for server to be responsive
    for (let i = 0; i < 12; i++) {
      await new Promise(r => setTimeout(r, 500));
      const testPing = await pingOllama();
      if (testPing.connected) {
        return { started: true, message: 'Ollama server successfully launched in background.' };
      }
    }

    return {
      started: false,
      error: 'Ollama process was launched, but HTTP endpoint did not respond in 6 seconds.',
      message: 'Server startup timed out',
    };
  } catch (err: any) {
    return { started: false, error: err instanceof Error ? err.message : String(err), message: 'Failed to spawn process' };
  }
}

export async function pingOllama(hostUrl?: string): Promise<AiEngineStatus> {
  const host = (hostUrl || getAiSettings().ollamaHost).replace(/\/+$/, '');
  const install = await checkOllamaInstallation();

  try {
    const versionRes = await fetch(`${host}/api/version`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(3000),
    });

    if (!versionRes.ok) {
      return {
        connected: false,
        installed: install.installed,
        host,
        version: null,
        activeModel: getAiSettings().selectedModel,
        availableModelsCount: 0,
        error: `Ollama returned status ${versionRes.status}: ${versionRes.statusText}`,
      };
    }

    const versionData = (await versionRes.json()) as { version?: string };
    const models = await listOllamaModels(host);
    const activeModel = getAiSettings().selectedModel;

    return {
      connected: true,
      installed: true,
      host,
      version: versionData.version || 'unknown',
      activeModel,
      availableModelsCount: models.length,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      connected: false,
      installed: install.installed,
      host,
      version: null,
      activeModel: getAiSettings().selectedModel,
      availableModelsCount: 0,
      error: message.includes('ECONNREFUSED') || message.includes('fetch failed')
        ? 'Ollama server is not running.'
        : `Connection failed: ${message}`,
    };
  }
}

export async function listOllamaModels(hostUrl?: string): Promise<AiModelInfo[]> {
  const host = (hostUrl || getAiSettings().ollamaHost).replace(/\/+$/, '');
  try {
    const res = await fetch(`${host}/api/tags`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) return [];
    const data = (await res.json()) as {
      models?: Array<{
        name: string;
        model: string;
        size: number;
        modified_at?: string;
        details?: {
          parameter_size?: string;
          family?: string;
          format?: string;
        };
      }>;
    };

    if (!data.models || !Array.isArray(data.models)) return [];

    return data.models.map(m => ({
      name: m.name,
      model: m.model || m.name,
      size: m.size,
      parameterSize: m.details?.parameter_size,
      family: m.details?.family,
      format: m.details?.format,
      modifiedAt: m.modified_at,
    }));
  } catch {
    return [];
  }
}

export async function chatStream(params: {
  messages: OllamaMessage[];
  model?: string;
  tools?: any[];
  temperature?: number;
  contextLength?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  onChunk: (chunk: { delta: string; done: boolean; toolCalls?: AiToolCall[] }) => void;
}): Promise<{
  content: string;
  toolCalls?: AiToolCall[];
  evalCount?: number;
  totalDuration?: number;
}> {
  const settings = getAiSettings();
  const host = settings.ollamaHost.replace(/\/+$/, '');
  const model = params.model || settings.selectedModel;

  const payload: Record<string, unknown> = {
    model,
    messages: params.messages,
    stream: true,
    options: {
      temperature: params.temperature ?? settings.temperature,
      num_ctx: params.contextLength ?? settings.contextLength,
      num_predict: params.maxTokens ?? settings.maxTokens,
    },
  };

  if (params.tools && params.tools.length > 0) {
    payload.tools = params.tools;
  }

  const res = await fetch(`${host}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: params.signal,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Ollama chat error (${res.status} ${res.statusText}): ${errText || 'Inference request failed'}`);
  }

  if (!res.body) {
    throw new Error('No response body received from Ollama');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let fullContent = '';
  const accumulatedToolCalls: AiToolCall[] = [];
  let evalCount = 0;
  let totalDuration = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const parsed = JSON.parse(trimmed) as OllamaChatChunk;
          if (parsed.eval_count) evalCount = parsed.eval_count;
          if (parsed.total_duration) totalDuration = parsed.total_duration;

          const delta = parsed.message?.content || '';
          fullContent += delta;

          // Check for tool calls in chunk
          if (parsed.message?.tool_calls && Array.isArray(parsed.message.tool_calls)) {
            for (let i = 0; i < parsed.message.tool_calls.length; i++) {
              const tc = parsed.message.tool_calls[i];
              const name = tc.function?.name || tc.name;
              let rawArgs = tc.function?.arguments || tc.arguments;
              if (typeof rawArgs === 'string') {
                try { rawArgs = JSON.parse(rawArgs); } catch { rawArgs = {}; }
              }
              if (name) {
                accumulatedToolCalls.push({
                  id: tc.id || `call_${Date.now()}_${i}`,
                  name,
                  arguments: (rawArgs as Record<string, unknown>) || {},
                });
              }
            }
          }

          params.onChunk({
            delta,
            done: parsed.done,
            toolCalls: accumulatedToolCalls.length > 0 ? accumulatedToolCalls : undefined,
          });
        } catch {
          // ignore chunk parse errors
        }
      }
    }

    // Flush any remaining buffer
    if (buffer.trim()) {
      try {
        const parsed = JSON.parse(buffer.trim()) as OllamaChatChunk;
        if (parsed.message?.content) {
          fullContent += parsed.message.content;
          params.onChunk({ delta: parsed.message.content, done: true });
        }
      } catch { /* ignore */ }
    }
  } finally {
    reader.releaseLock();
  }

  return {
    content: fullContent,
    toolCalls: accumulatedToolCalls.length > 0 ? accumulatedToolCalls : undefined,
    evalCount,
    totalDuration,
  };
}

export async function generateEmbedding(text: string, modelName?: string): Promise<number[] | null> {
  const settings = getAiSettings();
  const host = settings.ollamaHost.replace(/\/+$/, '');
  const model = modelName || settings.embeddingModel;

  try {
    const res = await fetch(`${host}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: text }),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) return null;
    const data = (await res.json()) as { embedding?: number[] };
    return data.embedding || null;
  } catch {
    return null;
  }
}
