import { forward, right } from '../sim/geom.ts';
import type { Vec2 } from '../sim/geom.ts';

/**
 * All sound is synthesised (VISION §6). Every one-shot is positioned relative to the listener
 * (pan by bearing, gain by distance). Live shells get a continuous hum so they are heard before seen.
 */
export class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private listenerPos: Vec2 = { x: 0, z: 0 };
  private listenerYaw = 0;
  private hums = new Map<number, { osc: OscillatorNode; gain: GainNode; pan: StereoPannerNode; filter: BiquadFilterNode }>();
  private noiseBuf: AudioBuffer | null = null;

  /** Must be called from a user gesture. */
  unlock(): void {
    if (this.ctx) { if (this.ctx.state === 'suspended') void this.ctx.resume(); return; }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 1;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  setListener(pos: Vec2, yaw: number): void { this.listenerPos = pos; this.listenerYaw = yaw; }

  private spatial(pos: Vec2): { pan: number; gain: number } {
    const dx = pos.x - this.listenerPos.x, dz = pos.z - this.listenerPos.z;
    const d = Math.hypot(dx, dz);
    const r = right(this.listenerYaw), f = forward(this.listenerYaw);
    const pan = d < 0.5 ? 0 : (dx * r.x + dz * r.z) / d;
    const behind = d < 0.5 ? 0 : -(dx * f.x + dz * f.z) / d;
    const gain = (1 / (1 + d / 10)) * (behind > 0 ? 1 - 0.25 * behind : 1);
    return { pan: Math.max(-1, Math.min(1, pan)) * 0.85, gain };
  }

  private out(pos: Vec2, level: number): GainNode {
    const ctx = this.ctx!;
    const sp = this.spatial(pos);
    const g = ctx.createGain();
    g.gain.value = level * sp.gain;
    const p = ctx.createStereoPanner();
    p.pan.value = sp.pan;
    g.connect(p).connect(this.master!);
    return g;
  }

  private noise(dur: number): AudioBufferSourceNode {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noiseBuf!;
    src.loop = true;
    src.start();
    src.stop(this.ctx!.currentTime + dur);
    return src;
  }

  fire(pos: Vec2, own: boolean): void {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const dest = this.out(pos, own ? 0.9 : 0.8);
    const n = this.noise(0.25);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(3200, t);
    f.frequency.exponentialRampToValueAtTime(300, t + 0.22);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.7, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
    n.connect(f).connect(g).connect(dest);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.18);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.9, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    o.connect(og).connect(dest);
    o.start(t); o.stop(t + 0.22);
  }

  bounce(pos: Vec2): void {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const dest = this.out(pos, 0.7);
    for (const [freq, dur] of [[1900, 0.12], [2850, 0.08], [760, 0.16]] as const) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(freq, t);
      o.frequency.exponentialRampToValueAtTime(freq * 0.6, t + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.35, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g).connect(dest);
      o.start(t); o.stop(t + dur + 0.01);
    }
  }

  hit(pos: Vec2): void {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const dest = this.out(pos, 1.2);
    const n = this.noise(0.7);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(4000, t);
    f.frequency.exponentialRampToValueAtTime(120, t + 0.6);
    const g = ctx.createGain();
    g.gain.setValueAtTime(1, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.65);
    n.connect(f).connect(g).connect(dest);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(30, t + 0.5);
    const og = ctx.createGain();
    og.gain.setValueAtTime(1, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    o.connect(og).connect(dest);
    o.start(t); o.stop(t + 0.6);
  }

  dash(pos: Vec2): void {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const dest = this.out(pos, 0.5);
    const n = this.noise(0.3);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(400, t);
    f.frequency.exponentialRampToValueAtTime(2400, t + 0.25);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, t);
    g.gain.exponentialRampToValueAtTime(0.6, t + 0.06);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    n.connect(f).connect(g).connect(dest);
  }

  /** Keep one hum per live shell; call every frame with the live list. */
  syncHums(shells: Array<{ id: number; pos: Vec2; alive: boolean; owner: number }>, playerId: number): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const seen = new Set<number>();
    for (const s of shells) {
      if (!s.alive) continue;
      seen.add(s.id);
      let h = this.hums.get(s.id);
      if (!h) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = s.owner === playerId ? 210 : 165;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 900;
        const gain = ctx.createGain();
        gain.gain.value = 0;
        const pan = ctx.createStereoPanner();
        osc.connect(filter).connect(gain).connect(pan).connect(this.master!);
        osc.start();
        h = { osc, gain, pan, filter };
        this.hums.set(s.id, h);
      }
      const sp = this.spatial(s.pos);
      h.gain.gain.setTargetAtTime(0.16 * sp.gain, ctx.currentTime, 0.03);
      h.pan.pan.setTargetAtTime(sp.pan, ctx.currentTime, 0.03);
    }
    for (const [id, h] of this.hums) {
      if (seen.has(id)) continue;
      h.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
      h.osc.stop(ctx.currentTime + 0.1);
      this.hums.delete(id);
    }
  }
}
