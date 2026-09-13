import * as THREE from 'three';
import type { Mech } from '../sim/mech.ts';

export type SpecMode = 'director' | 'top';
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const angleDiff = (a: number, b: number) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d <= -Math.PI) d += Math.PI * 2; return d; };

/**
 * AI-vs-AI camera. Director mode frames both mechs from the side of their line, pulling back as they
 * separate; top mode looks straight down on the midpoint. Drag orbits, wheel zooms. Smoothed so the
 * cut never jerks when the pair swaps sides.
 *
 * Kill cam: `focus(victim, shooter)` swings the camera onto that pair (or onto the wreck alone for an own
 * goal) and pulls in close; `focus(null)` lets it drift back to the full-field framing. The swing runs on
 * real time while the sim is slowed, so it reads as a whip pan, not a slow-motion drift.
 */
export class SpectatorCamera {
  mode: SpecMode = 'director';
  /** rad/s of continuous orbit (attract mode behind the menu). */
  autoOrbit = 0;
  private camera: THREE.PerspectiveCamera;
  private theta = 0;
  private thetaOffset = 0;
  private zoom = 1;
  private pos = new THREE.Vector3();
  private look = new THREE.Vector3();
  private init = false;
  private focused: Mech[] | null = null;

  constructor(camera: THREE.PerspectiveCamera) { this.camera = camera; }

  orbit(dTheta: number): void { this.thetaOffset += dTheta; }
  zoomBy(f: number): void { this.zoom = clamp(this.zoom * f, 0.45, 2.4); }
  toggle(): SpecMode { this.mode = this.mode === 'director' ? 'top' : 'director'; return this.mode; }
  reset(): void { this.init = false; this.thetaOffset = 0; this.zoom = 1; this.focused = null; }

  /** Frame these mechs (dead ones included: a wreck keeps its position) instead of everyone alive. */
  focus(mechs: Mech[] | null): void { this.focused = mechs && mechs.length > 0 ? mechs : null; }
  get focusing(): boolean { return this.focused !== null; }

  /** Yaw of the camera's forward in the XZ plane, for positional audio. */
  yaw(): number {
    const d = new THREE.Vector3();
    this.camera.getWorldDirection(d);
    return Math.atan2(-d.x, -d.z);
  }

  update(mechs: Mech[], dt: number): void {
    this.thetaOffset += this.autoOrbit * dt;
    const focus = this.focused;
    const live = mechs.filter((m) => m.alive);
    const pts = focus ?? (live.length > 0 ? live : mechs);
    // centroid and the farthest-apart pair: the pair sets the side the camera stands on, the spread sets the distance
    let mx = 0, mz = 0;
    if (focus) {
      // the kill cam looks mostly at the victim (first), a little towards the shooter
      const w = focus.length > 1 ? 0.62 : 1;
      mx = focus[0].pos.x * w; mz = focus[0].pos.z * w;
      for (let i = 1; i < focus.length; i++) { mx += focus[i].pos.x * (1 - w) / (focus.length - 1); mz += focus[i].pos.z * (1 - w) / (focus.length - 1); }
    } else {
      for (const m of pts) { mx += m.pos.x; mz += m.pos.z; }
      mx /= pts.length; mz /= pts.length;
    }
    let a = pts[0], b = pts[pts.length - 1], best = -1;
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
      const d = Math.hypot(pts[i].pos.x - pts[j].pos.x, pts[i].pos.z - pts[j].pos.z);
      if (d > best) { best = d; a = pts[i]; b = pts[j]; }
    }
    const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
    let sep = Math.max(0, best);
    for (const m of pts) sep = Math.max(sep, 2 * Math.hypot(m.pos.x - mx, m.pos.z - mz));
    const target = new THREE.Vector3();
    const lookAt = new THREE.Vector3(mx, 1, mz);
    if (this.mode === 'top') {
      const h = focus ? clamp((sep * 0.9 + 9) * this.zoom, 12, 40) : clamp((sep * 1.1 + 16) * this.zoom, 18, 70);
      target.set(mx, h, mz);
      lookAt.set(mx, 0, mz);
      this.camera.up.set(0, 0, -1);
    } else {
      // stand on the side of the a→b line the camera is already on, so the pair never flips
      if (sep > 1e-3) {
        const p1 = Math.atan2(dx, -dz); // one perpendicular, as an angle for (cos, sin) in (x, z)
        const p2 = p1 + Math.PI;
        const want = Math.abs(angleDiff(this.theta, p1)) <= Math.abs(angleDiff(this.theta, p2)) ? p1 : p2;
        const d = angleDiff(this.theta, want);
        const step = 1.2 * dt;
        this.theta += Math.abs(d) < step ? d : Math.sign(d) * step;
      }
      const phi = this.theta + this.thetaOffset;
      // kill cam: closer and lower, so the wreck and the shell that did it fill the frame
      const D = focus ? clamp((sep * 0.6 + 5.5) * this.zoom, 6, 22) : clamp((sep * 0.85 + 8) * this.zoom, 9, 48);
      target.set(mx + Math.cos(phi) * D, focus ? D * 0.42 + 1.6 : D * 0.62 + 2, mz + Math.sin(phi) * D);
      this.camera.up.set(0, 1, 0);
    }
    if (!this.init) { this.pos.copy(target); this.look.copy(lookAt); this.init = true; }
    else {
      // whip onto a kill, drift back off it
      const kp = focus ? 7 : 3, kl = focus ? 10 : 4;
      this.pos.lerp(target, 1 - Math.exp(-dt * kp));
      this.look.lerp(lookAt, 1 - Math.exp(-dt * kl));
    }
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.look);
  }
}
