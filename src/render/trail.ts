import * as THREE from 'three';
import type { Mech } from '../sim/mech.ts';

const N = 90;

/** A fading ribbon on the floor tracing where a mech has just been: the footwork, made visible. */
export class GroundTrail {
  private line: THREE.Line;
  private pts = new Float32Array(N * 3);
  private filled = 0;
  private acc = 0;

  constructor(scene: THREE.Scene, color: number) {
    const cols = new Float32Array(N * 3);
    const c = new THREE.Color(color);
    for (let i = 0; i < N; i++) {
      const f = (1 - i / N) ** 1.5 * 1.5;
      cols[i * 3] = c.r * f; cols[i * 3 + 1] = c.g * f; cols[i * 3 + 2] = c.b * f;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pts, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    this.line = new THREE.Line(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9 }));
    this.line.frustumCulled = false;
    scene.add(this.line);
  }

  reset(): void { this.filled = 0; }

  update(m: Mech, dt: number): void {
    this.line.visible = m.alive && this.filled > 1;
    if (!m.alive) { this.filled = 0; return; }
    this.acc += dt;
    if (this.acc < 1 / 60) return;
    this.acc = 0;
    const p = this.pts;
    if (this.filled < N) this.filled++;
    for (let i = N - 1; i > 0; i--) { p[i * 3] = p[(i - 1) * 3]; p[i * 3 + 1] = p[(i - 1) * 3 + 1]; p[i * 3 + 2] = p[(i - 1) * 3 + 2]; }
    p[0] = m.pos.x; p[1] = 0.06; p[2] = m.pos.z;
    for (let i = this.filled; i < N; i++) { p[i * 3] = p[0]; p[i * 3 + 1] = p[1]; p[i * 3 + 2] = p[2]; }
    (this.line.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }
}
