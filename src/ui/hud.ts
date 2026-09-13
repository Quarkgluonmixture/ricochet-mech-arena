import { CFG } from '../sim/config.ts';
import type { Mech } from '../sim/mech.ts';

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
};

/** Score, shells, dash bar, banners and the AI diagnostic line. Pure DOM; reads sim state, never writes it. */
export class Hud {
  private scoreYou = $('score-you');
  private scoreAi = $('score-ai');
  private shells = $('shells');
  private dash = $('dash');
  private dashFill = this.dash.querySelector('i') as HTMLElement;
  private banner = $('banner');
  private hint = $('hint');
  private aiDebug = $('ai-debug');
  private camMode = $('cam-mode');
  private overlay = $('overlay');
  private hud = $('hud');
  private bannerTimer = 0;
  private pips: HTMLElement[] = [];

  constructor() {
    for (let i = 0; i < CFG.player.maxShells; i++) {
      const pip = document.createElement('i');
      this.shells.appendChild(pip);
      this.pips.push(pip);
    }
  }

  private playBtn = $<HTMLButtonElement>('play');
  private loading = $('loading');
  private loadingBar = $('loading-bar');
  private loadingText = $('loading-text');
  private settingsPanel = $('settings');
  private musicStatus = $('music-status');
  private fps = $('fps');

  /** Show the menu. `inProgress` turns the primary button into Resume. */
  setOverlay(visible: boolean, inProgress = false): void {
    this.overlay.classList.toggle('hidden', !visible);
    if (visible) this.playBtn.textContent = inProgress ? 'Resume' : 'Play';
  }
  setLoading(loaded: number, total: number): void {
    const done = total > 0 && loaded >= total;
    this.loading.classList.toggle('done', done);
    this.loadingBar.style.width = total > 0 ? `${Math.round((loaded / total) * 100)}%` : '0%';
    this.loadingText.textContent = done ? '' : `Loading sounds… ${loaded}/${total}`;
  }
  showSettings(on: boolean): void { this.settingsPanel.classList.toggle('hidden', !on); }
  setMusicStatus(text: string): void { this.musicStatus.textContent = text; }
  setFps(ms: number | null): void {
    this.fps.classList.toggle('show', ms !== null);
    if (ms !== null) this.fps.textContent = `${ms.toFixed(1)} ms · ${Math.round(1000 / Math.max(ms, 0.1))} fps`;
  }
  /** Key art behind the start card. A relative URL so it works in dev and under the Pages sub-path. */
  setKeyArt(url: string): void { this.overlay.style.backgroundImage = `linear-gradient(rgba(6,8,12,0.45), rgba(6,8,12,0.8)), url('${url}')`; }
  setSpectate(on: boolean): void { this.hud.classList.toggle('spectate', on); }
  setCamMode(mode: string): void { this.camMode.textContent = mode === 'first' ? '1st · V' : '3rd · V'; }

  say(text: string, who: 'you' | 'ai', hint = '', seconds = 2.2): void {
    this.banner.textContent = text;
    this.banner.className = `show ${who}`;
    this.hint.textContent = hint;
    this.hint.className = hint ? 'show' : '';
    this.bannerTimer = seconds;
  }

  update(player: Mech, ai: Mech, aiSafe: number, aiTotal: number, dt: number, blue?: { safe: number; total: number }): void {
    this.scoreYou.textContent = String(player.kills);
    this.scoreAi.textContent = String(ai.kills);
    const available = player.maxShells - player.shellsOut;
    this.pips.forEach((p, i) => p.classList.toggle('spent', i >= available));
    const ready = player.dashCd <= 0;
    const frac = ready ? 1 : 1 - player.dashCd / CFG.mech.dashCooldown;
    this.dashFill.style.transform = `scaleX(${frac.toFixed(3)})`;
    this.dash.classList.toggle('ready', ready);
    const red = ai.alive && aiTotal > 0 ? `${aiSafe}/${aiTotal}${aiSafe === 0 ? ' trapped' : ''}` : '—';
    if (blue) {
      const b = player.alive && blue.total > 0 ? `${blue.safe}/${blue.total}${blue.safe === 0 ? ' trapped' : ''}` : '—';
      this.aiDebug.textContent = `BLUE safe moves ${b}   ·   RED safe moves ${red}`;
    } else this.aiDebug.textContent = ai.alive && aiTotal > 0 ? `AI safe moves ${red}` : '';
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) { this.banner.className = ''; this.hint.className = ''; }
    }
  }
}
