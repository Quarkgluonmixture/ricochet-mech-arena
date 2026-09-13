import { forward, right } from '../sim/geom.ts';
import type { Vec2 } from '../sim/geom.ts';

/**
 * Sample-based sound (Kenney CC0, see public/audio/sfx/CREDITS.txt) with a small synthesised layer,
 * positioned by bearing and distance, sent through a shared reverb, summed into a compressor.
 * Music is a looping track the user drops into public/audio/bgm.mp3 (Suno etc.). Everything degrades
 * to silence, never to an error: a missing file just does not play.
 */
const SFX: Record<string, string[]> = {
  fire: ['fire_0', 'fire_1', 'fire_2', 'fire_3', 'fire_4'],
  bounce: ['bounce_0', 'bounce_1', 'bounce_2', 'bounce_3', 'bounce_4'],
  explode: ['explode_0', 'explode_1', 'explode_2', 'explode_3', 'explode_4'],
  boom: ['boom_0', 'boom_1'],
  dash: ['dash'],
  hum: ['hum'],
  ui_click: ['ui_click'],
  ui_confirm: ['ui_confirm'],
  ui_back: ['ui_back'],
  ui_switch: ['ui_switch'],
  ui_error: ['ui_error'],
  round: ['round'],
};

export type UiSound = 'click' | 'confirm' | 'back' | 'switch' | 'error';

interface Hum { src: AudioBufferSourceNode; gain: GainNode; pan: StereoPannerNode }

