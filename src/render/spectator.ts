import * as THREE from 'three';
import type { Mech } from '../sim/mech.ts';

export type SpecMode = 'director' | 'top';
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const angleDiff = (a: number, b: number) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d <= -Math.PI) d += Math.PI * 2; return d; };

/**
 * AI-vs-AI camera. Director mode frames both mechs from the side of their line, pulling back as they
 * separate; top mode looks straight down on the midpoint. Drag orbits, wheel zooms. Smoothed so the
 * cut never jerks when the pair swaps sides.
 */
export class SpectatorCamera {
  mode: SpecMode = 'director';
  private camera: THREE.PerspectiveCamera;
  private theta = 0;
  private thetaOffset = 0;
  private zoom = 1;
  private pos = new THREE.Vector3();
  private look = new THREE.Vector3();
  private init = false;

  constructor(camera: THREE.PerspectiveCamera) { this.camera = camera; }

  orbit(dTheta: number): void { this.thetaOffset += dTheta; }
  zoomBy(f: number): void { this.zoom = clamp(this.zoom * f, 0.45, 2.4); }
  toggle(): SpecMode { this.mode = this.mode === 'director' ? 'top' : 'director'; return this.mode; }
  reset(): void { this.init = false; this.thetaOffset = 0; this.zoom = 1; }

  /** Yaw of the camera's forward in the XZ plane, for positional audio. */
  yaw(): number {
    const d = new THREE.Vector3();
    this.camera.getWorldDirection(d);
    return Math.atan2(-d.x, -d.z);
  }

  update(a: Mech, b: Mech, dt: number): void {
    const mx = (a.pos.x + b.pos.x) / 2, mz = (a.pos.z + b.pos.z) / 2;
    const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
    const sep = Math.hypot(dx, dz);
    const target = new THREE.Vector3();
    const lookAt = new THREE.Vector3(mx, 1, mz);
    if (this.mode === 'top') {
      const h = clamp((sep * 1.1 + 16) * this.zoom, 18, 70);
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
      const D = clamp((sep * 0.85 + 8) * this.zoom, 9, 48);
      target.set(mx + Math.cos(phi) * D, D * 0.62 + 2, mz + Math.sin(phi) * D);
      this.camera.up.set(0, 1, 0);
    }
    if (!this.init) { this.pos.copy(target); this.look.copy(lookAt); this.init = true; }
    else {
      this.pos.lerp(target, 1 - Math.exp(-dt * 3));
      this.look.lerp(lookAt, 1 - Math.exp(-dt * 4));
    }
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.look);
  }
}
