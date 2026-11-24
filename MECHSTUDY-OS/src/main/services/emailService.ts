import nodemailer from 'nodemailer';
import { all, get, getSetting, setSetting } from '../db';
import type { EmailSettings, TodayPlanEmailContent } from '../../shared/types';

export { EmailSettings, TodayPlanEmailContent };

export function getEmailSettings(): EmailSettings {
  return {
    enabled: getSetting('email.enabled', 'false') === 'true',
    recipientEmail: getSetting('email.recipientEmail', ''),
    studentName: getSetting('email.studentName', 'Mechanical Engineering Scholar'),
    dispatchTime: getSetting('email.dispatchTime', '07:30'),
    smtpHost: getSetting('email.smtpHost', 'smtp.gmail.com'),
    smtpPort: Number(getSetting('email.smtpPort', '465')),
    smtpSecure: getSetting('email.smtpSecure', 'true') === 'true',
    smtpUser: getSetting('email.smtpUser', ''),
    smtpPass: getSetting('email.smtpPass', ''),
    lastSentDate: getSetting('email.lastSentDate', ''),
  };
}

export function updateEmailSettings(patch: Partial<EmailSettings>): EmailSettings {
  if (patch.enabled !== undefined) setSetting('email.enabled', patch.enabled ? 'true' : 'false');
  if (patch.recipientEmail !== undefined) setSetting('email.recipientEmail', patch.recipientEmail.trim());
  if (patch.studentName !== undefined) setSetting('email.studentName', patch.studentName.trim());
  if (patch.dispatchTime !== undefined) setSetting('email.dispatchTime', patch.dispatchTime.trim());
  if (patch.smtpHost !== undefined) setSetting('email.smtpHost', patch.smtpHost.trim());
  if (patch.smtpPort !== undefined) setSetting('email.smtpPort', String(patch.smtpPort));
  if (patch.smtpSecure !== undefined) setSetting('email.smtpSecure', patch.smtpSecure ? 'true' : 'false');
  if (patch.smtpUser !== undefined) setSetting('email.smtpUser', patch.smtpUser.trim());
  if (patch.smtpPass !== undefined) setSetting('email.smtpPass', patch.smtpPass.trim());
  return getEmailSettings();
}

/**
 * Builds HTML and text content for today's study plan email.
 */
