import React from 'react';
import {
  BookOpen, Sparkles, Bell, Camera, Trash2, Check, AlertTriangle, RefreshCw,
  Eye, Clock, Sliders, ExternalLink,
} from 'lucide-react';
import { api } from '../../lib/api';
import { Badge, Spinner } from '../../components/ui';
import type { ReaderSettings, ReminderSettings, AiModelInfo } from '../../../../shared/types';

export function ReaderSettingsTab({
  toast,
}: {
  toast: (m: string, k?: 'info' | 'success' | 'error') => void;
}) {
  const [readerSettings, setReaderSettings] = React.useState<ReaderSettings>({
    defaultTool: 'select',
    defaultNoteColor: 'yellow',
    aiPanelWidth: 340,
  });
  const [reminderSettings, setReminderSettings] = React.useState<ReminderSettings>({
    enabled: true,
    dailyTime: '18:00',
    quietHoursStart: '23:00',
    quietHoursEnd: '08:00',
  });
  const [models, setModels] = React.useState<AiModelInfo[]>([]);
  const [screenshotStats, setScreenshotStats] = React.useState<{ count: number; dirPath: string }>({
    count: 0,
    dirPath: '',
  });
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [testingReminder, setTestingReminder] = React.useState(false);
  const [cleaningScreenshots, setCleaningScreenshots] = React.useState(false);

  const loadData = React.useCallback(async () => {
    try {
      const [rSet, remSet, mdlList, ssStats] = await Promise.all([
        api.reader.getSettings(),
        api.reminders.getSettings(),
        api.ai.listModels().catch(() => []),
        api.ai.countScreenshots().catch(() => ({ count: 0, dirPath: '' })),
      ]);
      setReaderSettings(rSet);
      setReminderSettings(remSet);
      setModels(mdlList);
      setScreenshotStats(ssStats);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    void loadData();
  }, [loadData]);

  const updateReader = async (patch: Partial<ReaderSettings>) => {
    setReaderSettings(prev => ({ ...prev, ...patch }));
    try {
      await api.reader.updateSettings(patch);
      toast('Reader settings saved', 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const updateReminder = async (patch: Partial<ReminderSettings>) => {
    setReminderSettings(prev => ({ ...prev, ...patch }));
    try {
      await api.reminders.updateSettings(patch);
      toast('Reminder settings saved', 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const handleTestReminder = async () => {
    setTestingReminder(true);
    try {
      const res = await api.reminders.test();
      if (res.success) {
        toast(`Notification triggered: "${res.payload.title}"`, 'success');
      } else {
        toast('Windows notifications are disabled or unsupported on this system.', 'error');
      }
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setTestingReminder(false);
    }
  };

  const handleCleanupScreenshots = async () => {
    setCleaningScreenshots(true);
    try {
      const res = await api.ai.cleanupScreenshots();
      const updated = await api.ai.countScreenshots();
      setScreenshotStats(updated);
      toast(`Cleaned up ${res.cleanedFiles} file(s) and ${res.cleanedRows} database record(s).`, 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setCleaningScreenshots(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Spinner size={18} />
      </div>
    );
  }

  const visionModels = (Array.isArray(models) ? models : []).filter(m => {
    const rawName = typeof m === 'string' ? m : (m?.name ?? m?.model ?? '');
    const name = String(rawName).toLowerCase();
    return (
      name.includes('gemini') ||
      name.includes('vision') ||
      name.includes('flash') ||
      name.includes('pro') ||
      name.includes('llava') ||
      name.includes('vl')
    );
  });

  return (
    <div className="space-y-4">
      {/* PDF Reader Defaults */}
      <section className="card p-4">
        <div className="mb-3 flex items-start gap-2">
          <BookOpen size={16} className="mt-0.5" style={{ color: 'var(--color-accent)' }} />
          <div>
            <div className="text-[13px] font-semibold">PDF Reader Preferences</div>
            <div className="text-[11px]" style={{ color: 'var(--color-muted)' }}>
              Configure your default interaction tools and sticky note appearance.
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-[11px] font-medium" style={{ color: 'var(--color-muted)' }}>
              Default Reading Tool
            </label>
            <select
              className="select w-full text-xs"
              value={readerSettings.defaultTool}
              onChange={e => void updateReader({ defaultTool: e.target.value as any })}
            >
              <option value="select">Select Text (Esc)</option>
              <option value="highlight">Highlighter (H)</option>
              <option value="pan">Hand / Pan tool</option>
              <option value="pen">Freehand Pen</option>
              <option value="note">Sticky Note (N)</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-medium" style={{ color: 'var(--color-muted)' }}>
              Default Sticky Note Color
            </label>
            <select
              className="select w-full text-xs"
              value={readerSettings.defaultNoteColor}
              onChange={e => void updateReader({ defaultNoteColor: e.target.value as any })}
            >
              <option value="yellow">Yellow (Classic)</option>
              <option value="blue">Blue (Soft)</option>
              <option value="pink">Pink (Alert)</option>
              <option value="green">Green (Formulas)</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-medium" style={{ color: 'var(--color-muted)' }}>
              AI Panel Width
            </label>
            <select
              className="select w-full text-xs"
              value={readerSettings.aiPanelWidth}
              onChange={e => void updateReader({ aiPanelWidth: Number(e.target.value) })}
            >
              <option value={320}>Standard (320px)</option>
              <option value={380}>Comfortable (380px)</option>
              <option value={440}>Wide / Math (440px)</option>
            </select>
          </div>
        </div>
      </section>

      {/* Daily Study Reminders */}
      <section className="card p-4">
        <div className="mb-3 flex items-start justify-between">
          <div className="flex items-start gap-2">
            <Bell size={16} className="mt-0.5" style={{ color: 'var(--color-accent)' }} />
            <div>
              <div className="text-[13px] font-semibold">Daily Study Reminders</div>
              <div className="text-[11px]" style={{ color: 'var(--color-muted)' }}>
                Native desktop notifications for today's scheduled tasks. Clicking starts your session, timer, and opens the PDF.
              </div>
            </div>
          </div>
          <button
            className="btn btn-sm gap-1"
            onClick={() => void handleTestReminder()}
            disabled={testingReminder}
            title="Trigger an immediate test desktop notification"
          >
            {testingReminder ? <Spinner size={12} /> : <Bell size={12} />}
            Test Notification
          </button>
        </div>

        <div className="space-y-3">
          <label className="flex cursor-pointer items-center gap-2 text-xs">
            <input
              type="checkbox"
              className="checkbox"
              checked={reminderSettings.enabled}
              onChange={e => void updateReminder({ enabled: e.target.checked })}
            />
            <span className="font-medium">Enable daily study reminder notifications</span>
          </label>

          <div className="grid gap-3 sm:grid-cols-3 pt-1">
            <div>
              <label className="mb-1 block text-[11px]" style={{ color: 'var(--color-muted)' }}>
                Scheduled Reminder Time
              </label>
              <input
                type="time"
                className="input w-full text-xs"
                value={reminderSettings.dailyTime}
                onChange={e => void updateReminder({ dailyTime: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px]" style={{ color: 'var(--color-muted)' }}>
                Quiet Hours Start
              </label>
              <input
                type="time"
                className="input w-full text-xs"
                value={reminderSettings.quietHoursStart}
                onChange={e => void updateReminder({ quietHoursStart: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px]" style={{ color: 'var(--color-muted)' }}>
                Quiet Hours End
              </label>
              <input
                type="time"
                className="input w-full text-xs"
                value={reminderSettings.quietHoursEnd}
                onChange={e => void updateReminder({ quietHoursEnd: e.target.value })}
              />
            </div>
          </div>

          <div className="rounded-md border p-2.5 text-[11px] leading-snug" style={{ borderColor: 'var(--color-border)', background: 'var(--color-panel2)' }}>
            <span className="font-semibold">⚡ Study Start Action: </span>
            When you click a reminder notification, MECHSTUDY-OS brings itself to focus, starts an active study session in SQLite, activates the global timer, and opens the relevant textbook or notes page immediately.
          </div>
        </div>
      </section>

      {/* Vision & Diagram Understanding */}
      <section className="card p-4">
        <div className="mb-3 flex items-start gap-2">
          <Eye size={16} className="mt-0.5" style={{ color: 'var(--color-accent)' }} />
          <div>
            <div className="text-[13px] font-semibold">Vision & Diagram Inspection</div>
            <div className="text-[11px]" style={{ color: 'var(--color-muted)' }}>
              Local vision-capable models (e.g. LLaVA, Llama-3.2-Vision) can visually analyze diagrams, thermodynamic cycles, and formulas captured with the screenshot tool.
            </div>
          </div>
        </div>

        <div className="space-y-2 text-xs">
          {visionModels.length > 0 ? (
            <div className="flex items-center gap-2">
              <Badge color="var(--color-accent2)">Vision Model Available</Badge>
              <span className="text-[11.5px]" style={{ color: 'var(--color-muted)' }}>
                Found: {visionModels.map(m => typeof m === 'string' ? m : (m?.name || m?.model || '')).join(', ')}
              </span>
            </div>
          ) : (
            <div className="rounded-md border p-2.5 text-[11px] leading-snug" style={{ borderColor: 'var(--color-border)', background: 'var(--color-panel2)' }}>
              <div className="flex items-center gap-1.5 font-semibold text-amber-500">
                <AlertTriangle size={13} /> Text-only local model active
              </div>
              <p className="mt-1" style={{ color: 'var(--color-muted)' }}>
                To analyze cropped diagrams or visual charts directly with AI, install a vision model such as{' '}
                <code className="text-xs">ollama pull llama3.2-vision</code> or <code className="text-xs">ollama pull llava</code>.
                When using text-only models, the PDF Reader automatically offers OCR text extraction for screenshots.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Temporary Screenshot Storage Management */}
      <section className="card p-4">
        <div className="mb-3 flex items-start justify-between">
          <div className="flex items-start gap-2">
            <Camera size={16} className="mt-0.5" style={{ color: 'var(--color-accent)' }} />
            <div>
              <div className="text-[13px] font-semibold">Temporary Screenshot Storage</div>
              <div className="text-[11px]" style={{ color: 'var(--color-muted)' }}>
                Cropped regions captured in the PDF reader are stored temporarily to protect disk space and privacy.
              </div>
            </div>
          </div>
          <button
            className="btn btn-sm gap-1"
            onClick={() => void handleCleanupScreenshots()}
            disabled={cleaningScreenshots}
            title="Clean up all expired screenshots immediately"
          >
            {cleaningScreenshots ? <Spinner size={12} /> : <Trash2 size={12} />}
            Clean Up Expired
          </button>
        </div>

        <div className="space-y-2 text-xs">
          <div className="flex items-center justify-between border-b pb-2" style={{ borderColor: 'var(--color-border)' }}>
            <span style={{ color: 'var(--color-muted)' }}>Active Temporary Screenshots</span>
            <span className="font-semibold">{screenshotStats.count} file(s)</span>
          </div>
          <div className="flex items-center justify-between border-b pb-2" style={{ borderColor: 'var(--color-border)' }}>
            <span style={{ color: 'var(--color-muted)' }}>Automatic Expiry Policy</span>
            <Badge color="var(--color-accent)">Strict 5-message countdown</Badge>
          </div>
          <p className="text-[11px] leading-snug" style={{ color: 'var(--color-faint)' }}>
            Every screenshot is automatically deleted from disk and SQLite after 5 subsequent messages in the conversation, when the conversation is deleted, or on application startup.
          </p>
        </div>
      </section>
    </div>
  );
}
