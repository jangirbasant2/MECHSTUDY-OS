import { Notification, BrowserWindow } from 'electron';
import { all, get, getSetting, setSetting } from '../db';
import { checkAndDispatchDailyEmail } from './emailService';

export interface ReminderSettings {
  enabled: boolean;
  dailyTime: string; // e.g. "18:00"
  quietHoursStart: string; // e.g. "23:00"
  quietHoursEnd: string; // e.g. "08:00"
  lastNotifiedDate?: string;
}

export interface ReminderNotificationPayload {
  title: string;
  body: string;
  subjectId?: number | null;
  subjectName?: string | null;
  topicId?: number | null;
  topicTitle?: string | null;
  documentId?: number | null;
  page?: number | null;
  taskId?: number | null;
}

const MOTIVATIONAL_TEMPLATES = [
  {
    title: 'Time to study! 🔥',
    body: (sub: string, top: string) => `Your ${sub} session is waiting. Let's master ${top} today.`,
  },
  {
    title: 'Ready for GATE & RTU prep? 🚀',
    body: (sub: string, top: string) => `Consistency builds rank! Dive into ${sub}: ${top}.`,
  },
  {
    title: 'Study streak check! 📚',
    body: (sub: string, top: string) => `Keep your momentum going on ${sub} (${top}). Click to start now.`,
  },
  {
    title: 'Consistency is key! ⚙️',
    body: (sub: string, top: string) => `Today's target: ${sub} - ${top}. Step-by-step to 9+ CGPA and GATE ME.`,
  },
  {
    title: 'High-yield focus time! 🎯',
    body: (sub: string, top: string) => `Tackle ${sub} (${top}) today. Your study timer is ready.`,
  },
];

let reminderInterval: NodeJS.Timeout | null = null;
let getMainWindowRef: (() => BrowserWindow | null) | null = null;

export function getReminderSettings(): ReminderSettings {
  return {
    enabled: getSetting('reminder.enabled', 'true') === 'true',
    dailyTime: getSetting('reminder.dailyTime', '18:00'),
    quietHoursStart: getSetting('reminder.quietHoursStart', '23:00'),
    quietHoursEnd: getSetting('reminder.quietHoursEnd', '08:00'),
    lastNotifiedDate: getSetting('reminder.lastNotifiedDate', ''),
  };
}

export function updateReminderSettings(patch: Partial<ReminderSettings>): void {
  if (patch.enabled !== undefined) setSetting('reminder.enabled', patch.enabled ? 'true' : 'false');
  if (patch.dailyTime !== undefined) setSetting('reminder.dailyTime', patch.dailyTime.trim());
  if (patch.quietHoursStart !== undefined) setSetting('reminder.quietHoursStart', patch.quietHoursStart.trim());
  if (patch.quietHoursEnd !== undefined) setSetting('reminder.quietHoursEnd', patch.quietHoursEnd.trim());
}

