import { getSetting, setSetting } from '../db';

export interface ReaderSettings {
  defaultTool: 'select' | 'highlight' | 'pan' | 'pen' | 'note';
  defaultNoteColor: 'yellow' | 'blue' | 'pink' | 'green';
  aiPanelWidth: number;
}

export const DEFAULT_READER_SETTINGS: ReaderSettings = {
  defaultTool: 'select',
  defaultNoteColor: 'yellow',
  aiPanelWidth: 340,
};

export function getReaderSettings(): ReaderSettings {
  return {
    defaultTool: (getSetting('reader.defaultTool', DEFAULT_READER_SETTINGS.defaultTool) as any),
    defaultNoteColor: (getSetting('reader.defaultNoteColor', DEFAULT_READER_SETTINGS.defaultNoteColor) as any),
    aiPanelWidth: parseInt(getSetting('reader.aiPanelWidth', String(DEFAULT_READER_SETTINGS.aiPanelWidth)), 10) || 340,
  };
}

export function updateReaderSettings(patch: Partial<ReaderSettings>): void {
  if (patch.defaultTool !== undefined) setSetting('reader.defaultTool', patch.defaultTool);
  if (patch.defaultNoteColor !== undefined) setSetting('reader.defaultNoteColor', patch.defaultNoteColor);
  if (patch.aiPanelWidth !== undefined) setSetting('reader.aiPanelWidth', String(patch.aiPanelWidth));
}
