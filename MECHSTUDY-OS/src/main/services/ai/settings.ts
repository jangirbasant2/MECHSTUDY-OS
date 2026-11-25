import { safeStorage } from 'electron';
import { getSetting, setSetting } from '../../db';
import type { AiSettings } from '../../../shared/types';

const DEFAULT_SYSTEM_PROMPT = `You are MECHSTUDY AI — Personal Academic Brain for MECHSTUDY-OS.
You are a highly capable, rigorous, and patient academic tutor and study planner specialized in:
1. RTU Kota B.Tech Mechanical Engineering curriculum (III semester).
2. GATE Mechanical Engineering preparation (official GATE ME syllabus).
3. Mechanical engineering problem solving, numerical derivations, thermodynamics, strength of materials, fluid mechanics, machine design, theory of machines, manufacturing, and engineering mathematics.

CRITICAL ACADEMIC RULES:
- Never hallucinate formulas, syllabus topics, or exam marking schemes.
- Technical Communication (3ME1-02/4ME1-02) is strictly EXCLUDED from study planning and recommendations.
- When explaining engineering problems, provide clear step-by-step reasoning and use standard LaTeX math (e.g. $E = mc^2$ or $$...$$ for display equations).
- When study documents or page citations are retrieved, reference them accurately. Never invent document citations.
- You can execute real application tools to inspect schedules, create study tasks, check progress, and search notes.`;

export const DEFAULT_AI_SETTINGS: AiSettings = {
  apiKey: '',
  selectedModel: 'gemini-1.5-flash',
  autoOcr: true,
  temperature: 0.7,
  contextLength: 4096,
  maxTokens: 2048,
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  collegeStart: '10:00',
  collegeEnd: '17:00',
  travelMinutes: 20,
  maxDailyStudyHours: 6,
  autoRag: true,
  ragTopK: 4,
};

function isKeyringAvailable(): boolean {
  try {
    return !!safeStorage && typeof safeStorage.isEncryptionAvailable === 'function' && safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

function obfuscateKey(key: string): string {
  // Graceful fallback for environments lacking native OS keyring (e.g. Linux without gnome-keyring / kwallet)
  return 'b64:' + Buffer.from(key, 'utf8').toString('base64');
}

function deobfuscateKey(val: string): string {
  if (val.startsWith('b64:')) {
    try {
      return Buffer.from(val.slice(4), 'base64').toString('utf8');
    } catch {
      return '';
    }
  }
  return val;
}

function secureDecrypt(val: string): string {
  if (!val) return '';
  if (val.startsWith('enc:')) {
    if (isKeyringAvailable()) {
      try {
        const hex = val.slice(4);
        return safeStorage.decryptString(Buffer.from(hex, 'hex'));
      } catch (err) {
        console.warn('[settings] safeStorage decryption failed, attempting fallback:', err);
      }
    }
    // If safeStorage is not available on this platform/session, or failed to decrypt
    return '';
  }
  if (val.startsWith('b64:')) {
    return deobfuscateKey(val);
  }
  return val;
}

function secureEncrypt(key: string): string {
  if (!key) return '';
  if (isKeyringAvailable()) {
    try {
      const encrypted = safeStorage.encryptString(key);
      return 'enc:' + encrypted.toString('hex');
    } catch (err) {
      console.warn('[settings] safeStorage encryption failed, falling back to obfuscation:', err);
    }
  }
  return obfuscateKey(key);
}

export function getAiSettings(): AiSettings {
  const rawKey = getSetting('ai.apiKey', '');
  const decryptedKey = secureDecrypt(rawKey);
  const resolvedKey = decryptedKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || DEFAULT_AI_SETTINGS.apiKey;

  return {
    apiKey: resolvedKey,
    selectedModel: getSetting('ai.selectedModel', DEFAULT_AI_SETTINGS.selectedModel),
    autoOcr: getSetting('ai.autoOcr', 'true') === 'true',
    temperature: parseFloat(getSetting('ai.temperature', String(DEFAULT_AI_SETTINGS.temperature))),
    contextLength: parseInt(getSetting('ai.contextLength', String(DEFAULT_AI_SETTINGS.contextLength)), 10) || 4096,
    maxTokens: parseInt(getSetting('ai.maxTokens', String(DEFAULT_AI_SETTINGS.maxTokens)), 10) || 2048,
    systemPrompt: getSetting('ai.systemPrompt', DEFAULT_AI_SETTINGS.systemPrompt),
    collegeStart: getSetting('ai.collegeStart', DEFAULT_AI_SETTINGS.collegeStart),
    collegeEnd: getSetting('ai.collegeEnd', DEFAULT_AI_SETTINGS.collegeEnd),
    travelMinutes: parseInt(getSetting('ai.travelMinutes', String(DEFAULT_AI_SETTINGS.travelMinutes)), 10) || 20,
    maxDailyStudyHours: parseInt(getSetting('ai.maxDailyStudyHours', String(DEFAULT_AI_SETTINGS.maxDailyStudyHours)), 10) || 6,
    autoRag: getSetting('ai.autoRag', 'true') === 'true',
    ragTopK: parseInt(getSetting('ai.ragTopK', String(DEFAULT_AI_SETTINGS.ragTopK)), 10) || 4,
  };
}

export function updateAiSettings(patch: Partial<AiSettings>): void {
  if (patch.apiKey !== undefined) {
    const trimmed = patch.apiKey.trim();
    const stored = trimmed ? secureEncrypt(trimmed) : '';
    setSetting('ai.apiKey', stored);
  }
  if (patch.selectedModel !== undefined) setSetting('ai.selectedModel', patch.selectedModel.trim());
  if (patch.autoOcr !== undefined) setSetting('ai.autoOcr', patch.autoOcr ? 'true' : 'false');
  if (patch.temperature !== undefined) setSetting('ai.temperature', String(patch.temperature));
  if (patch.contextLength !== undefined) setSetting('ai.contextLength', String(patch.contextLength));
  if (patch.maxTokens !== undefined) setSetting('ai.maxTokens', String(patch.maxTokens));
  if (patch.systemPrompt !== undefined) setSetting('ai.systemPrompt', patch.systemPrompt);
  if (patch.collegeStart !== undefined) setSetting('ai.collegeStart', patch.collegeStart);
  if (patch.collegeEnd !== undefined) setSetting('ai.collegeEnd', patch.collegeEnd);
  if (patch.travelMinutes !== undefined) setSetting('ai.travelMinutes', String(patch.travelMinutes));
  if (patch.maxDailyStudyHours !== undefined) setSetting('ai.maxDailyStudyHours', String(patch.maxDailyStudyHours));
  if (patch.autoRag !== undefined) setSetting('ai.autoRag', patch.autoRag ? 'true' : 'false');
  if (patch.ragTopK !== undefined) setSetting('ai.ragTopK', String(patch.ragTopK));
}
