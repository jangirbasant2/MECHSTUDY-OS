import { all, get, run } from '../../db';
import {
  listTasks, createTask, updateTask, deleteTask,
  startSession, endSession, tickSession, deleteSession, updateSession, getSession, listSessions, analyticsSummary,
  topicProgressMap, setTopicProgress
} from '../study';
import { progressSummary } from '../syllabus';
import { search } from '../search';
import { listQuestions, listMistakes } from '../practice';
import { listExamSessions } from '../exam';
import { getAiSettings } from './settings';
import { getConversationDocuments, attachDocumentToConversation } from './chat';
import { analyzeDocumentForTopic, getDocumentProcessingStatus } from './documentProcessor';

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

export interface ToolExecutionResult {
  toolName: string;
  result?: unknown;
  error?: string;
  confirmationRequired?: boolean;
}

export type NotificationListener = (event: 'planner:refresh' | 'session:update', data?: any) => void;

export class ToolRegistry {
  private static instance: ToolRegistry;
  private listeners: NotificationListener[] = [];

  public static getInstance(): ToolRegistry {
    if (!ToolRegistry.instance) {
      ToolRegistry.instance = new ToolRegistry();
    }
    return ToolRegistry.instance;
  }

  public onNotification(listener: NotificationListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notify(event: 'planner:refresh' | 'session:update', data?: any): void {
    for (const l of this.listeners) {
      try {
        l(event, data);
      } catch {
        // ignore callback errors
      }
    }
  }

  public getToolDefinitions(): ToolDefinition[] {
    return [
      /* ---------- STUDY PLANNER & SESSIONS ---------- */
      {
        type: 'function',
        function: {
          name: 'create_study_plan',
          description: 'Create a structured, multi-session study plan for a subject and topic for today or a specific date. Automatically resolves subject and topic against syllabus, checks conflicts against college hours (10:00-17:00), breaks the topic into manageable sessions, and saves them to the application database so they appear immediately in the Planner.',
          parameters: {
            type: 'object',
            properties: {
              subjectName: {
                type: 'string',
                description: 'Subject name or code (e.g. "Thermodynamics", "Engineering Thermodynamics", "3ME4-05", "Mechanics of Solids").',
              },
              topicName: {
                type: 'string',
                description: 'Topic to master (e.g. "Entropy", "Second Law of Thermodynamics", "Mohr\'s Circle").',
              },
              documentId: {
                type: 'number',
                description: 'Optional ID of a specific study PDF from library or attached materials to base this plan on.',
              },
              plannedDate: {
                type: 'string',
                description: 'Target date in YYYY-MM-DD format. Defaults to today.',
              },
              totalMinutes: {
                type: 'number',
                description: 'Total desired study duration in minutes (e.g. 90, 120, 180). Default 120.',
              },
              sessionCount: {
                type: 'number',
                description: 'Number of structured study sessions to break the topic into (e.g. 2, 3, or 4). Default 3.',
              },
              examTarget: {
                type: 'string',
                enum: ['RTU', 'GATE', 'BOTH'],
                description: 'Exam target. Defaults to RTU.',
              },
              sessions: {
                type: 'array',
                description: 'Optional custom list of sessions to schedule.',
                items: {
                  type: 'object',
                  properties: {
                    title: { type: 'string', description: 'Session title' },
                    estMinutes: { type: 'number', description: 'Duration in minutes' },
                    focus: { type: 'string', description: 'Concepts or problems covered in this session' },
                  },
                  required: ['title', 'estMinutes'],
                },
              },
            },
            required: ['subjectName', 'topicName'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'add_study_session',
          description: 'Add a single scheduled study session or task to the Planner module.',
          parameters: {
            type: 'object',
            properties: {
              subjectName: { type: 'string', description: 'Subject name or code.' },
              title: { type: 'string', description: 'Session title.' },
              topicName: { type: 'string', description: 'Optional topic name.' },
              plannedDate: { type: 'string', description: 'Target date (YYYY-MM-DD). Defaults to today.' },
              durationMinutes: { type: 'number', description: 'Duration in minutes (default 45).' },
              priority: { type: 'string', enum: ['HIGH', 'MEDIUM', 'LOW'], description: 'Priority.' },
              examTarget: { type: 'string', enum: ['RTU', 'GATE', 'BOTH'], description: 'Exam objective.' },
              notes: { type: 'string', description: 'Session notes or focus.' },
            },
            required: ['title'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_study_plan',
          description: 'Retrieve the study plan and scheduled sessions for a date or subject, including AI-created plans.',
          parameters: {
            type: 'object',
            properties: {
              date: { type: 'string', description: 'Date in YYYY-MM-DD format. Defaults to today.' },
              subjectName: { type: 'string', description: 'Optional subject filter.' },
            },
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_session_history',
          description: 'Get recorded study session history (past study intervals with actual durations, subjects, topics, and date filters like today, yesterday, week, month, or all).',
          parameters: {
            type: 'object',
            properties: {
              range: {
                type: 'string',
                enum: ['today', 'yesterday', 'week', 'month', 'all'],
                description: 'Time range filter. Defaults to today.',
              },
              subjectName: {
                type: 'string',
                description: 'Optional subject name or code filter.',
              },
              limit: {
                type: 'number',
                description: 'Maximum sessions to return (default 20).',
              },
            },
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_session_details',
          description: 'Get full details of a specific recorded study session by its ID.',
          parameters: {
            type: 'object',
            properties: {
              sessionId: { type: 'number', description: 'ID of the study session.' },
            },
            required: ['sessionId'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'update_study_session',
          description: 'Update an existing recorded study session or planned task (correct subject, topic, date, start time, end time, duration, or notes). Automatically recalculates duration and updates statistics.',
          parameters: {
            type: 'object',
            properties: {
              sessionId: { type: 'number', description: 'ID of the recorded study session to update.' },
              taskId: { type: 'number', description: 'Optional task ID if updating a planned task.' },
              subjectName: { type: 'string', description: 'Subject name or code.' },
              topicName: { type: 'string', description: 'Topic name.' },
              date: { type: 'string', description: 'Date in YYYY-MM-DD format.' },
              startTime: { type: 'string', description: 'Start time (e.g. "09:30" or ISO).' },
              endTime: { type: 'string', description: 'End time (e.g. "11:00" or ISO).' },
              durationMinutes: { type: 'number', description: 'Actual study duration in minutes.' },
              notes: { type: 'string', description: 'Updated notes.' },
            },
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'delete_study_session',
          description: 'Delete an accidentally started, stopped, duplicate, or unwanted study session from history. If confirmed=false, returns session details for user confirmation. If confirmed=true, deletes from SQLite and immediately recalculates daily/weekly study hours.',
          parameters: {
            type: 'object',
            properties: {
              sessionId: { type: 'number', description: 'ID of the study session to delete.' },
              lastSession: { type: 'boolean', description: 'Set to true to target the most recent study session.' },
              taskId: { type: 'number', description: 'Optional task ID if deleting a planned task.' },
              confirmed: { type: 'boolean', description: 'Must be true to perform the deletion.' },
            },
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_active_session',
          description: 'Get the currently running study session or active timer status.',
          parameters: {
            type: 'object',
            properties: {},
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'stop_study_session',
          description: 'Stop the active study session and save the duration without marking topic completed.',
          parameters: {
            type: 'object',
            properties: {
              sessionId: { type: 'number', description: 'Optional session ID. If omitted, stops current running session.' },
              notes: { type: 'string', description: 'Optional session notes.' },
            },
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'recalculate_study_statistics',
          description: 'Recalculate and return total study hours for today, this week, this month, streak, and subject breakdown.',
          parameters: {
            type: 'object',
            properties: {},
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'start_study_session',
          description: 'Start an active study session and launch the study timer in MECHSTUDY-OS for a planned task or topic.',
          parameters: {
            type: 'object',
            properties: {
              taskId: { type: 'number', description: 'ID of the task to start.' },
              subjectName: { type: 'string', description: 'Optional subject name if starting next session.' },
              topicName: { type: 'string', description: 'Optional topic name if starting by topic.' },
            },
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'complete_study_session',
          description: 'Mark a study session as completed, record study duration, and update topic academic progress.',
          parameters: {
            type: 'object',
            properties: {
              taskId: { type: 'number', description: 'ID of the task to complete.' },
              topicId: { type: 'number', description: 'Optional topic ID to mark completed.' },
              actualMinutes: { type: 'number', description: 'Actual study duration in minutes.' },
              notes: { type: 'string', description: 'Session notes.' },
            },
          },
        },
      },

      /* ---------- SCHEDULING (LEGACY ALIASES) ---------- */
      {
        type: 'function',
        function: {
          name: 'get_today_schedule',
          description: 'Get study tasks and commitments scheduled for today.',
          parameters: {
            type: 'object',
            properties: {
              date: {
                type: 'string',
                description: 'Optional ISO date string (YYYY-MM-DD). Defaults to today.',
              },
            },
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_week_schedule',
          description: 'Get study tasks scheduled for the next 7 days.',
          parameters: {
            type: 'object',
            properties: {
              startDate: {
                type: 'string',
                description: 'Optional start date (YYYY-MM-DD). Defaults to today.',
              },
            },
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'create_task',
          description: 'Create a new study task or scheduled study session for a subject or topic.',
          parameters: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'Title of the study task.' },
              plannedDate: { type: 'string', description: 'Target date (YYYY-MM-DD).' },
              estMinutes: { type: 'number', description: 'Estimated study duration in minutes (default 45).' },
              priority: { type: 'string', enum: ['HIGH', 'MEDIUM', 'LOW'], description: 'Task priority.' },
              examTarget: { type: 'string', enum: ['RTU', 'GATE'], description: 'Exam objective.' },
              subjectName: { type: 'string', description: 'Optional subject name to link with.' },
              notes: { type: 'string', description: 'Optional task notes or instructions.' },
            },
            required: ['title'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'update_task',
          description: 'Update an existing study task (mark completed, change priority or notes).',
          parameters: {
            type: 'object',
            properties: {
              taskId: { type: 'number', description: 'ID of the task to update.' },
              status: { type: 'string', enum: ['pending', 'in_progress', 'done', 'cancelled'] },
              priority: { type: 'string', enum: ['HIGH', 'MEDIUM', 'LOW'] },
              notes: { type: 'string' },
            },
            required: ['taskId'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'delete_task',
          description: 'Delete a study task by its ID (requires confirmation).',
          parameters: {
            type: 'object',
            properties: {
              taskId: { type: 'number', description: 'ID of the task to delete.' },
              confirmed: { type: 'boolean', description: 'Set true if user confirmed deletion.' },
            },
            required: ['taskId'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'reschedule_task',
          description: 'Reschedule a study task to a different date.',
          parameters: {
            type: 'object',
            properties: {
              taskId: { type: 'number', description: 'ID of the task to reschedule.' },
              newDate: { type: 'string', description: 'New target date (YYYY-MM-DD).' },
            },
            required: ['taskId', 'newDate'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'check_schedule_conflicts',
          description: 'Check whether a proposed study time slot conflicts with existing tasks or college hours.',
          parameters: {
            type: 'object',
            properties: {
              date: { type: 'string', description: 'Target date (YYYY-MM-DD).' },
              durationMinutes: { type: 'number', description: 'Proposed study duration in minutes.' },
            },
            required: ['date', 'durationMinutes'],
          },
        },
      },

      /* ---------- ACADEMIC PROGRESS ---------- */
      {
        type: 'function',
        function: {
          name: 'get_study_progress',
          description: 'Get overall academic syllabus completion progress for RTU and GATE.',
          parameters: {
            type: 'object',
            properties: {
              examTarget: { type: 'string', enum: ['RTU', 'GATE', 'ALL'] },
            },
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'update_study_progress',
          description: 'Mark a syllabus topic as completed or updated.',
          parameters: {
            type: 'object',
            properties: {
              topicId: { type: 'number', description: 'ID of the topic.' },
              status: { type: 'string', enum: ['not_started', 'learning', 'completed', 'mastered'] },
              confidence: { type: 'number', description: 'Confidence level 1 to 5.' },
            },
            required: ['topicId', 'status'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_completed_topics',
          description: 'Retrieve a list of syllabus topics that the student has marked completed.',
          parameters: {
            type: 'object',
            properties: {
              limit: { type: 'number', description: 'Maximum topics to return (default 20).' },
            },
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_pending_topics',
          description: 'Retrieve pending topics that still need to be studied, prioritized by exam weight.',
          parameters: {
            type: 'object',
            properties: {
              subjectName: { type: 'string', description: 'Optional subject filter.' },
              limit: { type: 'number', description: 'Maximum topics to return (default 20).' },
            },
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_weak_topics',
          description: 'Retrieve topics where the student has recorded mistakes or low practice accuracy.',
          parameters: {
            type: 'object',
            properties: {
              limit: { type: 'number', description: 'Maximum topics to return (default 10).' },
            },
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_subject_progress',
          description: 'Get detailed syllabus and progress breakdown for a specific subject.',
          parameters: {
            type: 'object',
            properties: {
              subjectName: { type: 'string', description: 'Name or code of the subject.' },
            },
            required: ['subjectName'],
          },
        },
      },

      /* ---------- DOCUMENTS & NOTES ---------- */
      {
        type: 'function',
        function: {
          name: 'search_notes',
          description: 'Search handwritten notes, textbook pages, sticky notes, and syllabus for keywords.',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Keywords to search for.' },
              limit: { type: 'number', description: 'Max results (default 10).' },
            },
            required: ['query'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'retrieve_document_content',
          description: 'Retrieve the extracted text content of a specific document page.',
          parameters: {
            type: 'object',
            properties: {
              documentId: { type: 'number', description: 'ID of the document.' },
              page: { type: 'number', description: 'Page number (1-based).' },
            },
            required: ['documentId', 'page'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_document_details',
          description: 'Get details about a study document PDF in the library.',
          parameters: {
            type: 'object',
            properties: {
              documentId: { type: 'number', description: 'ID of the document.' },
            },
            required: ['documentId'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'attach_study_material',
          description: 'Attach a PDF document from the study library to the current AI conversation so the AI can use its text and page references.',
          parameters: {
            type: 'object',
            properties: {
              documentId: { type: 'number', description: 'ID of the document in the library.' },
              filename: { type: 'string', description: 'Optional filename or partial name to match (e.g. "Thermodynamics").' },
            },
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_attached_study_materials',
          description: 'List all study PDFs currently attached to this conversation.',
          parameters: {
            type: 'object',
            properties: {},
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'analyze_document_topic',
          description: 'Analyze an attached study document to pinpoint which exact pages cover a topic (e.g. "Entropy"), estimating pages, derivations, and practice questions.',
          parameters: {
            type: 'object',
            properties: {
              documentId: { type: 'number', description: 'ID of the document.' },
              topicQuery: { type: 'string', description: 'Topic or concept to locate.' },
            },
            required: ['documentId', 'topicQuery'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'explain_document_page',
          description: 'Retrieve and explain the contents of a specific page from a study document.',
          parameters: {
            type: 'object',
            properties: {
              documentId: { type: 'number', description: 'ID of the document.' },
              page: { type: 'number', description: 'Page number (1-based).' },
            },
            required: ['documentId', 'page'],
          },
        },
      },

      /* ---------- STUDY & TIMER ---------- */
      {
        type: 'function',
        function: {
          name: 'generate_quiz',
          description: 'Fetch practice questions from the PYQ bank for a topic or subject.',
          parameters: {
            type: 'object',
            properties: {
              subjectName: { type: 'string', description: 'Subject name.' },
              count: { type: 'number', description: 'Number of questions (default 5).' },
            },
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'create_study_session',
          description: 'Log a completed or started study session in SQLite.',
          parameters: {
            type: 'object',
            properties: {
              subjectName: { type: 'string', description: 'Subject studied.' },
              durationMinutes: { type: 'number', description: 'Duration in minutes.' },
              notes: { type: 'string', description: 'Session notes.' },
            },
            required: ['durationMinutes'],
          },
        },
      },

      /* ---------- EXAM ---------- */
      {
        type: 'function',
        function: {
          name: 'get_exam_history',
          description: 'Get past mock exam attempts and scores.',
          parameters: {
            type: 'object',
            properties: {
              limit: { type: 'number', description: 'Number of past exams (default 5).' },
            },
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'analyze_exam_performance',
          description: 'Analyze mock test scores, negative marking loss, and accuracy per question type.',
          parameters: {
            type: 'object',
            properties: {},
          },
        },
      },
    ];
  }

  public async executeTool(
    name: string,
    args: Record<string, unknown>,
    conversationId?: number
  ): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    let status: 'success' | 'failed' | 'denied' = 'success';
    let result: unknown = null;
    let error: string | undefined = undefined;

    try {
      result = await this.dispatch(name, args, conversationId);
    } catch (e) {
      status = 'failed';
      error = e instanceof Error ? e.message : String(e);
    }

    const durationMs = Date.now() - startTime;

    // Log execution in SQLite audit table
    try {
      run(`
        INSERT INTO ai_tool_logs (conversation_id, tool_name, arguments_json, result_json, status, execution_time_ms)
        VALUES (?, ?, ?, ?, ?, ?)
      `, conversationId ?? null, name, JSON.stringify(args), JSON.stringify(result ?? { error }), status, durationMs);
    } catch {
      // ignore logging errors
    }

    if (error) {
      return { toolName: name, error };
    }
    return { toolName: name, result };
  }

  private async dispatch(name: string, args: Record<string, any>, conversationId?: number): Promise<unknown> {
    const today = new Date().toISOString().slice(0, 10);

    switch (name) {
      /* =========================================================================
       * STUDY PLANNER TOOLS (CORE MECHSTUDY AI CAPABILITIES)
       * ========================================================================= */

      case 'create_study_plan': {
        const rawSubject = String(args.subjectName || '').trim();
        const rawTopic = String(args.topicName || '').trim();
        if (!rawSubject && !rawTopic) {
          throw new Error('Please specify a subject (e.g. Thermodynamics) and topic (e.g. Entropy).');
        }

        // 1. Resolve Subject against syllabus
        let subject = get<any>(
          'SELECT id, name, code, credits FROM subjects WHERE name LIKE ? OR code LIKE ? LIMIT 1',
          `%${rawSubject}%`, `%${rawSubject}%`
        );
        if (!subject && rawSubject) {
          // Common engineering shortcuts
          const lower = rawSubject.toLowerCase();
          if (lower.includes('thermo')) {
            subject = get<any>('SELECT id, name, code, credits FROM subjects WHERE name LIKE ? LIMIT 1', '%Thermodynamics%');
          } else if (lower.includes('som') || lower.includes('solid') || lower.includes('mechanics of solids')) {
            subject = get<any>('SELECT id, name, code, credits FROM subjects WHERE name LIKE ? LIMIT 1', '%Mechanics of Solids%');
          } else if (lower.includes('math')) {
            subject = get<any>('SELECT id, name, code, credits FROM subjects WHERE name LIKE ? LIMIT 1', '%Mathematics%');
          } else if (lower.includes('material')) {
            subject = get<any>('SELECT id, name, code, credits FROM subjects WHERE name LIKE ? LIMIT 1', '%Material%');
          } else if (lower.includes('fluid')) {
            subject = get<any>('SELECT id, name, code, credits FROM subjects WHERE name LIKE ? LIMIT 1', '%Fluid%');
          }
        }
        if (!subject) {
          const allSubs = all<any>('SELECT id, name, code FROM subjects');
          throw new Error(`Subject "${rawSubject}" not found in syllabus. Available subjects: ${allSubs.map(s => s.name).join(', ')}`);
        }

        // 2. Resolve Topic against syllabus
        let matchedTopic: any = null;
        if (rawTopic) {
          matchedTopic = get<any>(`
            SELECT t.id, t.title, t.unit_id, u.number as unit_number, u.title as unit_title
            FROM topics t
            JOIN units u ON u.id = t.unit_id
            WHERE u.subject_id = ? AND (t.title LIKE ? OR u.title LIKE ?)
            ORDER BY CASE WHEN t.title LIKE ? THEN 0 ELSE 1 END, t.id ASC
            LIMIT 1
          `, subject.id, `%${rawTopic}%`, `%${rawTopic}%`, `%${rawTopic}%`);

          if (!matchedTopic) {
            // Search across other subjects if not found directly
            matchedTopic = get<any>(`
              SELECT t.id, t.title, t.unit_id, u.subject_id, u.number as unit_number, u.title as unit_title
              FROM topics t
              JOIN units u ON u.id = t.unit_id
              WHERE t.title LIKE ? OR u.title LIKE ?
              ORDER BY CASE WHEN t.title LIKE ? THEN 0 ELSE 1 END, t.id ASC
              LIMIT 1
            `, `%${rawTopic}%`, `%${rawTopic}%`, `%${rawTopic}%`);
          }
        }

        const targetDate = args.plannedDate ? String(args.plannedDate).slice(0, 10) : today;
        const totalMinutes = args.totalMinutes ? Math.max(30, Math.min(480, Number(args.totalMinutes))) : 120;
        const sessionCount = args.sessionCount ? Math.max(1, Math.min(6, Number(args.sessionCount))) : 3;
        const examTarget = args.examTarget || 'RTU';

        // Check for attached study materials or specific document
        const attachedDocs = conversationId ? getConversationDocuments(conversationId) : [];
        let targetDoc: any = null;

        if (args.documentId) {
          targetDoc = get<any>('SELECT id, filename, page_count, has_text_layer FROM documents WHERE id = ?', args.documentId);
        } else if (attachedDocs.length > 0) {
          // Find the most relevant attached document matching subject or topic
          const lowerSub = subject.name.toLowerCase();
          const lowerTopic = (rawTopic || '').toLowerCase();
          const subTokens = lowerSub.split(/\s+/).filter((t: string) => t.length > 3 && t !== 'engineering');
          const matched = attachedDocs.find(d => {
            const fn = d.filename.toLowerCase();
            if (lowerTopic && fn.includes(lowerTopic)) return true;
            if (fn.includes(lowerSub)) return true;
            return subTokens.some((tok: string) => fn.includes(tok));
          });
          targetDoc = matched || attachedDocs[0];
        } else {
          // Check if library has a document matching subject
          targetDoc = get<any>(
            `SELECT id, filename, page_count, has_text_layer FROM documents
             WHERE filename LIKE ? OR filename LIKE ? LIMIT 1`,
            `%${subject.name}%`, `%${rawSubject}%`
          );
        }

        let docAnalysis: any = null;
        if (targetDoc) {
          try {
            docAnalysis = analyzeDocumentForTopic(targetDoc.id, rawTopic || matchedTopic?.title || 'Entropy');
          } catch { /* ignore */ }
        }

        // 3. Check existing schedule and conflict
        const existingTasks = listTasks({ date: targetDate });
        const existingMinutes = existingTasks.reduce((sum, t) => sum + (t.est_minutes || 0), 0);
        const settings = getAiSettings();
        const maxDailyMinutes = settings.maxDailyStudyHours * 60;
        const conflictDetected = (existingMinutes + totalMinutes) > maxDailyMinutes;

        // 4. Determine breakdown of sessions
        let sessionsToCreate: Array<{ title: string; estMinutes: number; focus: string }> = [];

        if (Array.isArray(args.sessions) && args.sessions.length > 0) {
          sessionsToCreate = args.sessions.map((s: any, idx: number) => ({
            title: String(s.title || `Session ${idx + 1}`).trim(),
            estMinutes: Math.max(15, Math.min(180, Number(s.estMinutes) || 45)),
            focus: String(s.focus || s.title || ''),
          }));
        } else {
          // Standard intelligent academic breakdown based on topic and duration
          const topicLabel = matchedTopic ? matchedTopic.title : rawTopic;
          const isEntropy = topicLabel.toLowerCase().includes('entropy');

          if (isEntropy) {
            if (sessionCount === 2) {
              const half = Math.floor(totalMinutes / 2);
              sessionsToCreate = [
                {
                  title: 'Entropy: Clausius Inequality & Entropy Change Calculations',
                  estMinutes: half,
                  focus: 'Core concept, reversible vs irreversible heat transfer, Clausius theorem, and T ds relations.',
                },
                {
                  title: 'Entropy: Principle of Entropy Increase & Solved Problems',
                  estMinutes: totalMinutes - half,
                  focus: 'Entropy generation in isolated systems, T-s diagrams, isentropic relations, and university/GATE exam problems.',
                },
              ];
            } else {
              const part1 = Math.round(totalMinutes * 0.375); // ~45m for 120m
              const part2 = Math.round(totalMinutes * 0.375); // ~45m for 120m
              const part3 = totalMinutes - part1 - part2;     // ~30m for 120m
              sessionsToCreate = [
                {
                  title: 'Entropy: Physical Concept, Clausius Inequality & Proof',
                  estMinutes: part1,
                  focus: 'Clausius inequality $\\oint \\frac{\\delta Q}{T} \\le 0$, reversible cycles, entropy as a state property, and entropy generation $S_{gen} \\ge 0$.',
                },
                {
                  title: 'Entropy: Property Relations, T-s Diagrams & Calculation',
                  estMinutes: part2,
                  focus: 'Derivations for ideal gases ($\Delta s = c_p \\ln(T_2/T_1) - R \\ln(P_2/P_1)$), incompressible solids/liquids, and control volume analysis.',
                },
                {
                  title: 'Entropy: Principle of Entropy Increase & RTU/GATE PYQs',
                  estMinutes: part3,
                  focus: 'Second law analysis of open/closed systems, entropy balance equations, and solving previous year exam questions.',
                },
              ];
            }
          } else {
            // General academic topic breakdown
            const durationPer = Math.floor(totalMinutes / sessionCount);
            sessionsToCreate = [
              {
                title: `${topicLabel}: Core Theory & Governing Equations`,
                estMinutes: durationPer,
                focus: 'Fundamental definitions, assumptions, and key derivations.',
              },
              {
                title: `${topicLabel}: Analytical Formulations & Special Cases`,
                estMinutes: durationPer,
                focus: 'Formulas, boundary conditions, and property relations.',
              },
            ];
            if (sessionCount >= 3) {
              const remaining = totalMinutes - (durationPer * (sessionCount - 1));
              sessionsToCreate.push({
                title: `${topicLabel}: Numerical Problems & Exam Practice`,
                estMinutes: remaining,
                focus: 'Solving RTU textbook examples and GATE standard numerical questions.',
              });
            }
          }
        }

        // 5. Insert sessions into study_tasks table in SQLite
        const createdSessions: Array<{
          id: number;
          title: string;
          estMinutes: number;
          focus: string;
          status: string;
          documentId?: number;
          documentFilename?: string;
          page?: number;
        }> = [];
        const planTitle = `${subject.name}: ${matchedTopic?.title || rawTopic}`;

        for (let i = 0; i < sessionsToCreate.length; i++) {
          const s = sessionsToCreate[i];
          const taskTitle = `[AI Plan] ${s.title}`;

          // Calculate page assignment if docAnalysis found page range
          let sessionPage: number | undefined = undefined;
          let pageNote = '';
          if (docAnalysis && docAnalysis.pageStart && docAnalysis.pageEnd) {
            const startP = docAnalysis.pageStart;
            const endP = docAnalysis.pageEnd;
            const span = Math.max(1, Math.ceil((endP - startP + 1) / sessionsToCreate.length));
            const pStart = startP + (i * span);
            const pEnd = Math.min(endP, pStart + span - 1);
            sessionPage = pStart;
            pageNote = ` | Source: ${targetDoc.filename} (pp. ${pStart}${pEnd > pStart ? '–' + pEnd : ''})`;
          } else if (targetDoc) {
            sessionPage = 1;
            pageNote = ` | Source: ${targetDoc.filename}`;
          }

          const taskId = createTask({
            title: taskTitle,
            subjectId: subject.id,
            unitId: matchedTopic?.unit_id,
            topicId: matchedTopic?.id,
            examTarget,
            plannedDate: targetDate,
            priority: 'HIGH',
            estMinutes: s.estMinutes,
            notes: `🤖 AI Plan: ${planTitle} (Session ${i + 1}/${sessionsToCreate.length})${pageNote} | Focus: ${s.focus}`,
            documentId: targetDoc?.id,
            page: sessionPage,
          });

          createdSessions.push({
            id: taskId,
            title: taskTitle,
            estMinutes: s.estMinutes,
            focus: s.focus,
            status: 'pending',
            documentId: targetDoc?.id,
            documentFilename: targetDoc?.filename,
            page: sessionPage,
          });
        }

        // 6. Broadcast event so Planner immediately reloads
        this.notify('planner:refresh');

        return {
          success: true,
          planTitle,
          sourceDocument: targetDoc ? {
            id: targetDoc.id,
            filename: targetDoc.filename,
            pageRange: docAnalysis?.pageStart ? `${docAnalysis.pageStart}–${docAnalysis.pageEnd}` : null,
            contentSummary: docAnalysis?.contentSummary,
          } : null,
          subject: { id: subject.id, name: subject.name, code: subject.code },
          topic: matchedTopic ? { id: matchedTopic.id, title: matchedTopic.title, unit: matchedTopic.unit_title } : { title: rawTopic },
          date: targetDate,
          totalPlannedMinutes: totalMinutes,
          sessionCount: createdSessions.length,
          sessions: createdSessions,
          scheduleSummary: {
            existingTasksToday: existingTasks.length,
            existingMinutesToday: existingMinutes,
            newTotalMinutes: existingMinutes + totalMinutes,
            dailyCapMinutes: maxDailyMinutes,
            conflictWarning: conflictDetected
              ? `Notice: Total planned study on ${targetDate} will reach ${((existingMinutes + totalMinutes) / 60).toFixed(1)} hours, exceeding your daily cap of ${settings.maxDailyStudyHours} hours.`
              : null,
          },
          message: `Successfully created and saved study plan with ${createdSessions.length} sessions for "${planTitle}" on ${targetDate}. It is immediately visible in the Planner module.`,
        };
      }

      case 'add_study_session': {
        const title = String(args.title || '').trim();
        if (!title) throw new Error('Session title is required');

        let subjectId: number | undefined = undefined;
        let unitId: number | undefined = undefined;
        let topicId: number | undefined = undefined;

        if (args.subjectName) {
          const sub = get<any>('SELECT id FROM subjects WHERE name LIKE ? OR code LIKE ? LIMIT 1', `%${args.subjectName}%`, `%${args.subjectName}%`);
          if (sub) subjectId = sub.id;
        }

        if (args.topicName) {
          const top = get<any>('SELECT id, unit_id FROM topics WHERE title LIKE ? LIMIT 1', `%${args.topicName}%`);
          if (top) {
            topicId = top.id;
            unitId = top.unit_id;
          }
        }

        const taskTitle = title.startsWith('[AI Plan]') ? title : `[AI Plan] ${title}`;
        const targetDate = args.plannedDate ? String(args.plannedDate).slice(0, 10) : today;
        const duration = args.durationMinutes ? Math.max(5, Math.min(480, Number(args.durationMinutes))) : 45;

        const taskId = createTask({
          title: taskTitle,
          subjectId,
          unitId,
          topicId,
          examTarget: args.examTarget || 'RTU',
          plannedDate: targetDate,
          priority: args.priority || 'HIGH',
          estMinutes: duration,
          notes: args.notes ? `🤖 AI Plan: ${args.notes}` : `🤖 AI Plan: Scheduled session`,
        });

        this.notify('planner:refresh');

        return {
          success: true,
          taskId,
          title: taskTitle,
          plannedDate: targetDate,
          durationMinutes: duration,
          message: `Created study session "${taskTitle}" for ${targetDate}. Visible in the Planner.`,
        };
      }

      case 'get_study_plan': {
        const date = args.date ? String(args.date).slice(0, 10) : today;
        let tasks = listTasks({ date });

        if (args.subjectName) {
          tasks = tasks.filter(t =>
            (t.subject_name && t.subject_name.toLowerCase().includes(String(args.subjectName).toLowerCase())) ||
            (t.subject_code && t.subject_code.toLowerCase().includes(String(args.subjectName).toLowerCase()))
          );
        }

        const aiPlans = tasks.filter(t => t.title.startsWith('[AI Plan]') || (t.notes && t.notes.includes('🤖 AI Plan')));

        return {
          date,
          totalTasks: tasks.length,
          aiPlanTasksCount: aiPlans.length,
          tasks: tasks.map(t => ({
            id: t.id,
            title: t.title,
            subject: t.subject_name || 'General',
            topic: t.topic_title || null,
            durationMinutes: t.est_minutes,
            priority: t.priority,
            status: t.status,
            isAiPlan: t.title.startsWith('[AI Plan]') || (t.notes && t.notes.includes('🤖 AI Plan')),
            notes: t.notes,
          })),
        };
      }

      case 'get_session_history': {
        const range = args.range || 'today';
        let subjectId: number | undefined;
        if (args.subjectName) {
          const sub = get<any>('SELECT id FROM subjects WHERE (name LIKE ? OR code LIKE ?) AND code NOT IN (\'3ME1-02\', \'4ME1-02\')', `%${args.subjectName}%`, `%${args.subjectName}%`);
          if (sub) subjectId = sub.id;
        }
        const limit = args.limit ? Math.min(100, Number(args.limit)) : 30;
        const sessions = listSessions({ range, subjectId, limit });
        const totalSecs = sessions.reduce((acc: number, s: any) => acc + (s.active_seconds || 0), 0);
        return {
          success: true,
          range,
          sessionCount: sessions.length,
          totalMinutes: Math.round(totalSecs / 60),
          totalHours: (totalSecs / 3600).toFixed(1),
          sessions: sessions.map((s: any) => ({
            id: s.id,
            subject: s.subject_name || 'General',
            topic: s.topic_title || s.task_title || (s.mode === 'pomodoro' ? 'Focus Block' : 'Study Session'),
            durationMinutes: Math.round(s.active_seconds / 60),
            startedAt: s.started_at,
            endedAt: s.ended_at,
            notes: s.notes,
            status: s.ended_at ? 'completed' : 'in_progress',
          })),
        };
      }

      case 'get_session_details': {
        const sessionId = Number(args.sessionId || args.id);
        if (!sessionId) throw new Error('sessionId is required');
        const session = getSession(sessionId);
        if (!session) throw new Error(`Study session #${sessionId} not found`);
        return {
          success: true,
          session: {
            id: session.id,
            subject: session.subject_name || 'General',
            topic: session.topic_title || session.task_title || 'Study Session',
            durationMinutes: Math.round(session.active_seconds / 60),
            durationSeconds: session.active_seconds,
            startedAt: session.started_at,
            endedAt: session.ended_at,
            notes: session.notes,
            examTarget: session.exam_target,
            mode: session.mode,
            status: session.ended_at ? 'completed' : 'in_progress',
          },
        };
      }

      case 'get_active_session': {
        const active = get<any>(`
          SELECT ss.*, s.name as subject_name, t.title as task_title, tp.title as topic_title
          FROM study_sessions ss
          LEFT JOIN subjects s ON s.id = ss.subject_id
          LEFT JOIN study_tasks t ON t.id = ss.task_id
          LEFT JOIN topics tp ON tp.id = t.topic_id
          WHERE ss.ended_at IS NULL
          ORDER BY ss.started_at DESC LIMIT 1
        `);
        if (!active) {
          return { active: false, message: 'No study timer is currently running.' };
        }
        const elapsed = Math.max(0, Math.round((Date.now() - new Date(active.started_at).getTime()) / 1000));
        return {
          active: true,
          sessionId: active.id,
          subject: active.subject_name || 'General',
          topic: active.topic_title || active.task_title || 'Study Session',
          startedAt: active.started_at,
          elapsedSeconds: Math.max(elapsed, active.active_seconds || 0),
          elapsedMinutes: Math.round(Math.max(elapsed, active.active_seconds || 0) / 60),
        };
      }

      case 'stop_study_session': {
        const sessionId = Number(args.sessionId);
        let session: any = null;
        if (sessionId) {
          session = get<any>('SELECT * FROM study_sessions WHERE id = ?', sessionId);
        } else {
          session = get<any>('SELECT * FROM study_sessions WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1');
        }
        if (!session) {
          return { success: false, message: 'No active study session found to stop.' };
        }
        const elapsed = Math.max(1, Math.round((Date.now() - new Date(session.started_at).getTime()) / 1000));
        const finalSecs = Math.max(elapsed, session.active_seconds || 0);
        endSession(session.id, finalSecs, args.notes || 'Stopped by user');
        this.notify('session:update', { running: false, sessionId: null });
        this.notify('planner:refresh');
        const mins = Math.round(finalSecs / 60);
        return {
          success: true,
          sessionId: session.id,
          durationMinutes: mins,
          message: `Study session #${session.id} stopped and saved (${mins} minutes recorded). Academic topic status remains unchanged.`,
        };
      }

      case 'recalculate_study_statistics': {
        const summary = analyticsSummary();
        const todayMins = Math.round(summary.today.secs / 60);
        const weekHours = (summary.week.secs / 3600).toFixed(1);
        const monthHours = (summary.month.secs / 3600).toFixed(1);
        return {
          success: true,
          today: {
            minutes: todayMins,
            hours: (summary.today.secs / 3600).toFixed(1),
            sessions: summary.today.sessions,
          },
          week: {
            hours: weekHours,
            sessions: summary.week.sessions,
          },
          month: {
            hours: monthHours,
          },
          streakDays: summary.streak,
          bySubject: summary.bySubject.map(s => ({ subject: s.subject_name, hours: (s.secs / 3600).toFixed(1) })),
          message: `Study statistics recalculated: Studied ${todayMins}m today (${summary.today.sessions} sessions), ${weekHours}h this week, current streak: ${summary.streak} day(s).`,
        };
      }

      case 'update_study_session': {
        const sessionId = Number(args.sessionId);
        if (sessionId) {
          const session = getSession(sessionId);
          if (!session) throw new Error(`Study session #${sessionId} not found`);

          const patch: any = {};
          if (args.notes !== undefined) patch.notes = args.notes;

          if (args.subjectName) {
            const sub = get<any>('SELECT id FROM subjects WHERE (name LIKE ? OR code LIKE ?) AND code NOT IN (\'3ME1-02\', \'4ME1-02\')', `%${args.subjectName}%`, `%${args.subjectName}%`);
            if (sub) patch.subjectId = sub.id;
          }

          if (args.topicName) {
            const top = get<any>('SELECT id, unit_id FROM topics WHERE title LIKE ?', `%${args.topicName}%`);
            if (top) {
              patch.topicId = top.id;
              if (!patch.subjectId) {
                const u = get<any>('SELECT subject_id FROM units WHERE id = ?', top.unit_id);
                if (u) patch.subjectId = u.subject_id;
              }
            }
          }

          if (args.durationMinutes !== undefined) {
            patch.activeSeconds = Math.max(0, Math.round(Number(args.durationMinutes) * 60));
          }

          if (args.date || args.startTime || args.endTime) {
            const curStart = new Date(session.started_at);
            const dateStr = args.date ? String(args.date).slice(0, 10) : curStart.toISOString().slice(0, 10);
            if (args.startTime) {
              const [h, m] = String(args.startTime).split(':').map(Number);
              const d = new Date(dateStr);
              d.setHours(h || 0, m || 0, 0, 0);
              patch.startedAt = d.toISOString();
            } else if (args.date) {
              const d = new Date(dateStr);
              d.setHours(curStart.getHours(), curStart.getMinutes(), curStart.getSeconds());
              patch.startedAt = d.toISOString();
            }
            if (args.endTime) {
              const [h, m] = String(args.endTime).split(':').map(Number);
              const d = new Date(dateStr);
              d.setHours(h || 0, m || 0, 0, 0);
              patch.endedAt = d.toISOString();
              if (patch.startedAt && patch.activeSeconds === undefined) {
                patch.activeSeconds = Math.max(0, Math.round((new Date(patch.endedAt).getTime() - new Date(patch.startedAt).getTime()) / 1000));
              }
            }
          }

          updateSession(sessionId, patch);
          this.notify('planner:refresh');
          this.notify('session:update');
          return {
            success: true,
            sessionId,
            message: `Study session #${sessionId} updated successfully. Statistics recalculated.`,
          };
        }

        // Fallback for task update if taskId provided
        const taskId = Number(args.taskId);
        if (taskId) {
          const patch: Record<string, unknown> = {};
          if (args.date) patch.plannedDate = String(args.date).slice(0, 10);
          if (args.durationMinutes) patch.estMinutes = Math.max(5, Math.min(480, Number(args.durationMinutes)));
          if (args.priority) patch.priority = args.priority;
          if (args.status) patch.status = args.status;
          if (args.notes) patch.notes = args.notes;
          updateTask(taskId, patch);
          this.notify('planner:refresh');
          return { success: true, taskId, message: `Task #${taskId} updated.` };
        }

        throw new Error('Either sessionId or taskId must be provided to update_study_session');
      }

      case 'delete_study_session': {
        let sessionId = Number(args.sessionId || args.id);
        const isLast = Boolean(args.lastSession);

        if (!sessionId && isLast) {
          const latest = get<any>(`
            SELECT ss.*, s.name as subject_name, t.title as task_title, tp.title as topic_title
            FROM study_sessions ss
            LEFT JOIN subjects s ON s.id = ss.subject_id
            LEFT JOIN study_tasks t ON t.id = ss.task_id
            LEFT JOIN topics tp ON tp.id = t.topic_id
            ORDER BY ss.started_at DESC LIMIT 1
          `);
          if (!latest) {
            return { success: false, message: 'No recorded study sessions found to delete.' };
          }
          sessionId = latest.id;
        }

        if (sessionId) {
          const session = getSession(sessionId);
          if (!session) {
            const task = get<any>('SELECT * FROM study_tasks WHERE id = ?', sessionId);
            if (task) {
              if (!args.confirmed) {
                return {
                  confirmationRequired: true,
                  taskId: task.id,
                  message: `Delete study task #${task.id} ("${task.title}")? Please confirm deletion.`,
                };
              }
              deleteTask(task.id);
              this.notify('planner:refresh');
              return { success: true, taskId: task.id, message: `Task #${task.id} deleted successfully.` };
            }
            throw new Error(`Study session #${sessionId} not found`);
          }

          const mins = Math.round(session.active_seconds / 60);
          const subj = session.subject_name || 'General';
          const topic = session.topic_title || session.task_title || (session.mode === 'pomodoro' ? 'Focus block' : 'Study session');

          if (!args.confirmed) {
            return {
              confirmationRequired: true,
              sessionId: session.id,
              subject: subj,
              topic,
              durationMinutes: mins,
              message: `Delete study session #${session.id} (${subj} - ${topic}, ${mins} mins)? This will permanently remove its contribution to your study-time statistics and progress calculations. Completed syllabus topics will NOT be deleted. Please confirm deletion.`,
            };
          }

          deleteSession(session.id);
          this.notify('session:update', { running: false, sessionId: null });
          this.notify('planner:refresh');
          const summary = analyticsSummary();
          const todayMins = Math.round(summary.today.secs / 60);

          return {
            success: true,
            sessionId: session.id,
            deletedDurationMinutes: mins,
            todayRemainingMinutes: todayMins,
            message: `Study session #${session.id} (${subj} - ${topic}, ${mins} mins) has been permanently deleted. Study statistics have been recalculated. Today's total study time is now ${Math.floor(todayMins / 60)}h ${todayMins % 60}m.`,
          };
        }

        const taskId = Number(args.taskId);
        if (taskId) {
          if (!args.confirmed) {
            return {
              confirmationRequired: true,
              taskId,
              message: `Please confirm deletion of study task #${taskId}. This action cannot be undone.`,
            };
          }
          deleteTask(taskId);
          this.notify('planner:refresh');
          return { success: true, taskId, message: `Study task #${taskId} deleted successfully.` };
        }

        const latest = get<any>(`
          SELECT ss.*, s.name as subject_name, t.title as task_title, tp.title as topic_title
          FROM study_sessions ss
          LEFT JOIN subjects s ON s.id = ss.subject_id
          LEFT JOIN study_tasks t ON t.id = ss.task_id
          LEFT JOIN topics tp ON tp.id = t.topic_id
          ORDER BY ss.started_at DESC LIMIT 1
        `);
        if (!latest) {
          return { success: false, message: 'No study session found to delete.' };
        }
        const mins = Math.round(latest.active_seconds / 60);
        const subj = latest.subject_name || 'General';
        const topic = latest.topic_title || latest.task_title || 'Study session';
        if (!args.confirmed) {
          return {
            confirmationRequired: true,
            sessionId: latest.id,
            subject: subj,
            topic,
            durationMinutes: mins,
            message: `Delete your last study session #${latest.id} (${subj} - ${topic}, ${mins} mins)? This will remove its contribution to your study-time statistics. Please confirm deletion.`,
          };
        }
        deleteSession(latest.id);
        this.notify('session:update', { running: false, sessionId: null });
        this.notify('planner:refresh');
        const summary = analyticsSummary();
        const todayMins = Math.round(summary.today.secs / 60);
        return {
          success: true,
          sessionId: latest.id,
          message: `Last study session #${latest.id} (${subj} - ${topic}) deleted. Today's study time updated to ${Math.floor(todayMins / 60)}h ${todayMins % 60}m.`,
        };
      }

      case 'start_study_session': {
        const taskId = Number(args.taskId || args.sessionId);
        let task: any = null;

        if (taskId) {
          task = get<any>(`
            SELECT t.*, s.name as subject_name, tp.title as topic_title
            FROM study_tasks t
            LEFT JOIN subjects s ON s.id = t.subject_id
            LEFT JOIN topics tp ON tp.id = t.topic_id
            WHERE t.id = ?
          `, taskId);
        } else if (args.subjectName || args.topicName) {
          // Find next pending task for this subject or topic
          let where = "WHERE t.status IN ('pending', 'in_progress')";
          const params: any[] = [];
          if (args.subjectName) {
            where += ' AND (s.name LIKE ? OR s.code LIKE ?)';
            params.push(`%${args.subjectName}%`, `%${args.subjectName}%`);
          }
          if (args.topicName) {
            where += ' AND (t.title LIKE ? OR tp.title LIKE ?)';
            params.push(`%${args.topicName}%`, `%${args.topicName}%`);
          }
          task = get<any>(`
            SELECT t.*, s.name as subject_name, tp.title as topic_title
            FROM study_tasks t
            LEFT JOIN subjects s ON s.id = t.subject_id
            LEFT JOIN topics tp ON tp.id = t.topic_id
            ${where}
            ORDER BY t.planned_date ASC, t.id ASC
            LIMIT 1
          `, ...params);
        }

        if (!task) {
          // If no specific task exists, create a fresh study session directly
          let subjectId: number | undefined = undefined;
          if (args.subjectName) {
            const sub = get<any>('SELECT id FROM subjects WHERE name LIKE ? LIMIT 1', `%${args.subjectName}%`);
            if (sub) subjectId = sub.id;
          }
          const sid = startSession({
            subjectId,
            examTarget: 'RTU',
            mode: 'stopwatch',
          });
          const updatePayload = {
            sessionId: sid,
            running: true,
            startedAt: Date.now(),
            elapsed: 0,
            label: args.topicName ? `${args.subjectName || 'Study'} · ${args.topicName}` : (args.subjectName || 'Study session'),
            examTarget: 'RTU',
            subjectId: subjectId ?? null,
          };
          this.notify('session:update', updatePayload);
          return {
            success: true,
            sessionId: sid,
            message: `Started study timer for ${updatePayload.label}.`,
          };
        }

        // Mark task in_progress
        updateTask(task.id, { status: 'in_progress' });

        // Start session in SQLite
        const sid = startSession({
          taskId: task.id,
          subjectId: task.subject_id,
          examTarget: task.exam_target || 'RTU',
          mode: 'stopwatch',
        });

        const sessionPayload = {
          sessionId: sid,
          taskId: task.id,
          running: true,
          startedAt: Date.now(),
          elapsed: 0,
          label: task.title,
          examTarget: task.exam_target,
          subjectId: task.subject_id,
          targetMinutes: task.est_minutes,
        };

        this.notify('session:update', sessionPayload);
        this.notify('planner:refresh');

        return {
          success: true,
          sessionId: sid,
          taskId: task.id,
          title: task.title,
          subject: task.subject_name,
          topic: task.topic_title,
          targetMinutes: task.est_minutes,
          message: `Study session started for "${task.title}". The application timer is now running and tracking elapsed time.`,
        };
      }

      case 'complete_study_session': {
        const taskId = Number(args.taskId || args.sessionId);
        let task: any = null;

        if (taskId) {
          task = get<any>(`
            SELECT t.*, s.name as subject_name, tp.title as topic_title
            FROM study_tasks t
            LEFT JOIN subjects s ON s.id = t.subject_id
            LEFT JOIN topics tp ON tp.id = t.topic_id
            WHERE t.id = ?
          `, taskId);
        } else if (args.topicId) {
          task = get<any>('SELECT t.* FROM study_tasks t WHERE t.topic_id = ? ORDER BY id DESC LIMIT 1', Number(args.topicId));
        }

        if (task) {
          // Mark task done
          updateTask(task.id, { status: 'done' });

          // End open session if exists
          const openSession = get<any>('SELECT id, active_seconds FROM study_sessions WHERE task_id = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1', task.id);
          const durationSec = args.actualMinutes ? Number(args.actualMinutes) * 60 : (openSession?.active_seconds || (task.est_minutes * 60));

          if (openSession) {
            endSession(openSession.id, durationSec, args.notes || 'Completed session');
          } else {
            const sid = startSession({ taskId: task.id, subjectId: task.subject_id, examTarget: task.exam_target, mode: 'study' });
            endSession(sid, durationSec, args.notes || 'Completed session');
          }

          // Update topic progress
          if (task.topic_id) {
            setTopicProgress(task.topic_id, {
              status: 'completed',
              theoryDone: true,
              confidence: 4,
              notes: args.notes || `Completed task: ${task.title}`,
            });
          }

          this.notify('session:update', { sessionId: null, running: false, elapsed: 0 });
          this.notify('planner:refresh');

          return {
            success: true,
            taskId: task.id,
            title: task.title,
            topicProgressUpdated: Boolean(task.topic_id),
            message: `Task "${task.title}" marked as completed. Progress updated and next spaced revision scheduled.`,
          };
        }

        if (args.topicId) {
          setTopicProgress(Number(args.topicId), {
            status: 'completed',
            theoryDone: true,
            confidence: 4,
          });
          this.notify('planner:refresh');
          return {
            success: true,
            topicId: Number(args.topicId),
            message: `Topic #${args.topicId} marked as completed.`,
          };
        }

        throw new Error('Please provide a valid taskId or topicId to complete.');
      }

      /* =========================================================================
       * SCHEDULING (LEGACY ALIASES FOR COMPATIBILITY)
       * ========================================================================= */

      case 'get_today_schedule': {
        const date = args.date ? String(args.date).slice(0, 10) : today;
        const tasks = listTasks({ date });
        return {
          date,
          tasksCount: tasks.length,
          tasks: tasks.map(t => ({
            id: t.id,
            title: t.title,
            subject: t.subject_name || 'General',
            plannedDate: t.planned_date,
            estMinutes: t.est_minutes,
            priority: t.priority,
            status: t.status,
          })),
        };
      }

      case 'get_week_schedule': {
        const startDate = args.startDate ? String(args.startDate).slice(0, 10) : today;
        const allTasks = listTasks();
        const start = new Date(startDate).getTime();
        const end = start + 7 * 86400000;

        const weekTasks = allTasks.filter(t => {
          if (!t.planned_date) return false;
          const tTime = new Date(t.planned_date).getTime();
          return tTime >= start && tTime <= end;
        });

        return {
          startDate,
          tasksCount: weekTasks.length,
          tasks: weekTasks.map(t => ({
            id: t.id,
            title: t.title,
            subject: t.subject_name || 'General',
            plannedDate: t.planned_date,
            estMinutes: t.est_minutes,
            priority: t.priority,
            status: t.status,
          })),
        };
      }

      case 'create_task': {
        let subjectId: number | undefined = undefined;
        if (args.subjectName) {
          const match = get<{ id: number }>('SELECT id FROM subjects WHERE name LIKE ? OR code LIKE ? LIMIT 1', `%${args.subjectName}%`, `%${args.subjectName}%`);
          if (match) subjectId = match.id;
        }

        const taskId = createTask({
          title: String(args.title).trim(),
          plannedDate: args.plannedDate ? String(args.plannedDate).slice(0, 10) : today,
          estMinutes: args.estMinutes ? Math.max(5, Math.min(480, Number(args.estMinutes))) : 45,
          priority: args.priority || 'MEDIUM',
          examTarget: args.examTarget || 'RTU',
          subjectId,
          notes: args.notes ? String(args.notes).trim() : undefined,
        });

        this.notify('planner:refresh');

        return {
          success: true,
          taskId,
          message: `Created task "${args.title}" for ${args.plannedDate || today}`,
        };
      }

      case 'update_task': {
        const taskId = Number(args.taskId);
        if (!taskId) throw new Error('Invalid taskId');
        updateTask(taskId, {
          status: args.status,
          priority: args.priority,
          notes: args.notes,
        });
        this.notify('planner:refresh');
        return { success: true, taskId, message: 'Task updated successfully' };
      }

      case 'delete_task': {
        const taskId = Number(args.taskId);
        if (!taskId) throw new Error('Invalid taskId');
        if (!args.confirmed) {
          return {
            confirmationRequired: true,
            taskId,
            message: `Please confirm deletion of task #${taskId}. This action cannot be undone.`,
          };
        }
        deleteTask(taskId);
        this.notify('planner:refresh');
        return { success: true, taskId, message: `Task #${taskId} deleted successfully` };
      }

      case 'reschedule_task': {
        const taskId = Number(args.taskId);
        const newDate = String(args.newDate).slice(0, 10);
        if (!taskId) throw new Error('Invalid taskId');
        updateTask(taskId, { plannedDate: newDate });
        this.notify('planner:refresh');
        return { success: true, taskId, newDate, message: `Rescheduled task #${taskId} to ${newDate}` };
      }

      case 'check_schedule_conflicts': {
        const date = String(args.date || today).slice(0, 10);
        const duration = Math.max(1, Number(args.durationMinutes || 60));
        const settings = getAiSettings();
        const existing = listTasks({ date });

        const totalMinutes = existing.reduce((sum, t) => sum + (t.est_minutes || 0), 0) + duration;
        const maxDailyMinutes = settings.maxDailyStudyHours * 60;
        const hasTimeOverload = totalMinutes > maxDailyMinutes;

        return {
          date,
          proposedMinutes: duration,
          existingTasksCount: existing.length,
          totalPlannedMinutes: totalMinutes,
          maxAllowedMinutes: maxDailyMinutes,
          collegeHours: `${settings.collegeStart} to ${settings.collegeEnd}`,
          conflictDetected: hasTimeOverload,
          recommendation: hasTimeOverload
            ? `Total study time on ${date} would reach ${(totalMinutes / 60).toFixed(1)} hours, exceeding your daily cap of ${settings.maxDailyStudyHours} hours. Consider rescheduling another task.`
            : `Slot is available. Total planned time for ${date} will be ${(totalMinutes / 60).toFixed(1)} hours.`,
        };
      }

      /* =========================================================================
       * ACADEMIC PROGRESS
       * ========================================================================= */

      case 'get_study_progress': {
        const examTarget = args.examTarget || 'ALL';
        if (examTarget === 'ALL') {
          return {
            rtu: progressSummary('RTU'),
            gate: progressSummary('GATE'),
          };
        }
        return {
          [examTarget.toLowerCase()]: progressSummary(examTarget),
        };
      }

      case 'update_study_progress': {
        const topicId = Number(args.topicId);
        if (!topicId) throw new Error('Invalid topicId');
        setTopicProgress(topicId, {
          status: args.status,
          confidence: args.confidence ? Number(args.confidence) : undefined,
        });
        this.notify('planner:refresh');
        return { success: true, topicId, status: args.status, message: 'Topic progress updated' };
      }

      case 'get_completed_topics': {
        const limit = args.limit ? Math.min(50, Number(args.limit)) : 20;
        const rows = all(`
          SELECT t.id, t.title, s.name as subject_name, tp.status, tp.confidence, tp.updated_at
          FROM topic_progress tp
          JOIN topics t ON t.id = tp.topic_id
          JOIN units u ON u.id = t.unit_id
          JOIN subjects s ON s.id = u.subject_id
          WHERE tp.status IN ('completed', 'mastered')
          ORDER BY tp.updated_at DESC
          LIMIT ?
        `, limit);
        return { count: rows.length, completedTopics: rows };
      }

      case 'get_pending_topics': {
        const limit = args.limit ? Math.min(50, Number(args.limit)) : 20;
        let where = "WHERE tp.status IS NULL OR tp.status IN ('not_started', 'learning')";
        const params: any[] = [];
        if (args.subjectName) {
          where += ' AND (s.name LIKE ? OR s.code LIKE ?)';
          params.push(`%${args.subjectName}%`, `%${args.subjectName}%`);
        }
        params.push(limit);

        const rows = all(`
          SELECT t.id, t.title, s.name as subject_name, COALESCE(tp.status, 'not_started') as status
          FROM topics t
          JOIN units u ON u.id = t.unit_id
          JOIN subjects s ON s.id = u.subject_id
          LEFT JOIN topic_progress tp ON tp.topic_id = t.id
          ${where}
          ORDER BY s.code ASC, u.number ASC, t.id ASC
          LIMIT ?
        `, ...params);
        return { count: rows.length, pendingTopics: rows };
      }

      case 'get_weak_topics': {
        const limit = args.limit ? Math.min(20, Number(args.limit)) : 10;
        const mistakes = listMistakes().slice(0, limit);
        return {
          count: mistakes.length,
          mistakes: mistakes.map(m => ({
            id: m.id,
            questionText: m.question_text?.slice(0, 100),
            category: m.error_category,
            notes: m.notes,
            subject: m.subject_name,
            resolved: Boolean(m.reviewed),
          })),
        };
      }

      case 'get_subject_progress': {
        const sub = get<any>(`
          SELECT id, code, name, credits, version_id
          FROM subjects
          WHERE name LIKE ? OR code LIKE ?
          LIMIT 1
        `, `%${args.subjectName}%`, `%${args.subjectName}%`);

        if (!sub) return { error: `Subject "${args.subjectName}" not found.` };

        const stats = get<any>(`
          SELECT 
            COUNT(t.id) as total_topics,
            COUNT(CASE WHEN tp.status IN ('completed', 'mastered') THEN 1 END) as completed_topics
          FROM units u
          JOIN topics t ON t.unit_id = u.id
          LEFT JOIN topic_progress tp ON tp.topic_id = t.id
          WHERE u.subject_id = ?
        `, sub.id);

        return {
          subject: sub,
          totalTopics: stats?.total_topics || 0,
          completedTopics: stats?.completed_topics || 0,
          percentage: stats?.total_topics ? Math.round((stats.completed_topics / stats.total_topics) * 100) : 0,
        };
      }

      /* =========================================================================
       * DOCUMENTS & NOTES
       * ========================================================================= */

      case 'search_notes': {
        const query = String(args.query || '').trim();
        const limit = args.limit ? Math.min(20, Number(args.limit)) : 8;
        if (!query) return { results: [] };
        const hits = search(query, limit);
        return {
          query,
          count: hits.length,
          results: hits.map(h => ({
            kind: h.kind,
            title: h.title,
            subtitle: h.subtitle,
            snippet: h.snippet,
            documentId: h.documentId,
            page: h.page,
            source: h.source,
          })),
        };
      }

      case 'retrieve_document_content': {
        const docId = Number(args.documentId);
        const pageNum = Number(args.page);
        if (!docId || !pageNum) throw new Error('Valid documentId and page required');

        const row = get<any>(`
          SELECT dp.text, dp.source, dp.char_count, d.filename
          FROM document_pages dp
          JOIN documents d ON d.id = dp.document_id
          WHERE dp.document_id = ? AND dp.page = ?
        `, docId, pageNum);

        if (!row) {
          return { error: `No extracted text found for document #${docId} page ${pageNum}` };
        }

        return {
          documentId: docId,
          filename: row.filename,
          page: pageNum,
          source: row.source,
          charCount: row.char_count,
          text: row.text,
        };
      }

      case 'get_document_details': {
        const docId = Number(args.documentId);
        const doc = get<any>(`
          SELECT d.id, d.filename, d.page_count, d.has_text_layer, d.subject_id, s.name as subject_name
          FROM documents d
          LEFT JOIN subjects s ON s.id = d.subject_id
          WHERE d.id = ?
        `, docId);
        if (!doc) throw new Error(`Document #${docId} not found`);
        return doc;
      }

      case 'attach_study_material': {
        if (!conversationId) throw new Error('Conversation context required to attach study materials');
        let doc: any = null;
        if (args.documentId) {
          doc = get<any>('SELECT id, filename, page_count FROM documents WHERE id = ?', args.documentId);
        } else if (args.filename) {
          doc = get<any>('SELECT id, filename, page_count FROM documents WHERE filename LIKE ? LIMIT 1', `%${args.filename}%`);
        }
        if (!doc) throw new Error(`Document "${args.filename || args.documentId}" not found in library`);
        attachDocumentToConversation(conversationId, doc.id);
        return { attached: true, document: doc, message: `Attached "${doc.filename}" to this study conversation.` };
      }

      case 'get_attached_study_materials': {
        if (!conversationId) return { count: 0, attachedDocuments: [] };
        const attached = getConversationDocuments(conversationId);
        return { count: attached.length, attachedDocuments: attached };
      }

      case 'analyze_document_topic': {
        const docId = Number(args.documentId);
        const topicQuery = String(args.topicQuery || '').trim();
        if (!docId || !topicQuery) throw new Error('documentId and topicQuery are required');
        const analysis = analyzeDocumentForTopic(docId, topicQuery);
        return analysis;
      }

      case 'explain_document_page': {
        const docId = Number(args.documentId);
        const pageNum = Number(args.page);
        if (!docId || !pageNum) throw new Error('documentId and page are required');
        const row = get<any>(`
          SELECT dp.text, dp.source, dp.confidence, d.filename
          FROM document_pages dp
          JOIN documents d ON d.id = dp.document_id
          WHERE dp.document_id = ? AND dp.page = ?
        `, docId, pageNum);
        if (!row || !row.text.trim()) {
          const doc = get<any>('SELECT id, filename, has_text_layer FROM documents WHERE id = ?', docId);
          return {
            documentId: docId,
            filename: doc?.filename,
            page: pageNum,
            text: '',
            message: `No extracted text found on page ${pageNum}. ${doc?.has_text_layer === 0 ? 'This is a scanned document; please run OCR first.' : 'Page may be empty or unindexed.'}`,
          };
        }
        return {
          documentId: docId,
          filename: row.filename,
          page: pageNum,
          source: row.source,
          confidence: row.confidence,
          text: row.text,
        };
      }

      /* =========================================================================
       * STUDY & TIMER
       * ========================================================================= */

      case 'generate_quiz': {
        const count = args.count ? Math.min(10, Number(args.count)) : 5;
        let where = '';
        const params: any[] = [];
        if (args.subjectName) {
          where = 'WHERE s.name LIKE ? OR s.code LIKE ?';
          params.push(`%${args.subjectName}%`, `%${args.subjectName}%`);
        }
        params.push(count);

        const rows = all(`
          SELECT q.id, q.text, q.type, q.marks, q.options_json, q.answer, s.name as subject_name
          FROM questions q
          LEFT JOIN subjects s ON s.id = q.subject_id
          ${where}
          ORDER BY RANDOM()
          LIMIT ?
        `, ...params);

        return {
          count: rows.length,
          questions: rows.map(r => ({
            id: r.id,
            text: r.text,
            type: r.type,
            marks: r.marks,
            options: r.options_json ? JSON.parse(r.options_json) : null,
            subject: r.subject_name,
          })),
        };
      }

      case 'create_study_session': {
        const duration = Math.max(1, Number(args.durationMinutes || 30));
        let subjectId: number | undefined = undefined;
        if (args.subjectName) {
          const match = get<{ id: number }>('SELECT id FROM subjects WHERE name LIKE ? LIMIT 1', `%${args.subjectName}%`);
          if (match) subjectId = match.id;
        }

        const sid = startSession({
          subjectId,
          mode: 'study',
          examTarget: 'RTU',
        });
        endSession(sid, duration * 60, args.notes ? String(args.notes) : undefined);

        return {
          success: true,
          sessionId: sid,
          durationMinutes: duration,
          message: `Recorded ${duration} min study session in SQLite.`,
        };
      }

      /* =========================================================================
       * EXAM
       * ========================================================================= */

      case 'get_exam_history': {
        const limit = args.limit ? Math.min(20, Number(args.limit)) : 5;
        const sessions = listExamSessions(limit);
        return { count: sessions.length, history: sessions };
      }

      case 'analyze_exam_performance': {
        const sessions = listExamSessions(20);
        if (sessions.length === 0) {
          return { message: 'No mock exams taken yet. Start a test in Exam Mode.' };
        }
        const totalScore = sessions.reduce((acc, s) => acc + s.score, 0);
        const totalMax = sessions.reduce((acc, s) => acc + s.maxScore, 0);
        const avgPercent = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0;

        return {
          totalExamsTaken: sessions.length,
          averagePercentage: avgPercent,
          recentExams: sessions.slice(0, 3).map(s => ({
            title: s.configTitle,
            score: `${s.score}/${s.maxScore}`,
            percent: `${s.percent}%`,
            date: s.startedAt,
          })),
        };
      }

      default:
        throw new Error(`Unknown tool: "${name}"`);
    }
  }
}
