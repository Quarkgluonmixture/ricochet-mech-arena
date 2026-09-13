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
  private bannerTimer = 0;
  private pips: HTMLElement[] = [];

  constructor() {
    for (let i = 0; i < CFG.player.maxShells; i++) {
      const pip = document.createElement('i');
      this.shells.appendChild(pip);
      this.pips.push(pip);
    }
  }

  setOverlay(visible: boolean): void { this.overlay.classList.toggle('hidden', !visible); }
  setCamMode(mode: string): void { this.camMode.textContent = mode === 'first' ? '1st · V' : '3rd · V'; }

  say(text: string, who: 'you' | 'ai', hint = '', seconds = 2.2): void {
    this.banner.textContent = text;
    this.banner.className = `show ${who}`;
    this.hint.textContent = hint;
    this.hint.className = hint ? 'show' : '';
    this.bannerTimer = seconds;
  }

  update(player: Mech, ai: Mech, aiSafe: number, aiTotal: number, dt: number): void {
    this.scoreYou.textContent = String(player.kills);
    this.scoreAi.textContent = String(ai.kills);
    const available = player.maxShells - player.shellsOut;
    this.pips.forEach((p, i) => p.classList.toggle('spent', i >= available));
    const ready = player.dashCd <= 0;
    const frac = ready ? 1 : 1 - player.dashCd / CFG.mech.dashCooldown;
    this.dashFill.style.transform = `scaleX(${frac.toFixed(3)})`;
    this.dash.classList.toggle('ready', ready);
    this.aiDebug.textContent = ai.alive && aiTotal > 0 ? `AI safe moves ${aiSafe}/${aiTotal}${aiSafe === 0 ? ' — trapped' : ''}` : '';
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) { this.banner.className = ''; this.hint.className = ''; }
    }
  }
}
