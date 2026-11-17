import { all, get, run, tx } from '../../db';
import type {
  AiConversationSummary,
  AiConversationDetail,
  AiMessage,
  AiCitation,
  AiToolCall,
  AiToolResult,
  AttachedDocumentSummary,
} from '../../../shared/types';
import { getAiSettings } from './settings';
import { cleanupConversationScreenshots } from './temporaryScreenshots';

export function listConversations(mode?: string): AiConversationSummary[] {
  const where = mode ? 'WHERE mode = ?' : '';
  const params = mode ? [mode] : [];

  const rows = all<any>(`
    SELECT c.id, c.title, c.model, c.mode, c.pinned, c.created_at, c.updated_at,
           (SELECT COUNT(*) FROM ai_messages m WHERE m.conversation_id = c.id) as message_count
    FROM ai_conversations c
    ${where}
    ORDER BY c.pinned DESC, c.updated_at DESC
  `, ...params);

  return rows.map(r => ({
    id: r.id,
    title: r.title,
    model: r.model,
    mode: r.mode as 'chat' | 'tutor' | 'planner',
    pinned: Boolean(r.pinned),
    messageCount: r.message_count,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export function createConversation(title?: string, model?: string, mode?: string): AiConversationSummary {
  const settings = getAiSettings();
  const defTitle = title?.trim() || 'New Conversation';
  const defModel = model?.trim() || settings.selectedModel;
  const defMode = mode || 'chat';

  const res = run(`
    INSERT INTO ai_conversations (title, model, mode)
    VALUES (?, ?, ?)
  `, defTitle, defModel, defMode);

  return {
    id: res.lastInsertRowid,
    title: defTitle,
    model: defModel,
    mode: defMode as 'chat' | 'tutor' | 'planner',
    pinned: false,
    messageCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function getConversation(id: number): AiConversationDetail | null {
  const conv = get<any>(`
    SELECT id, title, model, mode, pinned, created_at, updated_at
    FROM ai_conversations
    WHERE id = ?
  `, id);

  if (!conv) return null;

  const messages = getConversationMessages(id);
  const attachedDocuments = getConversationDocuments(id);

  return {
    id: conv.id,
    title: conv.title,
    model: conv.model,
    mode: conv.mode as 'chat' | 'tutor' | 'planner',
    pinned: Boolean(conv.pinned),
    messageCount: messages.length,
    createdAt: conv.created_at,
    updatedAt: conv.updated_at,
    messages,
    attachedDocuments,
  };
}

export function attachDocumentToConversation(conversationId: number, documentId: number): void {
  run(`
    INSERT OR IGNORE INTO ai_conversation_documents (conversation_id, document_id)
    VALUES (?, ?)
  `, conversationId, documentId);
}

export function detachDocumentFromConversation(conversationId: number, documentId: number): void {
  run(`
    DELETE FROM ai_conversation_documents
    WHERE conversation_id = ? AND document_id = ?
  `, conversationId, documentId);
}

export function setConversationDocuments(conversationId: number, documentIds: number[]): AttachedDocumentSummary[] {
  tx(() => {
    run('DELETE FROM ai_conversation_documents WHERE conversation_id = ?', conversationId);
    for (const id of documentIds) {
      if (Number.isFinite(id) && id > 0) {
        run(
          'INSERT OR IGNORE INTO ai_conversation_documents (conversation_id, document_id) VALUES (?, ?)',
          conversationId,
          id
        );
      }
    }
    run("UPDATE ai_conversations SET updated_at = datetime('now') WHERE id = ?", conversationId);
  });
  return getConversationDocuments(conversationId);
}

export function getConversationDocuments(conversationId: number): AttachedDocumentSummary[] {
  const rows = all<any>(`
    SELECT d.id as documentId, d.filename, d.page_count as pageCount,
           d.has_text_layer as hasTextLayer, d.size_bytes as sizeBytes,
           d.subject_id as subjectId, s.name as subjectName,
           (SELECT COUNT(*) FROM document_pages dp WHERE dp.document_id = d.id AND dp.source = 'text_layer') as textPagesIndexed,
           (SELECT COUNT(*) FROM document_pages dp WHERE dp.document_id = d.id AND dp.source = 'ocr') as ocrPagesIndexed,
           (SELECT status FROM ocr_jobs j WHERE j.document_id = d.id ORDER BY j.id DESC LIMIT 1) as ocrStatus,
           (SELECT AVG(confidence) FROM document_pages dp WHERE dp.document_id = d.id AND dp.source = 'ocr') as ocrConfidence
    FROM ai_conversation_documents cd
    JOIN documents d ON d.id = cd.document_id
    LEFT JOIN subjects s ON s.id = d.subject_id
    WHERE cd.conversation_id = ?
    ORDER BY cd.attached_at ASC
  `, conversationId);

  return rows.map(r => {
    const textDone = Number(r.textPagesIndexed || 0);
    const ocrDone = Number(r.ocrPagesIndexed || 0);
    const isReady = (textDone + ocrDone) > 0;
    return {
      documentId: r.documentId,
      filename: r.filename,
      pageCount: r.pageCount || 0,
      hasTextLayer: Boolean(r.hasTextLayer),
      sizeBytes: r.sizeBytes || 0,
      subjectId: r.subjectId,
      subjectName: r.subjectName,
      textPagesIndexed: textDone,
      ocrPagesIndexed: ocrDone,
      ocrStatus: r.ocrStatus || null,
      ocrConfidence: r.ocrConfidence ? Math.round(Number(r.ocrConfidence) * 10) / 10 : null,
      isReady,
    };
  });
}

export function updateConversation(id: number, patch: { title?: string; pinned?: boolean }): boolean {
  const sets: string[] = [];
  const params: unknown[] = [];

  if (patch.title !== undefined) {
    sets.push('title = ?');
    params.push(patch.title.trim() || 'Untitled');
  }
  if (patch.pinned !== undefined) {
    sets.push('pinned = ?');
    params.push(patch.pinned ? 1 : 0);
  }

  if (sets.length === 0) return true;
  sets.push("updated_at = datetime('now')");
  params.push(id);

  const res = run(`UPDATE ai_conversations SET ${sets.join(', ')} WHERE id = ?`, ...params);
  return res.changes > 0;
}

export function deleteConversation(id: number): boolean {
  cleanupConversationScreenshots(id);
  const res = run('DELETE FROM ai_conversations WHERE id = ?', id);
  return res.changes > 0;
}

export function clearConversation(id: number): boolean {
  return tx(() => {
    run('DELETE FROM ai_messages WHERE conversation_id = ?', id);
    run("UPDATE ai_conversations SET updated_at = datetime('now') WHERE id = ?", id);
    return true;
  });
}

export function addMessage(msg: {
  conversationId: number;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCalls?: AiToolCall[];
  toolResults?: AiToolResult[];
  citations?: AiCitation[];
}): AiMessage {
  const toolCallsJson = msg.toolCalls && msg.toolCalls.length ? JSON.stringify(msg.toolCalls) : null;
  const toolResultsJson = msg.toolResults && msg.toolResults.length ? JSON.stringify(msg.toolResults) : null;
  const citationsJson = msg.citations && msg.citations.length ? JSON.stringify(msg.citations) : null;

  return tx(() => {
    const res = run(`
      INSERT INTO ai_messages (conversation_id, role, content, tool_calls_json, tool_results_json, citations_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `, msg.conversationId, msg.role, msg.content, toolCallsJson, toolResultsJson, citationsJson);

    // Auto-update conversation title if it's the first user message
    if (msg.role === 'user') {
      const conv = get<any>('SELECT title FROM ai_conversations WHERE id = ?', msg.conversationId);
      if (conv && conv.title === 'New Conversation') {
        const snippet = msg.content.replace(/\s+/g, ' ').trim().slice(0, 36);
        if (snippet) {
          run('UPDATE ai_conversations SET title = ? WHERE id = ?', snippet, msg.conversationId);
        }
      }
    }

    run("UPDATE ai_conversations SET updated_at = datetime('now') WHERE id = ?", msg.conversationId);

    return {
      id: res.lastInsertRowid,
      conversationId: msg.conversationId,
      role: msg.role,
      content: msg.content,
      toolCalls: msg.toolCalls,
      toolResults: msg.toolResults,
      citations: msg.citations,
      createdAt: new Date().toISOString(),
    };
  });
}

export function getConversationMessages(conversationId: number): AiMessage[] {
  const rows = all<any>(`
    SELECT id, conversation_id, role, content, tool_calls_json, tool_results_json, citations_json, created_at
    FROM ai_messages
    WHERE conversation_id = ?
    ORDER BY id ASC
  `, conversationId);

  return rows.map(r => ({
    id: r.id,
    conversationId: r.conversation_id,
    role: r.role as 'user' | 'assistant' | 'system' | 'tool',
    content: r.content,
    toolCalls: r.tool_calls_json ? safeJsonParse(r.tool_calls_json) : undefined,
    toolResults: r.tool_results_json ? safeJsonParse(r.tool_results_json) : undefined,
    citations: r.citations_json ? safeJsonParse(r.citations_json) : undefined,
    createdAt: r.created_at,
  }));
}

function safeJsonParse(str: string): any {
  try { return JSON.parse(str); } catch { return undefined; }
}
