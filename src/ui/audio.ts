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
  clank: ['clank_0', 'clank_1', 'clank_2', 'clank_3', 'clank_4'],
  explode: ['explode_0', 'explode_1', 'explode_2', 'explode_3', 'explode_4'],
  boom: ['boom_0', 'boom_1'],
  damage: ['damage_0', 'damage_1', 'damage_2'],
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

interface Hum { src: AudioBufferSourceNode; gain: GainNode; pan: StereoPannerNode; /** playbackRate at real time */ rate: number }

export class Audio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private sfxDuck!: GainNode;
  private musicDuck!: GainNode;
  private reverb!: ConvolverNode;
  private reverbSend!: GainNode;
  private buffers = new Map<string, AudioBuffer>();
  private hums = new Map<number, Hum>();
  private listenerPos: Vec2 = { x: 0, z: 0 };
  private listenerYaw = 0;
  private loading: Promise<void> | null = null;
  private volumes = { sfx: 0.8, music: 0.6 };
  private musicLp!: BiquadFilterNode;
  /** Kill-cam time scale (1 = real time). Pitches every new one-shot and every live hum down with the sim,
   *  and closes a low-pass over the music, so slow motion is heard as well as seen. */
  private timeScale = 1;
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
    // volume (user setting) → duck (situational: menu, attract) → master
    this.sfxDuck = ctx.createGain();
    this.sfxDuck.connect(this.master);
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = this.volumes.sfx;
    this.sfxBus.connect(this.sfxDuck);
    this.musicDuck = ctx.createGain();
    this.musicDuck.connect(this.master);
    this.musicLp = ctx.createBiquadFilter();
    this.musicLp.type = 'lowpass';
    this.musicLp.frequency.value = 20000;
    this.musicLp.Q.value = 0.5;
    this.musicLp.connect(this.musicDuck);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.volumes.music;
    this.musicBus.connect(this.musicLp);
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

  /**
   * Try to start audio WITHOUT a gesture. Browsers allow it only for sites the user has engaged with
   * before (Chrome's media engagement); otherwise the context stays suspended and we return false.
   */
  async tryAutostart(): Promise<boolean> {
    const ctx = this.ensure();
    if (ctx.state === 'running') return true;
    try { await ctx.resume(); } catch { /* blocked */ }
    // resume() can resolve while the context is still suspended; the state is the truth
    await new Promise((r) => setTimeout(r, 50));
    return (ctx.state as AudioContextState) === 'running';
  }

  get running(): boolean { return this.ctx?.state === 'running'; }

  setVolumes(sfx: number, music: number): void {
    this.volumes = { sfx, music };
    if (!this.ctx) return;
    this.sfxBus.gain.setTargetAtTime(sfx, this.ctx.currentTime, 0.05);
    this.musicBus.gain.setTargetAtTime(music, this.ctx.currentTime, 0.05);
  }

  /** Situational attenuation on top of the user volumes: attract mode mutes effects, pause ducks music. */
  setDuck(sfx: number, music: number): void {
    if (!this.ctx) return;
    this.sfxDuck.gain.setTargetAtTime(sfx, this.ctx.currentTime, 0.15);
    this.musicDuck.gain.setTargetAtTime(music, this.ctx.currentTime, 0.3);
  }

  /** Slow motion: `scale` is the sim-clock multiplier this frame. Cheap to call every frame. */
  setTimeScale(scale: number): void {
    const s = Math.max(0.05, Math.min(1, scale));
    if (Math.abs(s - this.timeScale) < 1e-3) return;
    this.timeScale = s;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    // 20 kHz at real time, ~900 Hz at quarter speed: the music sinks under the moment, it does not stop
    this.musicLp.frequency.setTargetAtTime(20000 * Math.pow(s, 2.25), now, 0.08);
    for (const h of this.hums.values()) h.src.playbackRate.setTargetAtTime(h.rate * s, now, 0.06);
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
  private sample(kind: string, pos: Vec2 | null, level: number, opts: { pitch?: number; pitchVar?: number; send?: number; lowpass?: number } = {}): void {
    if (!this.ctx) return;
    const buf = this.pick(kind);
    if (!buf) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const v = opts.pitchVar ?? 0.08;
    // world sounds slow down with the sim; UI, round and the player's own damage cues stay in screen time
    src.playbackRate.value = (opts.pitch ?? 1) * (1 + (Math.random() * 2 - 1) * v) * (pos ? this.timeScale : 1);
    const g = ctx.createGain();
    const sp = pos ? this.spatial(pos) : { pan: 0, gain: 1 };
    g.gain.value = level * sp.gain;
    const p = ctx.createStereoPanner();
    p.pan.value = sp.pan;
    if (opts.lowpass) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = opts.lowpass;
      lp.Q.value = 0.7;
      src.connect(lp).connect(g).connect(p).connect(this.sfxBus);
    } else src.connect(g).connect(p).connect(this.sfxBus);
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
  /** Ricochet: a dark sci-fi metal thud (spectral centroid ~400 Hz) under a short heavy clank, both pitched
   *  down and low-passed. The first version used the brightest sample in the pack pitched UP — "like tapping
   *  a glass", said the playtest. */
  bounce(pos: Vec2): void {
    this.sample('bounce', pos, 0.8, { pitch: 0.9, pitchVar: 0.08, send: 0.5, lowpass: 2600 });
    this.sample('clank', pos, 0.32, { pitch: 0.82, pitchVar: 0.1, send: 0.3, lowpass: 3200 });
  }
  hit(pos: Vec2): void {
    this.sample('explode', pos, 1.0, { pitchVar: 0.06, send: 0.5 });
    this.sample('boom', pos, 0.9, { pitchVar: 0.05, send: 0.3 });
  }
  dash(pos: Vec2): void { this.sample('dash', pos, 0.6, { pitch: 1.3, pitchVar: 0.1, send: 0.2 }); }
  /** A life lost: heavy plate impact plus a low boom, unpositioned (it is you). */
  damage(lastLife: boolean): void {
    this.sample('damage', null, 0.9, { pitch: 0.8, pitchVar: 0.06, send: 0 });
    this.sample('boom', null, 0.6, { pitch: 1.1, pitchVar: 0.05, send: 0 });
    if (lastLife) this.ui('error');
  }
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
        const rate = (s.owner === playerId ? 1.15 : 0.95) * (1 + (Math.random() - 0.5) * 0.1);
        src.playbackRate.value = rate * this.timeScale;
        const gain = ctx.createGain();
        gain.gain.value = 0;
        const pan = ctx.createStereoPanner();
        src.connect(gain).connect(pan).connect(this.sfxBus);
        src.start();
        h = { src, gain, pan, rate };
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

  private tracks = new Map<string, Promise<AudioBuffer | null>>();
  private music: { url: string; gain: GainNode; timer: number; sources: AudioBufferSourceNode[] } | null = null;
  private static OVERLAP = 2.5;

  /** Start fetching + decoding a track now so playTrack() later is instant. Safe at page load. */
  preloadTrack(url: string): Promise<boolean> { return this.loadTrack(url).then((b) => b !== null); }

  /** Fetch + decode once per URL. A missing or undecodable file resolves to null, never throws. */
  private loadTrack(url: string): Promise<AudioBuffer | null> {
    let p = this.tracks.get(url);
    if (!p) {
      const ctx = this.ensure();
      p = (async () => {
        try {
          const res = await fetch(url);
          if (!res.ok) return null;
          const type = res.headers.get('content-type') ?? '';
          if (type.includes('text/html')) return null; // dev server SPA fallback for a missing file
          return await ctx.decodeAudioData(await res.arrayBuffer());
        } catch {
          return null;
        }
      })();
      this.tracks.set(url, p);
    }
    return p;
  }

  /**
   * Play a track as a seamless loop: each pass fades out over the last OVERLAP seconds while the next pass
   * fades in on top, so any exported song loops without a click or a gap. Crossfades from whatever is
   * playing. Returns false (and leaves the current track alone) when the file is missing.
   *
   * `start` = where the FIRST pass begins (e.g. skip a cold open), `loopStart` = where every later pass
   * begins (e.g. after an intro): "17 s to 33 s is the intro, from 33 s it is the fight" → start 17, loopStart 33.
   * `level` = this track's gain relative to the music volume (1 = as mixed), for balancing tracks against each other.
   */
  async playTrack(url: string, fadeIn = 2, opts: { start?: number; loopStart?: number; level?: number } = {}): Promise<boolean> {
    const buf = await this.loadTrack(url);
    if (!buf) return false;
    if (this.music && this.music.url === url) return true;
    const ctx = this.ensure();
    this.stopTrack(1.5);
    const startAt = Math.min(opts.start ?? 0, Math.max(0, buf.duration - 1));
    const loopAt = Math.min(opts.loopStart ?? 0, Math.max(0, buf.duration - 1));
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(opts.level ?? 1, ctx.currentTime + fadeIn);
    gain.connect(this.musicBus);
    const entry = { url, gain, timer: 0, sources: [] as AudioBufferSourceNode[] };
    this.music = entry;
    const OV = Math.min(Audio.OVERLAP, (buf.duration - loopAt) / 3);
    const pass = (at: number, first: boolean) => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      if (first) g.gain.setValueAtTime(1, at);
      else { g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(1, at + OV); }
      const offset = first ? startAt : loopAt;
      const end = at + (buf.duration - offset);
      g.gain.setValueAtTime(1, end - OV);
      g.gain.linearRampToValueAtTime(0, end);
      src.connect(g).connect(gain);
      src.start(at, offset);
      src.stop(end + 0.05);
      entry.sources.push(src);
      src.onended = () => { entry.sources = entry.sources.filter((x) => x !== src); };
      const next = end - OV;
      entry.timer = window.setTimeout(() => { if (this.music === entry) pass(next, false); }, Math.max(0, (next - ctx.currentTime - 0.6) * 1000));
    };
    pass(ctx.currentTime + 0.05, true);
    return true;
  }

  stopTrack(fade = 1): void {
    if (!this.music || !this.ctx) return;
    const m = this.music;
    this.music = null;
    window.clearTimeout(m.timer);
    m.gain.gain.setTargetAtTime(0, this.ctx.currentTime, fade / 3);
    for (const src of m.sources) { try { src.stop(this.ctx.currentTime + fade + 0.1); } catch { /* already stopped */ } }
  }

  get currentTrack(): string | null { return this.music?.url ?? null; }
  get hasMusic(): boolean { return this.music !== null; }
  /** Sample pack + tracks loaded? (tracks are lazy; this is the sfx bank) */
  get ready(): boolean { return this.total > 0 && this.loaded >= this.total; }
}