export function buildTodayReminder(): ReminderNotificationPayload {
  // Query today's pending tasks, strictly excluding Technical Communication (3ME1-02/4ME1-02)
  const todayTask = get<any>(`
    SELECT t.id, t.title, t.subject_id, t.unit_id, t.topic_id, t.document_id, t.page,
           s.name as subject_name, s.code as subject_code,
           tp.title as topic_title
    FROM study_tasks t
    LEFT JOIN subjects s ON s.id = t.subject_id
    LEFT JOIN topics tp ON tp.id = t.topic_id
    WHERE date(t.planned_date) = date('now', 'localtime')
      AND t.status != 'done'
      AND (s.code IS NULL OR s.code NOT IN ('3ME1-02', '4ME1-02'))
      AND (s.name IS NULL OR s.name NOT LIKE '%Technical Communication%')
    ORDER BY CASE t.priority WHEN 'HIGH' THEN 0 WHEN 'MEDIUM' THEN 1 ELSE 2 END, t.id ASC
    LIMIT 1
  `);

  let subjectName = 'Engineering Thermodynamics';
  let topicTitle = 'Entropy & Second Law';
  let subjectId: number | null = null;
  let topicId: number | null = null;
  let documentId: number | null = null;
  let page: number | null = null;
  let taskId: number | null = null;

  if (todayTask) {
    subjectName = todayTask.subject_name || 'Mechanical Engineering';
    topicTitle = todayTask.topic_title || todayTask.title.replace(/^\[AI Plan\]\s*/i, '');
    subjectId = todayTask.subject_id;
    topicId = todayTask.topic_id;
    documentId = todayTask.document_id;
    page = todayTask.page;
    taskId = todayTask.id;
  } else {
    // If no specific task scheduled for today, pick a high-yield core subject/topic
    const fallbackTopic = get<any>(`
      SELECT tp.id as topic_id, tp.title as topic_title, s.id as subject_id, s.name as subject_name
      FROM topics tp
      JOIN units u ON u.id = tp.unit_id
      JOIN subjects s ON s.id = u.subject_id
      WHERE (s.code IS NULL OR s.code NOT IN ('3ME1-02', '4ME1-02'))
        AND (s.name IS NULL OR s.name NOT LIKE '%Technical Communication%')
      ORDER BY RANDOM()
      LIMIT 1
    `);
    if (fallbackTopic) {
      subjectName = fallbackTopic.subject_name;
      topicTitle = fallbackTopic.topic_title;
      subjectId = fallbackTopic.subject_id;
      topicId = fallbackTopic.topic_id;
    }
  }

  const tmpl = MOTIVATIONAL_TEMPLATES[Math.floor(Math.random() * MOTIVATIONAL_TEMPLATES.length)];

  return {
    title: tmpl.title,
    body: tmpl.body(subjectName, topicTitle),
    subjectId,
    subjectName,
    topicId,
    topicTitle,
    documentId,
    page,
    taskId,
  };
}

export function showStudyNotification(payload: ReminderNotificationPayload): boolean {
  if (!Notification.isSupported()) {
    return false;
  }

  try {
    const notif = new Notification({
      title: payload.title,
      body: payload.body,
      silent: false,
    });

    notif.on('click', () => {
      const win = getMainWindowRef ? getMainWindowRef() : null;
      if (win) {
        if (win.isMinimized()) win.restore();
        win.show();
        win.focus();
        win.webContents.send('reminder:startSession', payload);
      }
    });

    notif.show();
    return true;
  } catch {
    return false;
  }
}

function isQuietTime(currentTime: string, quietStart: string, quietEnd: string): boolean {
  if (quietStart === quietEnd) return false;
  if (quietStart < quietEnd) {
    return currentTime >= quietStart && currentTime < quietEnd;
  }
  // Quiet time wraps past midnight (e.g. 23:00 to 08:00)
  return currentTime >= quietStart || currentTime < quietEnd;
}

export function checkAndTriggerReminder(): boolean {
  const settings = getReminderSettings();
  if (!settings.enabled) return false;

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  if (settings.lastNotifiedDate === todayStr) {
    return false; // Already notified today
  }

  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const currentTime = `${hours}:${minutes}`;

  // Check quiet hours
  if (isQuietTime(currentTime, settings.quietHoursStart, settings.quietHoursEnd)) {
    return false;
  }

  // Check if current time has reached or passed scheduled daily reminder time
  if (currentTime >= settings.dailyTime) {
    const payload = buildTodayReminder();
    const sent = showStudyNotification(payload);
    if (sent) {
      setSetting('reminder.lastNotifiedDate', todayStr);
    }
    return sent;
  }

  return false;
}

export function triggerTestReminder(): { success: boolean; payload: ReminderNotificationPayload } {
  const payload = buildTodayReminder();
  const success = showStudyNotification(payload);
  return { success, payload };
}

export function startReminderScheduler(getWin: () => BrowserWindow | null): void {
  getMainWindowRef = getWin;
  if (reminderInterval) {
    clearInterval(reminderInterval);
  }

  // Initial check after 5 seconds
  setTimeout(() => {
    checkAndTriggerReminder();
    void checkAndDispatchDailyEmail().catch((err) => {
      console.warn('[MECHSTUDY OS] Daily email initial dispatch error:', err);
    });
  }, 5000);

  // Check every 10 minutes
  reminderInterval = setInterval(() => {
    checkAndTriggerReminder();
    void checkAndDispatchDailyEmail().catch((err) => {
      console.warn('[MECHSTUDY OS] Daily email periodic dispatch error:', err);
    });
  }, 10 * 60 * 1000);
}

export function stopReminderScheduler(): void {
  if (reminderInterval) {
    clearInterval(reminderInterval);
    reminderInterval = null;
  }
}
