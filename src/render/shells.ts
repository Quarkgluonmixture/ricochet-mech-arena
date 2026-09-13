import * as THREE from 'three';
import { CFG } from '../sim/config.ts';
import type { Shell } from '../sim/shell.ts';

const TRAIL = 28;

interface View { mesh: THREE.Mesh; halo: THREE.Sprite; trail: THREE.Line; pts: Float32Array; cols: Float32Array; n: number; color: number }

/** Soft radial glow for the halo sprite, drawn once. */
function haloTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.12)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * One glowing sphere + fading trail per live shell, and a FIXED pool of point lights that follow the
 * newest shells. The pool never grows or shrinks during play: every change in the number of lights in a
 * scene recompiles every lit shader, and a light per shell meant a hitch on every shot and every expiry.
 */
export class ShellViews {
  private static sphereMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.6, 1.6) });
  private static halo = haloTexture();
  private views = new Map<number, View>();
  private sphere = new THREE.SphereGeometry(CFG.shell.radius * 0.85, 14, 10);
  private scene: THREE.Scene;
  private colorOf: (owner: number) => number;
  private lights: THREE.PointLight[] = [];

  constructor(scene: THREE.Scene, colorOf: (owner: number) => number, lightCount = 4) {
    this.scene = scene;
    this.colorOf = colorOf;
    this.setLightCount(lightCount);
  }

  /** Resize the pool (quality change). One recompile, not one per shot. */
  setLightCount(n: number): void {
    while (this.lights.length > n) { const l = this.lights.pop()!; this.scene.remove(l); l.dispose(); }
    while (this.lights.length < n) {
      const l = new THREE.PointLight(0xffffff, 0, 9, 1.6);
      l.position.set(0, -50, 0);
      this.scene.add(l);
      this.lights.push(l);
    }
  }

  sync(shells: Shell[]): void {
    const seen = new Set<number>();
    for (const s of shells) {
      if (!s.alive) continue;
      seen.add(s.id);
      let v = this.views.get(s.id);
      if (!v) v = this.create(s);
      v.mesh.position.set(s.pos.x, CFG.shell.height, s.pos.z);
      v.halo.position.copy(v.mesh.position);
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
      this.scene.remove(v.mesh, v.halo, v.trail);
      v.trail.geometry.dispose();
      v.halo.material.dispose();
      this.views.delete(id);
    }
    // the newest shells get the lights; the rest glow by emissive + bloom only
    const live = shells.filter((s) => s.alive).sort((a, b) => b.id - a.id);
    for (let i = 0; i < this.lights.length; i++) {
      const l = this.lights[i];
      const s = live[i];
      if (!s) { l.intensity = 0; l.position.y = -50; continue; }
      l.intensity = 6;
      l.color.set(this.colorOf(s.owner));
      l.position.set(s.pos.x, CFG.shell.height, s.pos.z);
    }
  }

  private create(s: Shell): View {
    const color = this.colorOf(s.owner);
    const mesh = new THREE.Mesh(this.sphere, ShellViews.sphereMat);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: ShellViews.halo, color: new THREE.Color(color).multiplyScalar(1.4), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.scale.setScalar(1.1);
    const pts = new Float32Array(TRAIL * 3);
    const cols = new Float32Array(TRAIL * 3);
    const c = new THREE.Color(color);
    for (let i = 0; i < TRAIL; i++) {
      const f = (1 - i / TRAIL) * 1.8; // > 1 near the head so the trail blooms too
      cols[i * 3] = c.r * f; cols[i * 3 + 1] = c.g * f; cols[i * 3 + 2] = c.b * f;
      pts[i * 3] = s.pos.x; pts[i * 3 + 1] = CFG.shell.height; pts[i * 3 + 2] = s.pos.z;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const trail = new THREE.Line(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9 }));
    trail.frustumCulled = false;
    this.scene.add(mesh, halo, trail);
    const v: View = { mesh, halo, trail, pts, cols, n: 0, color };
    this.views.set(s.id, v);
    return v;
  }
}
