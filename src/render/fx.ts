import * as THREE from 'three';
import { CFG } from '../sim/config.ts';
import { hdr } from './assets.ts';

interface Particle { obj: THREE.Object3D; life: number; ttl: number; vel?: THREE.Vector3; grow?: number; shrink?: boolean; mat?: THREE.Material & { opacity: number } }
interface Flash { light: THREE.PointLight; life: number; ttl: number; peak: number }

const FLASH_POOL = 4;

/**
 * Bounce sparks, hit bursts, debris. Lights come from a FIXED pool: every change in the number of lights
 * in a scene recompiles every lit shader, so a light per event meant a hitch on every bounce.
 */
export class Fx {
  private items: Particle[] = [];
  private flashes: Flash[] = [];
  private ringGeo = new THREE.RingGeometry(0.12, 0.3, 20);
  private cubeGeo = new THREE.BoxGeometry(0.16, 0.16, 0.16);
  private sphereGeo = new THREE.SphereGeometry(1, 16, 12);
  private debrisGrey = new THREE.MeshStandardMaterial({ color: 0x8a93a6, roughness: 0.6, metalness: 0.3 });
  private debrisTint = new Map<number, THREE.MeshStandardMaterial>();
  private scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    for (let i = 0; i < FLASH_POOL; i++) {
      const light = new THREE.PointLight(0xffffff, 0, 10, 1.6);
      light.position.set(0, -50, 0);
      scene.add(light);
      this.flashes.push({ light, life: 0, ttl: 0, peak: 0 });
    }
  }

  bounce(x: number, z: number, nx: number, nz: number, color: number): void {
    const mat = new THREE.MeshBasicMaterial({ color: hdr(color, 2.2), transparent: true, opacity: 0.9, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(this.ringGeo, mat);
    ring.position.set(x + nx * 0.03, CFG.shell.height, z + nz * 0.03);
    ring.lookAt(x + nx, CFG.shell.height, z + nz);
    this.scene.add(ring);
    this.items.push({ obj: ring, life: 0, ttl: 0.3, grow: 6, mat });
    this.flash(x + nx * 0.4, CFG.shell.height, z + nz * 0.4, color, 8, 6, 0.12);
  }

  hit(x: number, z: number, color: number): void {
    const mat = new THREE.MeshBasicMaterial({ color: hdr(color, 2.0), transparent: true, opacity: 0.8 });
    const s = new THREE.Mesh(this.sphereGeo, mat);
    s.position.set(x, 1.1, z);
    s.scale.setScalar(0.3);
    this.scene.add(s);
    this.items.push({ obj: s, life: 0, ttl: 0.45, grow: 7, mat });
    this.flash(x, 1.5, z, 0xffffff, 30, 14, 0.25);
    let tint = this.debrisTint.get(color);
    if (!tint) { tint = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.3 }); this.debrisTint.set(color, tint); }
    for (let i = 0; i < 12; i++) {
      const c = new THREE.Mesh(this.cubeGeo, i % 3 === 0 ? tint : this.debrisGrey);
      c.position.set(x, 1.1, z);
      c.castShadow = true;
      const a = Math.random() * Math.PI * 2;
      const sp = 3 + Math.random() * 6;
      this.scene.add(c);
      this.items.push({ obj: c, life: 0, ttl: 1.1, shrink: true, vel: new THREE.Vector3(Math.cos(a) * sp, 4 + Math.random() * 6, Math.sin(a) * sp) });
    }
  }

  /** Short-lived light from the pool: takes the slot with the least life left. */
  private flash(x: number, y: number, z: number, color: number, intensity: number, range: number, ttl: number): void {
    let slot = this.flashes[0];
    for (const f of this.flashes) if (f.ttl - f.life < slot.ttl - slot.life) slot = f;
    slot.light.color.set(color);
    slot.light.intensity = intensity;
    slot.light.distance = range;
    slot.light.position.set(x, y, z);
    slot.life = 0; slot.ttl = ttl; slot.peak = intensity;
  }

  update(dt: number): void {
    for (const fl of this.flashes) {
      if (fl.ttl <= 0) continue;
      fl.life += dt;
      const f = fl.life / fl.ttl;
      if (f >= 1) { fl.light.intensity = 0; fl.light.position.y = -50; fl.ttl = 0; continue; }
      fl.light.intensity = fl.peak * (1 - f);
    }
    for (let i = this.items.length - 1; i >= 0; i--) {
      const p = this.items[i];
      p.life += dt;
      const f = p.life / p.ttl;
      if (f >= 1) {
        this.scene.remove(p.obj);
        if (p.mat) p.mat.dispose();
        this.items.splice(i, 1);
        continue;
      }
      if (p.grow) p.obj.scale.setScalar(0.3 + p.grow * f);
      if (p.shrink) p.obj.scale.setScalar(f < 0.7 ? 1 : Math.max(0.01, 1 - (f - 0.7) / 0.3));
      if (p.vel) {
        p.vel.y -= 18 * dt;
        p.obj.position.addScaledVector(p.vel, dt);
        if (p.obj.position.y < 0.08) { p.obj.position.y = 0.08; p.vel.y *= -0.35; p.vel.x *= 0.7; p.vel.z *= 0.7; }
        p.obj.rotation.x += dt * 5; p.obj.rotation.z += dt * 3;
      }
      if (p.mat) p.mat.opacity = 1 - f;
    }
  }
}