export function buildTodayPlanEmailContent(): TodayPlanEmailContent {
  const settings = getEmailSettings();
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  // Retrieve today's planned tasks (strictly excluding Technical Communication)
  const todayTasks = all<any>(`
    SELECT t.id, t.title, t.priority, t.est_minutes, t.notes,
           s.name AS subject_name, tp.title AS topic_title
    FROM study_tasks t
    LEFT JOIN subjects s ON s.id = t.subject_id
    LEFT JOIN topics tp ON tp.id = t.topic_id
    WHERE date(t.planned_date) = date('now', 'localtime')
      AND (s.code IS NULL OR s.code NOT IN ('3ME1-02', '4ME1-02'))
      AND (s.name IS NULL OR s.name NOT LIKE '%Technical Communication%')
    ORDER BY CASE t.priority WHEN 'HIGH' THEN 0 WHEN 'MEDIUM' THEN 1 ELSE 2 END, t.id ASC
  `);

  // Target exam metadata
  const examName = getSetting('exam.targetName', 'RTU Midterm Exam');
  const examDate = getSetting('exam.targetDate', '2026-12-10');
  const examTime = getSetting('exam.targetTime', '10:00 AM');

  const diffMs = new Date(examDate).getTime() - now.getTime();
  const daysRemaining = Math.max(1, Math.round(diffMs / 86400000));

  // Determine current phase
  const isPhase2 = daysRemaining <= 8;
  const currentPhase = isPhase2
    ? 'Phase 2: Exam Pattern, Midterm Papers & Timed Mocks Drill'
    : 'Phase 1: Deep Syllabus & Concept Coverage';

  const totalMin = todayTasks.reduce((acc, t) => acc + (t.est_minutes || 45), 0);
  const studentName = settings.studentName || 'Student';

  // Build clean HTML template
  const tasksHtml = todayTasks.length > 0
    ? todayTasks.map((t, idx) => `
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 12px 10px; font-weight: bold; color: #475569; width: 32px;">${idx + 1}.</td>
        <td style="padding: 12px 10px;">
          <div style="font-weight: 600; font-size: 14px; color: #1e293b;">${t.title}</div>
          <div style="font-size: 12px; color: #64748b; margin-top: 3px;">
            ${t.subject_name ? `<strong>${t.subject_name}</strong> · ` : ''}${t.notes || 'Focus on theory & numericals'}
          </div>
        </td>
        <td style="padding: 12px 10px; text-align: right; width: 80px;">
          <span style="background: ${t.priority === 'HIGH' ? '#fee2e2' : '#f1f5f9'}; color: ${t.priority === 'HIGH' ? '#dc2626' : '#475569'}; padding: 3px 8px; border-radius: 9999px; font-size: 11px; font-weight: bold;">
            ${t.est_minutes || 45} min
          </span>
        </td>
      </tr>
    `).join('')
    : `
      <tr>
        <td colspan="3" style="padding: 24px 10px; text-align: center; color: #64748b; font-size: 13px;">
          No specific tasks scheduled for today. Open MECHSTUDY OS to generate an AI study sprint!
        </td>
      </tr>
    `;

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>MECHSTUDY OS — Today's Study Plan</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <div style="max-width: 600px; margin: 24px auto; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
    
    <!-- Header Banner -->
    <div style="background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%); padding: 32px 24px; text-align: center; color: #ffffff;">
      <h1 style="margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.5px;">MECHSTUDY OS</h1>
      <p style="margin: 6px 0 0 0; font-size: 13px; opacity: 0.9; text-transform: uppercase; letter-spacing: 1px;">Daily Study Dispatch &amp; Timetable</p>
    </div>

    <!-- Countdown & Phase Card -->
    <div style="background: #eff6ff; border-bottom: 1px solid #dbeafe; padding: 18px 24px; text-align: center;">
      <div style="font-size: 12px; font-weight: bold; color: #2563eb; text-transform: uppercase; letter-spacing: 0.5px;">Upcoming Examination</div>
      <div style="font-size: 18px; font-weight: 800; color: #1e3a8a; margin: 4px 0;">
        ${examName}
      </div>
      <div style="display: inline-block; background: #2563eb; color: #ffffff; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: bold; margin-top: 6px;">
        ⏳ ${daysRemaining} Days Remaining · ${examDate} at ${examTime}
      </div>
      <div style="margin-top: 10px; font-size: 12px; color: #4b5563; font-style: italic;">
        Current Sprint: <strong>${currentPhase}</strong>
      </div>
    </div>

    <!-- Main Content -->
    <div style="padding: 24px;">
      <p style="font-size: 15px; line-height: 1.5; margin: 0 0 16px 0;">
        Good morning <strong>${studentName}</strong>! Here is your structured study plan for today, computed to keep you strictly on track for 9+ CGPA and high exam scores:
      </p>

      <!-- Task Table -->
      <table style="width: 100%; border-collapse: collapse; margin-top: 12px;">
        <thead>
          <tr style="border-bottom: 2px solid #e2e8f0; text-align: left;">
            <th style="padding: 8px 10px; font-size: 11px; text-transform: uppercase; color: #64748b;">#</th>
            <th style="padding: 8px 10px; font-size: 11px; text-transform: uppercase; color: #64748b;">Today's Session Target</th>
            <th style="padding: 8px 10px; font-size: 11px; text-transform: uppercase; color: #64748b; text-align: right;">Duration</th>
          </tr>
        </thead>
        <tbody>
          ${tasksHtml}
        </tbody>
      </table>

      <!-- Summary Footer Info -->
      <div style="margin-top: 24px; background: #f8fafc; border-radius: 12px; padding: 16px; border: 1px solid #e2e8f0;">
        <div style="display: flex; justify-content: space-between; font-size: 13px; font-weight: bold; color: #334155;">
          <span>Total Planned Study Budget:</span>
          <span style="color: #2563eb;">${Math.round(totalMin / 60)}h ${totalMin % 60}m</span>
        </div>
        <p style="margin: 8px 0 0 0; font-size: 11.5px; color: #64748b; line-height: 1.4;">
          Tip: Use the <strong>TCS-iON Virtual Calculator (Alt + C)</strong> while solving numericals to build exam-day muscle memory.
        </p>
      </div>

      <!-- Action Button -->
      <div style="margin-top: 24px; text-align: center;">
        <p style="font-size: 12px; color: #94a3b8; margin: 0 0 12px 0;">Launch MECHSTUDY OS on your desktop to start your timers and open notes:</p>
      </div>
    </div>

    <!-- Footer -->
    <div style="background: #f1f5f9; padding: 16px 24px; text-align: center; font-size: 11px; color: #64748b; border-top: 1px solid #e2e8f0;">
      Sent automatically by <strong>MECHSTUDY OS</strong> · Automated Study Planner &amp; Exam Engine.<br>
      To change delivery time or email, go to <em>MECHSTUDY OS → Settings → Daily Study Email</em>.
    </div>
  </div>
</body>
</html>
  `.trim();

  const textBody = `
MECHSTUDY OS — Daily Study Dispatch
====================================
Upcoming: ${examName} (${daysRemaining} Days Left — ${examDate} at ${examTime})
Current Sprint: ${currentPhase}

Good morning ${studentName}! Here is your study plan for today:

${todayTasks.map((t, idx) => `${idx + 1}. [${t.est_minutes || 45}m] ${t.title} (${t.notes || ''})`).join('\n')}

Total Study Time: ${Math.round(totalMin / 60)}h ${totalMin % 60}m.
Open MECHSTUDY OS on your computer to launch focused sessions and lecture notes!
  `.trim();

  return {
    recipientEmail: settings.recipientEmail,
    studentName,
    examName,
    examDate,
    examTime,
    daysRemaining,
    currentPhase,
    tasks: todayTasks,
    totalEstimatedMinutes: totalMin,
    htmlBody,
    textBody,
  };
}

/**
 * Sends today's plan email to the configured recipient.
 */
export async function sendTodayPlanEmail(force: boolean = false): Promise<{
  success: boolean;
  message: string;
  recipient?: string;
  previewOnly?: boolean;
}> {
  const settings = getEmailSettings();
  if (!settings.recipientEmail) {
    throw new Error('Please configure your email address in Settings first.');
  }

  const content = buildTodayPlanEmailContent();

  // If user has not configured SMTP credentials, return preview
  if (!settings.smtpUser || !settings.smtpPass) {
    return {
      success: true,
      previewOnly: true,
      recipient: settings.recipientEmail,
      message: `Study plan email drafted for ${settings.recipientEmail} (${content.tasks.length} tasks). To send automated emails directly to your Gmail inbox, add your Gmail App Password in Settings → Email.`,
    };
  }

  // Create transporter
  const transporter = nodemailer.createTransport({
    host: settings.smtpHost || 'smtp.gmail.com',
    port: settings.smtpPort || 465,
    secure: settings.smtpSecure,
    auth: {
      user: settings.smtpUser,
      pass: settings.smtpPass,
    },
  });

  const subject = `[MECHSTUDY OS] Today's Study Plan · ⏳ ${content.daysRemaining}d to ${content.examName}`;

  await transporter.sendMail({
    from: `"MECHSTUDY OS" <${settings.smtpUser}>`,
    to: settings.recipientEmail,
    subject,
    text: content.textBody,
    html: content.htmlBody,
  });

  const nowStr = new Date().toISOString().slice(0, 10);
  setSetting('email.lastSentDate', nowStr);

  return {
    success: true,
    recipient: settings.recipientEmail,
    message: `Study plan email sent successfully to ${settings.recipientEmail}!`,
  };
}