export class Audio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private reverb!: ConvolverNode;
  private reverbSend!: GainNode;
  private buffers = new Map<string, AudioBuffer>();
  private hums = new Map<number, Hum>();
  private listenerPos: Vec2 = { x: 0, z: 0 };
  private listenerYaw = 0;
  private music: { src: AudioBufferSourceNode; gain: GainNode; url: string } | null = null;
  private loading: Promise<void> | null = null;
  private volumes = { sfx: 0.8, music: 0.6 };
  /** Load progress for the start screen. */
  loaded = 0;
  total = 0;

  /** Build the graph (allowed before a gesture; the context just stays suspended until unlock()). */
  private ensure(): AudioContext {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 18; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.2;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(comp);
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = this.volumes.sfx;
    this.sfxBus.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.volumes.music;
    this.musicBus.connect(this.master);
    // reverb: 1.6 s exponentially decaying stereo noise, a little darker on the tail
    this.reverb = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 1.6);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    this.reverb.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.35;
    this.reverb.connect(wet).connect(this.sfxBus);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 1;
    this.reverbSend.connect(this.reverb);
    return ctx;
  }

  /** Fetch and decode every sample. Safe to call at page load. */
  preload(): Promise<void> {
    if (this.loading) return this.loading;
    const ctx = this.ensure();
    const names = Object.values(SFX).flat();
    this.total = names.length;
    this.loaded = 0;
    this.loading = Promise.all(names.map(async (name) => {
      try {
        const res = await fetch(`audio/sfx/${name}.m4a`);
        if (!res.ok) throw new Error(String(res.status));
        const buf = await ctx.decodeAudioData(await res.arrayBuffer());
        this.buffers.set(name, buf);
      } catch (e) {
        console.warn(`sfx missing: ${name}`, e);
      } finally {
        this.loaded++;
      }
    })).then(() => undefined);
    return this.loading;
  }

  /** Must be called from a user gesture. */
  unlock(): void {
    const ctx = this.ensure();
    if (ctx.state === 'suspended') void ctx.resume();
    void this.preload();
  }

  setVolumes(sfx: number, music: number): void {
    this.volumes = { sfx, music };
    if (!this.ctx) return;
    this.sfxBus.gain.setTargetAtTime(sfx, this.ctx.currentTime, 0.05);
    this.musicBus.gain.setTargetAtTime(music, this.ctx.currentTime, 0.05);
  }

  setListener(pos: Vec2, yaw: number): void { this.listenerPos = pos; this.listenerYaw = yaw; }

  private spatial(pos: Vec2): { pan: number; gain: number } {
    const dx = pos.x - this.listenerPos.x, dz = pos.z - this.listenerPos.z;
    const d = Math.hypot(dx, dz);
    const r = right(this.listenerYaw), f = forward(this.listenerYaw);
    const pan = d < 0.5 ? 0 : (dx * r.x + dz * r.z) / d;
    const behind = d < 0.5 ? 0 : -(dx * f.x + dz * f.z) / d;
    const gain = (1 / (1 + d / 11)) * (behind > 0 ? 1 - 0.25 * behind : 1);
    return { pan: Math.max(-1, Math.min(1, pan)) * 0.8, gain };
  }

  private pick(kind: string): AudioBuffer | null {
    const names = SFX[kind];
    if (!names) return null;
    const name = names[Math.floor(Math.random() * names.length)];
    return this.buffers.get(name) ?? null;
  }

  /** Play a sample at a world position: distance gain, stereo pan, pitch variation, reverb send. */
  private sample(kind: string, pos: Vec2 | null, level: number, opts: { pitch?: number; pitchVar?: number; send?: number } = {}): void {
    if (!this.ctx) return;
    const buf = this.pick(kind);
    if (!buf) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const v = opts.pitchVar ?? 0.08;
    src.playbackRate.value = (opts.pitch ?? 1) * (1 + (Math.random() * 2 - 1) * v);
    const g = ctx.createGain();
    const sp = pos ? this.spatial(pos) : { pan: 0, gain: 1 };
    g.gain.value = level * sp.gain;
    const p = ctx.createStereoPanner();
    p.pan.value = sp.pan;
    src.connect(g).connect(p).connect(this.sfxBus);
    if (opts.send !== 0 && pos) {
      const send = ctx.createGain();
      send.gain.value = (opts.send ?? 0.3) * sp.gain;
      p.connect(send).connect(this.reverbSend);
    }
    src.start();
  }

  /** Synth sub-thump under the fire sample so a shot has weight the small sample lacks. */
  private thump(pos: Vec2, level: number): void {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const sp = this.spatial(pos);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.16);
    const g = ctx.createGain();
    g.gain.setValueAtTime(level * sp.gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    o.connect(g).connect(this.sfxBus);
    o.start(t); o.stop(t + 0.2);
  }

  fire(pos: Vec2, own: boolean): void {
    this.sample('fire', pos, own ? 0.55 : 0.5, { pitch: 0.85, pitchVar: 0.06, send: 0.25 });
    this.thump(pos, own ? 0.7 : 0.5);
  }
  bounce(pos: Vec2): void { this.sample('bounce', pos, 0.7, { pitch: 1.1, pitchVar: 0.12, send: 0.45 }); }
  hit(pos: Vec2): void {
    this.sample('explode', pos, 1.0, { pitchVar: 0.06, send: 0.5 });
    this.sample('boom', pos, 0.9, { pitchVar: 0.05, send: 0.3 });
  }
  dash(pos: Vec2): void { this.sample('dash', pos, 0.6, { pitch: 1.3, pitchVar: 0.1, send: 0.2 }); }
  round(): void { this.sample('round', null, 0.5, { pitchVar: 0 }); }
  ui(kind: UiSound): void { this.sample(`ui_${kind}`, null, 0.5, { pitchVar: 0.02, send: 0 }); }

  /** One looping engine hum per live shell, panned and attenuated every frame: heard before seen. */
  syncHums(shells: Array<{ id: number; pos: Vec2; alive: boolean; owner: number }>, playerId: number): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const buf = this.buffers.get('hum');
    const seen = new Set<number>();
    for (const s of shells) {
      if (!s.alive) continue;
      seen.add(s.id);
      let h = this.hums.get(s.id);
      if (!h) {
        if (!buf) continue;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        src.playbackRate.value = (s.owner === playerId ? 1.15 : 0.95) * (1 + (Math.random() - 0.5) * 0.1);
        const gain = ctx.createGain();
        gain.gain.value = 0;
        const pan = ctx.createStereoPanner();
        src.connect(gain).connect(pan).connect(this.sfxBus);
        src.start();
        h = { src, gain, pan };
        this.hums.set(s.id, h);
      }
      const sp = this.spatial(s.pos);
      h.gain.gain.setTargetAtTime(0.22 * sp.gain, ctx.currentTime, 0.03);
      h.pan.pan.setTargetAtTime(sp.pan, ctx.currentTime, 0.03);
    }
    for (const [id, h] of this.hums) {
      if (seen.has(id)) continue;
      h.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
      h.src.stop(ctx.currentTime + 0.12);
      this.hums.delete(id);
    }
  }

  /** Loop a music track (fade in). Missing or undecodable file = no music, no error. */
  async startMusic(url: string): Promise<boolean> {
    const ctx = this.ensure();
    if (this.music && this.music.url === url) return true;
    this.stopMusic();
    try {
      const res = await fetch(url);
      if (!res.ok) return false;
      const buf = await ctx.decodeAudioData(await res.arrayBuffer());
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(1, ctx.currentTime + 2);
      src.connect(gain).connect(this.musicBus);
      src.start();
      this.music = { src, gain, url };
      return true;
    } catch {
      return false;
    }
  }

  stopMusic(): void {
    if (!this.music || !this.ctx) return;
    const m = this.music;
    m.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4);
    m.src.stop(this.ctx.currentTime + 1.5);
    this.music = null;
  }

  get hasMusic(): boolean { return this.music !== null; }
}
