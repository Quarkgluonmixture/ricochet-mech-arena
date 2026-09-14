import type { Quality } from '../render/quality.ts';
import type { Lang } from './i18n.ts';

export interface Settings {
  lang: Lang;
  /** Mechs per team: 1 = the duel, 3 = team battle. */
  matchSize: 1 | 2 | 3;
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
/** AI-vs-AI roster default 2v2 (user, 2026-09-14; was 3v3 from 2026-09-13). */
const DEFAULTS: Settings = { lang: 'zh', matchSize: 2, quality: 'medium', sfx: 0.8, music: 0.6, sensitivity: 1, showFps: false };
/** Bumped when a default changes and the OLD default should be replaced in stored settings: every save
 *  writes the whole object, so a user who never touched the roster still has `matchSize: 3` persisted. */
const VERSION = 2;

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<Settings> & { v?: number };
    const s: Settings = { ...DEFAULTS, ...parsed };
    if ((parsed.v ?? 1) < 2) s.matchSize = DEFAULTS.matchSize; // v1 → v2: roster default 3 → 2
    if (!['low', 'medium', 'high'].includes(s.quality)) s.quality = DEFAULTS.quality;
    if (s.lang !== 'zh' && s.lang !== 'en') s.lang = DEFAULTS.lang;
    if (![1, 2, 3].includes(s.matchSize)) s.matchSize = DEFAULTS.matchSize;
    return s;
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s: Settings): void {
  try { localStorage.setItem(KEY, JSON.stringify({ ...s, v: VERSION })); } catch { /* private mode: settings just don't persist */ }
}