/**
 * Tests the SMTP connection with a test email.
 */
export async function testSmtpConnection(): Promise<{ success: boolean; message: string }> {
  const settings = getEmailSettings();
  if (!settings.recipientEmail) {
    throw new Error('Please enter a recipient email address.');
  }
  if (!settings.smtpUser || !settings.smtpPass) {
    throw new Error('Please enter your SMTP Username and Password/App Password.');
  }

  const transporter = nodemailer.createTransport({
    host: settings.smtpHost || 'smtp.gmail.com',
    port: settings.smtpPort || 465,
    secure: settings.smtpSecure,
    auth: {
      user: settings.smtpUser,
      pass: settings.smtpPass,
    },
  });

  await transporter.verify();

  await transporter.sendMail({
    from: `"MECHSTUDY OS" <${settings.smtpUser}>`,
    to: settings.recipientEmail,
    subject: `[MECHSTUDY OS] Test Email Notification Verified!`,
    text: `Hello ${settings.studentName || 'Student'}! Your MECHSTUDY OS email notifications are configured correctly. You will receive your daily study plan every morning at ${settings.dispatchTime}.`,
    html: `
      <div style="font-family: sans-serif; padding: 20px; max-width: 500px; border: 1px solid #e2e8f0; border-radius: 12px;">
        <h2 style="color: #2563eb; margin-top: 0;">MECHSTUDY OS Connected!</h2>
        <p>Hello <strong>${settings.studentName || 'Student'}</strong>,</p>
        <p>Your daily study plan email notifications are verified and active. Every morning at <strong>${settings.dispatchTime}</strong>, you will receive today's scheduled topics, mock paper targets, and exam countdowns directly in your inbox.</p>
        <p style="color: #64748b; font-size: 12px; margin-top: 20px;">Keep up the study streak!</p>
      </div>
    `,
  });

  return {
    success: true,
    message: `Connection verified! A test email was sent to ${settings.recipientEmail}.`,
  };
}

/**
 * Checks time and automatically sends daily email if scheduled.
 */
export async function checkAndDispatchDailyEmail(): Promise<boolean> {
  const settings = getEmailSettings();
  if (!settings.enabled || !settings.recipientEmail || !settings.smtpUser || !settings.smtpPass) {
    return false;
  }

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  if (settings.lastSentDate === todayStr) {
    return false; // Already dispatched today
  }

  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const currentTime = `${hours}:${minutes}`;

  // If current time is equal or past scheduled dispatch time
  if (currentTime >= settings.dispatchTime) {
    try {
      await sendTodayPlanEmail(false);
      return true;
    } catch {
      return false;
    }
  }

  return false;
}
