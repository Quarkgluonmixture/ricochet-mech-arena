import * as THREE from 'three';
import { CFG } from '../sim/config.ts';
import { TEX, getTexture, hdr } from './assets.ts';
import { type Aabb, expandAll, forward, raycast } from '../sim/geom.ts';
import type { Mech } from '../sim/mech.ts';

export type CamMode = 'first' | 'third';

/** First-person cockpit camera with a view-model gun, or an over-the-shoulder chase camera. */
export class CameraRig {
  pitch = 0;
  mode: CamMode = 'first';
  private viewmodel = new THREE.Group();
  private vmBarrel: THREE.Mesh;
  private recoil = 0;
  private shake = 0;
  private walls: Aabb[];
  private bob = 0;
  private camera: THREE.PerspectiveCamera;

  constructor(camera: THREE.PerspectiveCamera, scene: THREE.Scene, walls: Aabb[], color: number) {
    this.camera = camera;
    this.walls = expandAll(walls, 0.35);
    const body = new THREE.MeshStandardMaterial({ color: 0x8a93a6, roughness: 0.6, metalness: 0.35 });
    const accent = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.3 });
    getTexture(TEX.hull, (t) => { body.map = t; body.color.set(0xc9d0dc); body.needsUpdate = true; accent.map = t; accent.needsUpdate = true; });
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, 0.7), body);
    this.vmBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 1.0, 12), accent);
    this.vmBarrel.rotation.x = Math.PI / 2;
    this.vmBarrel.position.z = -0.75;
    const muzzle = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.025, 8, 16), new THREE.MeshBasicMaterial({ color: hdr(color, 1.5) }));
    muzzle.position.z = -1.24;
    this.viewmodel.add(receiver, this.vmBarrel, muzzle);
    this.viewmodel.position.set(0.42, -0.34, -0.55);
    camera.add(this.viewmodel);
    scene.add(camera);
  }

  kick(): void { this.recoil = 1; this.shake = 1; }
  setViewmodelVisible(v: boolean): void { this.viewmodel.visible = v; }

  toggle(): CamMode {
    this.mode = this.mode === 'first' ? 'third' : 'first';
    return this.mode;
  }

  update(m: Mech, dt: number): void {
    this.recoil = Math.max(0, this.recoil - dt * 7);
    this.shake = Math.max(0, this.shake - dt * 9);
    const f = forward(m.torsoYaw);
    const speed = Math.hypot(m.vel.x, m.vel.z);
    this.bob += dt * (4 + speed * 1.2);
    const bobY = Math.sin(this.bob * 2) * 0.02 * Math.min(1, speed / CFG.mech.maxSpeed);
    const jitter = this.shake * 0.01;

    if (this.mode === 'first') {
      this.viewmodel.visible = true;
      this.camera.position.set(m.pos.x + f.x * 0.25, CFG.mech.eyeHeight + bobY, m.pos.z + f.z * 0.25);
      this.camera.rotation.set(this.pitch + (Math.random() - 0.5) * jitter, m.torsoYaw + (Math.random() - 0.5) * jitter, 0);
      this.vmBarrel.position.z = -0.75 + this.recoil * 0.18;
      this.viewmodel.position.set(0.42, -0.34 + bobY * 0.5, -0.55 + this.recoil * 0.1);
      return;
    }
    this.viewmodel.visible = false;
    const D = 5.5;
    const p = Math.max(-1.0, Math.min(0.3, this.pitch));
    let dist = D * Math.cos(p);
    // keep the chase camera out of walls; when blocked, climb instead of zooming into the mech
    const hit = raycast(m.pos, { x: -f.x, z: -f.z }, this.walls, dist);
    let climb = 0;
    if (hit) { climb = (dist - hit.t) * 0.6; dist = Math.max(1.4, hit.t - 0.2); }
    const height = 2.6 - D * Math.sin(p) + climb;
    this.camera.position.set(m.pos.x - f.x * dist, height + bobY, m.pos.z - f.z * dist);
    this.camera.lookAt(m.pos.x + f.x * 4, 1.0, m.pos.z + f.z * 4);
  }
}
