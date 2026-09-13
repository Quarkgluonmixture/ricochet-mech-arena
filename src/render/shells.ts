import * as THREE from 'three';
import { CFG } from '../sim/config.ts';
import type { Shell } from '../sim/shell.ts';

const TRAIL = 28;

interface View { mesh: THREE.Mesh; light: THREE.PointLight; trail: THREE.Line; pts: Float32Array; cols: Float32Array; n: number }

/** One glowing sphere + point light + fading trail per live shell. */
export class ShellViews {
  private views = new Map<number, View>();
  private sphere = new THREE.SphereGeometry(CFG.shell.radius * 1.15, 14, 10);
  private scene: THREE.Scene;
  private colorOf: (owner: number) => number;

  constructor(scene: THREE.Scene, colorOf: (owner: number) => number) {
    this.scene = scene;
    this.colorOf = colorOf;
  }

  sync(shells: Shell[]): void {
    const seen = new Set<number>();
    for (const s of shells) {
      if (!s.alive) continue;
      seen.add(s.id);
      let v = this.views.get(s.id);
      if (!v) v = this.create(s);
      v.mesh.position.set(s.pos.x, CFG.shell.height, s.pos.z);
      v.light.position.copy(v.mesh.position);
      // shift the trail and append the current position
      const pts = v.pts;
      if (v.n < TRAIL) v.n++;
      for (let i = TRAIL - 1; i > 0; i--) {
        pts[i * 3] = pts[(i - 1) * 3]; pts[i * 3 + 1] = pts[(i - 1) * 3 + 1]; pts[i * 3 + 2] = pts[(i - 1) * 3 + 2];
      }
      pts[0] = s.pos.x; pts[1] = CFG.shell.height; pts[2] = s.pos.z;
      // unfilled tail slots sit on the head so they draw nothing visible
      for (let i = v.n; i < TRAIL; i++) { pts[i * 3] = pts[0]; pts[i * 3 + 1] = pts[1]; pts[i * 3 + 2] = pts[2]; }
      const attr = v.trail.geometry.getAttribute('position') as THREE.BufferAttribute;
      attr.needsUpdate = true;
      v.trail.geometry.computeBoundingSphere();
    }
    for (const [id, v] of this.views) {
      if (seen.has(id)) continue;
      this.scene.remove(v.mesh, v.light, v.trail);
      v.trail.geometry.dispose();
      this.views.delete(id);
    }
  }

  private create(s: Shell): View {
    const color = this.colorOf(s.owner);
    const mesh = new THREE.Mesh(this.sphere, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    const light = new THREE.PointLight(color, 6, 9, 1.6);
    const pts = new Float32Array(TRAIL * 3);
    const cols = new Float32Array(TRAIL * 3);
    const c = new THREE.Color(color);
    for (let i = 0; i < TRAIL; i++) {
      const f = 1 - i / TRAIL;
      cols[i * 3] = c.r * f; cols[i * 3 + 1] = c.g * f; cols[i * 3 + 2] = c.b * f;
      pts[i * 3] = s.pos.x; pts[i * 3 + 1] = CFG.shell.height; pts[i * 3 + 2] = s.pos.z;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const trail = new THREE.Line(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9 }));
    trail.frustumCulled = false;
    this.scene.add(mesh, light, trail);
    const v: View = { mesh, light, trail, pts, cols, n: 0 };
    this.views.set(s.id, v);
    return v;
  }
}
