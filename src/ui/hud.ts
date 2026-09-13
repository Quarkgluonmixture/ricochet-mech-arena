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

  private playLabel = document.querySelector('#play .label') as HTMLElement;
  private loading = $('loading');
  private loadingBar = $('loading-bar');
  private loadingText = $('loading-text');
  private settingsPanel = $('settings');
  private musicStatus = $('music-status');
  private fps = $('fps');
  private splash = $('splash');
  private items = Array.from(document.querySelectorAll<HTMLButtonElement>('#menu-list .item'));
  private lives = $('lives');
  private lifePips: HTMLElement[] = [];
  private damage = $('damage');
  private shield = $('shield');

  /** Show the menu. `inProgress` turns the primary item into Resume. */
  /** Life pips under the score; `last` turns the remaining one red and pulsing. */
  setLives(hp: number, max: number): void {
    while (this.lifePips.length < max) { const pip = document.createElement('i'); this.lives.appendChild(pip); this.lifePips.push(pip); }
    while (this.lifePips.length > max) this.lifePips.pop()!.remove();
    this.lifePips.forEach((pip, i) => pip.classList.toggle('lost', i >= hp));
    this.lives.classList.toggle('last', max > 1 && hp === 1);
    this.lives.style.display = max > 1 ? '' : 'none';
  }
  /** Red edge flash on taking a hit. */
  flashDamage(): void {
    this.damage.classList.remove('flash');
    void this.damage.offsetWidth; // restart the animation
    this.damage.classList.add('flash');
  }
  setShield(on: boolean): void { this.shield.classList.toggle('on', on); }

  setOverlay(visible: boolean, inProgress = false): void {
    this.overlay.classList.toggle('hidden', !visible);
    if (visible) this.playLabel.textContent = inProgress ? 'Resume' : 'Play';
  }
  get overlayVisible(): boolean { return !this.overlay.classList.contains('hidden'); }
  /** Attract mode: the live AI-vs-AI scene runs behind the menu with the HUD hidden. */
  setAttract(on: boolean): void { this.hud.classList.toggle('attract', on); }
  setSplash(url: string): void { this.splash.style.backgroundImage = `url('${url}')`; }
  hideSplash(): void { this.splash.classList.add('gone'); }
  setBuild(text: string): void { $('build').textContent = text; }
  /** Keyboard navigation of the menu list. */
  menuMove(dir: 1 | -1): void {
    const i = this.items.findIndex((b) => b.classList.contains('is-active'));
    const n = (i + dir + this.items.length) % this.items.length;
    this.items.forEach((b, k) => b.classList.toggle('is-active', k === n));
  }
  menuActivate(): void { this.items.find((b) => b.classList.contains('is-active'))?.click(); }
  menuHoverSync(): void {
    for (const b of this.items) b.addEventListener('mouseenter', () => this.items.forEach((o) => o.classList.toggle('is-active', o === b)));
  }
  setLoading(loaded: number, total: number): void {
    const done = total > 0 && loaded >= total;
    this.loading.classList.toggle('done', done);
    this.loadingBar.style.width = total > 0 ? `${Math.round((loaded / total) * 100)}%` : '0%';
    this.loadingText.textContent = done ? '' : `Loading ${loaded}/${total}`;
  }
  showSettings(on: boolean): void { this.settingsPanel.classList.toggle('hidden', !on); }
  setMusicStatus(text: string): void { this.musicStatus.textContent = text; }
  setFps(ms: number | null): void {
    this.fps.classList.toggle('show', ms !== null);
    if (ms !== null) this.fps.textContent = `${ms.toFixed(1)} ms · ${Math.round(1000 / Math.max(ms, 0.1))} fps`;
  }

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
