import type { Quality } from '../render/quality.ts';

export interface Settings {
  quality: Quality;
  /** 0..1 */
  sfx: number;
  /** 0..1 */
  music: number;
  /** Mouse sensitivity multiplier. */
  sensitivity: number;
  showFps: boolean;
}

const KEY = 'rma.settings.v1';
const DEFAULTS: Settings = { quality: 'medium', sfx: 0.8, music: 0.6, sensitivity: 1, showFps: false };

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    const s = { ...DEFAULTS, ...parsed };
    if (!['low', 'medium', 'high'].includes(s.quality)) s.quality = DEFAULTS.quality;
    return s;
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s: Settings): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode: settings just don't persist */ }
}
