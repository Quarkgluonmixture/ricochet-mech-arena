import * as THREE from 'three';
import { CFG } from '../sim/config.ts';
import type { Mech } from '../sim/mech.ts';

/** A mech built from primitives: legs group (faces the movement direction) + torso group (faces the aim). */
export class MechView {
  root = new THREE.Group();
  legs = new THREE.Group();
  torso = new THREE.Group();
  private leftLeg: THREE.Group;
  private rightLeg: THREE.Group;
  private barrel: THREE.Mesh;
  private ring: THREE.Mesh;
  private ringMat: THREE.MeshBasicMaterial;
  private recoil = 0;
  private phase = 0;
  color: number;

  constructor(scene: THREE.Scene, color: number) {
    this.color = color;
    const body = new THREE.MeshStandardMaterial({ color: 0x8a93a6, roughness: 0.6, metalness: 0.35 });
    const accent = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.3 });
    const glow = new THREE.MeshBasicMaterial({ color });

    const box = (w: number, h: number, d: number, m: THREE.Material) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      return mesh;
    };

    // legs
    const hip = box(0.95, 0.28, 0.6, accent);
    hip.position.y = 0.95;
    this.legs.add(hip);
    const makeLeg = (x: number) => {
      const g = new THREE.Group();
      g.position.set(x, 0.95, 0);
      const thigh = box(0.28, 0.5, 0.36, body);
      thigh.position.y = -0.28;
      const shin = box(0.22, 0.5, 0.3, body);
      shin.position.set(0, -0.72, 0.05);
      const foot = box(0.34, 0.12, 0.6, accent);
      foot.position.set(0, -0.95, 0.12);
      g.add(thigh, shin, foot);
      return g;
    };
    this.leftLeg = makeLeg(-0.36);
    this.rightLeg = makeLeg(0.36);
    this.legs.add(this.leftLeg, this.rightLeg);

    // torso
    this.torso.position.y = 1.05;
    const chest = box(1.15, 0.7, 0.8, body);
    chest.position.y = 0.4;
    const plate = box(0.9, 0.5, 0.12, accent);
    plate.position.set(0, 0.4, -0.44);
    const head = box(0.42, 0.34, 0.42, body);
    head.position.set(0, 0.95, 0);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.09, 0.04), glow);
    visor.position.set(0, 0.97, -0.22);
    const shoulderL = box(0.32, 0.36, 0.5, accent);
    shoulderL.position.set(-0.72, 0.62, 0);
    const shoulderR = box(0.32, 0.36, 0.5, accent);
    shoulderR.position.set(0.72, 0.62, 0);
    const gun = new THREE.Group();
    gun.position.set(0.62, 0.28, -0.2);
    const receiver = box(0.3, 0.3, 0.7, body);
    this.barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 1.1, 12), accent);
    this.barrel.rotation.x = Math.PI / 2;
    this.barrel.position.z = -0.8;
    this.barrel.castShadow = true;
    const muzzle = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.03, 8, 16), glow);
    muzzle.position.z = -1.34;
    gun.add(receiver, this.barrel, muzzle);
    this.torso.add(chest, plate, head, visor, shoulderL, shoulderR, gun);

    // ground ring: bright when the dash is ready
    this.ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, side: THREE.DoubleSide });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.72, 0.86, 40), this.ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.02;

    this.root.add(this.legs, this.torso, this.ring);
    scene.add(this.root);
  }

  kick(): void { this.recoil = 1; }

  update(m: Mech, dt: number): void {
    this.root.visible = m.alive;
    if (!m.alive) return;
    this.root.position.set(m.pos.x, 0, m.pos.z);
    this.legs.rotation.y = m.legsYaw;
    this.torso.rotation.y = m.torsoYaw;
    const speed = Math.hypot(m.vel.x, m.vel.z);
    const gait = Math.min(1, speed / CFG.mech.maxSpeed);
    this.phase += dt * (6 + 8 * gait);
    const swing = Math.sin(this.phase) * 0.55 * gait;
    this.leftLeg.rotation.x = swing;
    this.rightLeg.rotation.x = -swing;
    this.torso.position.y = 1.05 + Math.abs(Math.sin(this.phase)) * 0.06 * gait;
    // lean into a dash
    const lean = m.dashT > 0 ? 0.22 : 0;
    this.legs.rotation.x = lean;
    this.recoil = Math.max(0, this.recoil - dt * 6);
    this.barrel.position.z = -0.8 + this.recoil * 0.25;
    this.ringMat.opacity = m.dashCd <= 0 ? 0.75 : 0.18;
  }
}
