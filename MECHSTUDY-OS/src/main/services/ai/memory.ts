import { all, get, run } from '../../db';
import type { AiMemory } from '../../../shared/types';

export function getMemories(category?: string): AiMemory[] {
  const where = category ? 'WHERE category = ?' : '';
  const params = category ? [category] : [];

  const rows = all<any>(`
    SELECT id, key, category, content, source, confidence, created_at, updated_at
    FROM ai_memories
    ${where}
    ORDER BY updated_at DESC
  `, ...params);

  return rows.map(r => ({
    id: r.id,
    key: r.key,
    category: r.category as AiMemory['category'],
    content: r.content,
    source: r.source as AiMemory['source'],
    confidence: r.confidence,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export function saveMemory(
  key: string,
  content: string,
  category: string,
  source: string = 'user',
  confidence: number = 1.0
): void {
  const cleanKey = key.trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '_');
  const cleanContent = content.trim();

  run(`
    INSERT INTO ai_memories (key, category, content, source, confidence, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET
      category = excluded.category,
      content = excluded.content,
      source = excluded.source,
      confidence = excluded.confidence,
      updated_at = datetime('now')
  `, cleanKey, category, cleanContent, source, confidence);
}

export function deleteMemory(id: number): boolean {
  const res = run('DELETE FROM ai_memories WHERE id = ?', id);
  return res.changes > 0;
}

export function formatMemoriesForPrompt(): string {
  const memories = getMemories();
  if (memories.length === 0) return '';

  const lines = ['[ACADEMIC MEMORY & STUDENT CONTEXT]'];
  for (const m of memories) {
    lines.push(`- [${m.category.toUpperCase()}] ${m.key}: ${m.content}`);
  }
  return lines.join('\n');
}
