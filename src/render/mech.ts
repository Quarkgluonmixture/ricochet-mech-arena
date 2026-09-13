import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { CFG } from '../sim/config.ts';
import type { Mech } from '../sim/mech.ts';
import { TEX, getTexture, hdr } from './assets.ts';

/**
 * Procedural walker mech, second pass. Bevelled armour slabs over a dark frame, exposed hip and knee
 * joints with a piston behind each shin, an angled chest plate, squared pauldrons, a sensor head with a
 * visor slit, a right-arm cannon with a muzzle brake and heat vents that flare on firing, a backpack with
 * two thrusters that light up on a dash. Legs face the movement direction, the torso faces the aim.
 */
export class MechView {
  root = new THREE.Group();
  legs = new THREE.Group();
  torso = new THREE.Group();
  color: number;
  private thighL!: THREE.Group;
  private thighR!: THREE.Group;
  private shinL!: THREE.Group;
  private shinR!: THREE.Group;
  private footL!: THREE.Group;
  private footR!: THREE.Group;
  private barrel!: THREE.Mesh;
  private vents: THREE.MeshBasicMaterial;
  private thrust: THREE.MeshBasicMaterial;
  private ringMat: THREE.MeshBasicMaterial;
  private recoil = 0;
  private phase = 0;
  private thrustLevel = 0;

