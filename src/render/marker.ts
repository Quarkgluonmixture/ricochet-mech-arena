import * as THREE from 'three';
import type { Mech } from '../sim/mech.ts';

/** Always-on-top diamond above a mech's head, roughly constant screen size. Position only, never pose. */
export class HeadMarker {
  private mesh: THREE.Mesh;
  private spin = 0;

  constructor(scene: THREE.Scene, color: number) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthTest: false, depthWrite: false });
    this.mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), mat);
    this.mesh.renderOrder = 999;
    this.mesh.scale.set(0.7, 1.3, 0.7);
    scene.add(this.mesh);
  }

  update(m: Mech, camera: THREE.Camera, dt: number): void {
    this.mesh.visible = m.alive;
    if (!m.alive) return;
    this.spin += dt * 2.2;
    this.mesh.position.set(m.pos.x, 2.75 + Math.sin(this.spin * 2) * 0.06, m.pos.z);
    const d = camera.position.distanceTo(this.mesh.position);
    const k = Math.min(2.2, Math.max(0.6, d * 0.05));
    this.mesh.scale.set(0.7 * k, 1.3 * k, 0.7 * k);
    this.mesh.rotation.y = this.spin;
  }
}
