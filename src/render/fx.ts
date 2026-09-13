import * as THREE from 'three';
import { CFG } from '../sim/config.ts';

interface Particle { obj: THREE.Object3D; life: number; ttl: number; vel?: THREE.Vector3; grow?: number; mat: THREE.Material & { opacity: number } }

/** Bounce sparks and hit bursts. Everything is a pooled mesh with a lifetime; nothing here touches the sim. */
export class Fx {
  private items: Particle[] = [];
  private ringGeo = new THREE.RingGeometry(0.12, 0.3, 20);
  private cubeGeo = new THREE.BoxGeometry(0.16, 0.16, 0.16);
  private sphereGeo = new THREE.SphereGeometry(1, 16, 12);
  private scene: THREE.Scene;

  constructor(scene: THREE.Scene) { this.scene = scene; }

  bounce(x: number, z: number, nx: number, nz: number, color: number): void {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(this.ringGeo, mat);
    ring.position.set(x + nx * 0.03, CFG.shell.height, z + nz * 0.03);
    ring.lookAt(x + nx, CFG.shell.height, z + nz);
    this.scene.add(ring);
    this.items.push({ obj: ring, life: 0, ttl: 0.3, grow: 6, mat });
    const flash = new THREE.PointLight(color, 8, 6, 2);
    flash.position.set(x + nx * 0.4, CFG.shell.height, z + nz * 0.4);
    this.scene.add(flash);
    this.items.push({ obj: flash, life: 0, ttl: 0.12, mat: { opacity: 1 } as never });
  }

  hit(x: number, z: number, color: number): void {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8 });
    const s = new THREE.Mesh(this.sphereGeo, mat);
    s.position.set(x, 1.1, z);
    s.scale.setScalar(0.3);
    this.scene.add(s);
    this.items.push({ obj: s, life: 0, ttl: 0.45, grow: 7, mat });
    const flash = new THREE.PointLight(0xffffff, 30, 14, 1.5);
    flash.position.set(x, 1.5, z);
    this.scene.add(flash);
    this.items.push({ obj: flash, life: 0, ttl: 0.25, mat: { opacity: 1 } as never });
    for (let i = 0; i < 14; i++) {
      const m = new THREE.MeshStandardMaterial({ color: i % 3 === 0 ? color : 0x8a93a6, transparent: true, opacity: 1 });
      const c = new THREE.Mesh(this.cubeGeo, m);
      c.position.set(x, 1.1, z);
      c.castShadow = true;
      const a = Math.random() * Math.PI * 2;
      const sp = 3 + Math.random() * 6;
      this.scene.add(c);
      this.items.push({ obj: c, life: 0, ttl: 1.1, vel: new THREE.Vector3(Math.cos(a) * sp, 4 + Math.random() * 6, Math.sin(a) * sp), mat: m });
    }
  }

  update(dt: number): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const p = this.items[i];
      p.life += dt;
      const f = p.life / p.ttl;
      if (f >= 1) {
        this.scene.remove(p.obj);
        this.items.splice(i, 1);
        continue;
      }
      if (p.grow) p.obj.scale.setScalar(0.3 + p.grow * f);
      if (p.vel) {
        p.vel.y -= 18 * dt;
        p.obj.position.addScaledVector(p.vel, dt);
        if (p.obj.position.y < 0.08) { p.obj.position.y = 0.08; p.vel.y *= -0.35; p.vel.x *= 0.7; p.vel.z *= 0.7; }
        p.obj.rotation.x += dt * 5; p.obj.rotation.z += dt * 3;
      }
      if (p.obj instanceof THREE.PointLight) p.obj.intensity *= 1 - f * 0.4;
      else p.mat.opacity = 1 - f;
    }
  }
}