  constructor(scene: THREE.Scene, color: number) {
    this.color = color;
    const frame = new THREE.MeshStandardMaterial({ color: 0x525a6a, roughness: 0.55, metalness: 0.5 });
    const plate = new THREE.MeshStandardMaterial({ color: 0xa9b3c4, roughness: 0.55, metalness: 0.35 });
    const accent = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.3 });
    const joint = new THREE.MeshStandardMaterial({ color: 0x23272f, roughness: 0.35, metalness: 0.8 });
    getTexture(TEX.hull, (t) => {
      plate.map = t; plate.color.set(0xd6dde8); plate.needsUpdate = true;
      frame.map = t; frame.color.set(0x6e7788); frame.needsUpdate = true;
      accent.map = t; accent.needsUpdate = true;
    });
    const glow = new THREE.MeshBasicMaterial({ color: hdr(color, 2.0) });
    this.vents = new THREE.MeshBasicMaterial({ color: hdr(0xff7a3c, 0.12) });
    this.thrust = new THREE.MeshBasicMaterial({ color: hdr(0x7fd8ff, 0.18) });

    const rbox = (w: number, h: number, d: number, m: THREE.Material, r = 0.035) => {
      const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(r, Math.min(w, h, d) / 2.2)), m);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      return mesh;
    };
    const cyl = (rt: number, rb: number, h: number, m: THREE.Material, seg = 16) => {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      return mesh;
    };
    const at = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T => { o.position.set(x, y, z); return o; };

    // ---------------- legs ----------------
    const pelvis = at(rbox(0.78, 0.26, 0.5, frame), 0, 1.0, 0);
    this.legs.add(pelvis);
    for (const side of [-1, 1] as const) {
      const hipJoint = cyl(0.13, 0.13, 0.2, joint); hipJoint.rotation.z = Math.PI / 2;
      this.legs.add(at(hipJoint, side * 0.42, 1.0, 0));
      const thigh = new THREE.Group();
      thigh.position.set(side * 0.36, 1.0, 0);
      thigh.add(at(rbox(0.3, 0.54, 0.4, plate, 0.05), 0, -0.3, -0.02));
      thigh.add(at(rbox(0.12, 0.3, 0.44, frame), side * 0.17, -0.3, 0));
      const knee = cyl(0.14, 0.14, 0.38, joint); knee.rotation.z = Math.PI / 2;
      thigh.add(at(knee, 0, -0.6, 0.02));
      const kneeLight = new THREE.Mesh(new THREE.CircleGeometry(0.06, 12), glow);
      kneeLight.rotation.y = side * Math.PI / 2;
      thigh.add(at(kneeLight, side * 0.2, -0.6, 0.02));
      const shin = new THREE.Group();
      shin.position.set(0, -0.6, 0.02);
      shin.add(at(rbox(0.24, 0.5, 0.3, frame), 0, -0.27, 0.0));
      shin.add(at(rbox(0.28, 0.32, 0.1, plate), 0, -0.2, -0.17)); // shin guard
      const piston = cyl(0.03, 0.03, 0.4, joint, 10); piston.rotation.x = 0.28;
      shin.add(at(piston, 0, -0.25, 0.19));
      const housing = cyl(0.055, 0.055, 0.18, frame, 12); housing.rotation.x = 0.28;
      shin.add(at(housing, 0, -0.08, 0.14));
      const foot = new THREE.Group();
      foot.position.set(0, -0.52, 0);
      foot.add(at(rbox(0.34, 0.12, 0.56, frame), 0, -0.06, -0.04));
      const toe = rbox(0.3, 0.1, 0.2, plate); toe.rotation.x = 0.35;
      foot.add(at(toe, 0, -0.03, -0.36));
      foot.add(at(rbox(0.3, 0.1, 0.16, plate), 0, -0.04, 0.26)); // heel
      shin.add(foot);
      thigh.add(shin);
      this.legs.add(thigh);
      if (side < 0) { this.thighL = thigh; this.shinL = shin; this.footL = foot; } else { this.thighR = thigh; this.shinR = shin; this.footR = foot; }
    }

    // ---------------- torso ----------------
    this.torso.position.y = 1.12;
    this.torso.add(at(cyl(0.24, 0.26, 0.16, joint, 20), 0, 0.02, 0)); // waist ring
    this.torso.add(at(rbox(1.1, 0.62, 0.72, frame, 0.06), 0, 0.42, 0));
    const chestPlate = rbox(0.86, 0.44, 0.14, plate, 0.04); chestPlate.rotation.x = -0.22;
    this.torso.add(at(chestPlate, 0, 0.46, -0.4));
    this.torso.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.07, 0.03), glow), 0, 0.56, -0.48)); // core light
    for (const side of [-1, 1] as const) {
      this.torso.add(at(rbox(0.16, 0.5, 0.56, frame), side * 0.6, 0.3, 0.02)); // side skirt
      this.torso.add(at(rbox(0.44, 0.4, 0.6, plate, 0.06), side * 0.8, 0.7, 0)); // pauldron
      this.torso.add(at(rbox(0.46, 0.07, 0.5, accent), side * 0.8, 0.9, 0)); // team stripe
      this.torso.add(at(new THREE.Mesh(new THREE.CircleGeometry(0.04, 10), glow), side * 1.03, 0.72, -0.1)).rotation.y = side * Math.PI / 2;
    }
    // head
    const head = new THREE.Group();
    head.position.set(0, 0.86, -0.02);
    head.add(at(cyl(0.1, 0.12, 0.14, joint, 12), 0, 0.05, 0));
    head.add(at(rbox(0.42, 0.28, 0.42, frame, 0.05), 0, 0.26, 0));
    head.add(at(rbox(0.36, 0.1, 0.06, plate), 0, 0.34, -0.2)); // brow
    head.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.05, 0.04), glow), 0, 0.25, -0.22)); // visor slit
    const antenna = cyl(0.012, 0.016, 0.34, joint, 8);
    head.add(at(antenna, 0.16, 0.55, 0.08));
    this.torso.add(head);
    // backpack + thrusters
    this.torso.add(at(rbox(0.7, 0.5, 0.26, frame, 0.05), 0, 0.42, 0.46));
    for (const side of [-1, 1] as const) {
      const nozzle = cyl(0.11, 0.09, 0.24, joint, 14); nozzle.rotation.x = Math.PI / 2;
      this.torso.add(at(nozzle, side * 0.22, 0.36, 0.66));
      const flame = new THREE.Mesh(new THREE.CircleGeometry(0.07, 14), this.thrust);
      this.torso.add(at(flame, side * 0.22, 0.36, 0.785));
    }
    // right arm: the cannon
    const arm = new THREE.Group();
    arm.position.set(0.72, 0.52, -0.02);
    arm.add(at(rbox(0.28, 0.26, 0.5, frame), 0, 0, 0.0));
    arm.add(at(rbox(0.32, 0.34, 0.86, plate, 0.05), 0, -0.02, -0.55)); // receiver
    for (let i = 0; i < 3; i++) arm.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.008, 0.035), this.vents), 0, 0.165, -0.45 - i * 0.12));
    this.barrel = cyl(0.085, 0.095, 1.15, frame, 16); this.barrel.rotation.x = Math.PI / 2;
    arm.add(at(this.barrel, 0, 0, -1.5));
    const brake = cyl(0.12, 0.12, 0.2, joint, 16); brake.rotation.x = Math.PI / 2;
    arm.add(at(brake, 0, 0, -2.02));
    arm.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.02, 8, 18), glow), 0, 0, -2.13));
    this.torso.add(arm);
    // left arm: forearm + shield plate
    const larm = new THREE.Group();
    larm.position.set(-0.72, 0.52, -0.02);
    larm.add(at(rbox(0.26, 0.24, 0.46, frame), 0, 0, 0));
    larm.add(at(rbox(0.22, 0.22, 0.5, frame), 0, -0.06, -0.42));
    larm.add(at(rbox(0.1, 0.56, 0.46, plate, 0.04), -0.2, 0.02, -0.34)); // shield
    larm.add(at(rbox(0.04, 0.5, 0.06, accent), -0.26, 0.02, -0.58)); // shield edge light stripe
    this.torso.add(larm);

    // ground ring: bright when the dash is ready
    this.ringMat = new THREE.MeshBasicMaterial({ color: hdr(color, 1.6), transparent: true, opacity: 0.7, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.72, 0.86, 40), this.ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;

    this.root.add(this.legs, this.torso, ring);
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
    this.phase += dt * (5 + 9 * gait);
    // stride: thighs swing, knees bend on the back-swing, feet stay level
    const swing = Math.sin(this.phase) * 0.55 * gait;
    const bendL = Math.max(0, Math.sin(this.phase + Math.PI * 0.5)) * 0.75 * gait;
    const bendR = Math.max(0, Math.sin(this.phase - Math.PI * 0.5)) * 0.75 * gait;
    this.thighL.rotation.x = swing;
    this.thighR.rotation.x = -swing;
    this.shinL.rotation.x = bendL;
    this.shinR.rotation.x = bendR;
    this.footL.rotation.x = -(swing + bendL);
    this.footR.rotation.x = -(-swing + bendR);
    this.torso.position.y = 1.12 + Math.abs(Math.sin(this.phase)) * 0.05 * gait;
    // dash: lean and light the thrusters
    const dashing = m.dashT > 0;
    this.legs.rotation.x = dashing ? 0.2 : 0;
    this.thrustLevel += ((dashing ? 1 : 0) - this.thrustLevel) * Math.min(1, dt * 12);
    this.thrust.color.copy(hdr(0x7fd8ff, 0.18 + this.thrustLevel * 3.2));
    // recoil and heat vents
    this.recoil = Math.max(0, this.recoil - dt * 6);
    this.barrel.position.z = -1.5 + this.recoil * 0.22;
    this.vents.color.copy(hdr(0xff7a3c, 0.12 + this.recoil * 2.2));
    this.ringMat.opacity = m.dashCd <= 0 ? 0.75 : 0.18;
  }
}
