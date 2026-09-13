import * as THREE from 'three';
import type { Arena } from '../sim/arena.ts';
import { CFG } from '../sim/config.ts';

export interface SceneBundle {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  resize: () => void;
}

export const COLORS = { you: 0x6fb6ff, ai: 0xff6a5c, wall: 0x67728c, wallEdge: 0xb9c7e6, floor: 0x262c3a };

export function createScene(container: HTMLElement, arena: Arena): SceneBundle {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0e14);
  scene.fog = new THREE.Fog(0x0b0e14, 40, 110);

  const camera = new THREE.PerspectiveCamera(78, 1, 0.08, 220);
  camera.rotation.order = 'YXZ';

  scene.add(new THREE.HemisphereLight(0xc4d2f0, 0x3a3128, 2.4));
  scene.add(new THREE.AmbientLight(0x404a5e, 0.9));
  const sun = new THREE.DirectionalLight(0xfff1dc, 3.2);
  sun.position.set(18, 30, 12);
  sun.castShadow = true;
  const half = Math.max(arena.width, arena.depth) * 0.75;
  sun.shadow.camera.left = -half; sun.shadow.camera.right = half;
  sun.shadow.camera.top = half; sun.shadow.camera.bottom = -half;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 120;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0008;
  scene.add(sun);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(arena.width, arena.depth),
    new THREE.MeshStandardMaterial({ color: COLORS.floor, roughness: 0.95, metalness: 0.05 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const grid = new THREE.GridHelper(arena.width, arena.cols, 0x3e4860, 0x323a4c);
  grid.position.y = 0.01;
  scene.add(grid);

  const wallMat = new THREE.MeshStandardMaterial({ color: COLORS.wall, roughness: 0.85, metalness: 0.1 });
  const edgeMat = new THREE.LineBasicMaterial({ color: COLORS.wallEdge, transparent: true, opacity: 0.8 });
  const stripMat = new THREE.MeshBasicMaterial({ color: 0x4f8fe0 });
  for (const w of arena.walls) {
    const sx = w.maxX - w.minX, sz = w.maxZ - w.minZ;
    const geo = new THREE.BoxGeometry(sx, CFG.wallHeight, sz);
    const mesh = new THREE.Mesh(geo, wallMat);
    mesh.position.set((w.minX + w.maxX) / 2, CFG.wallHeight / 2, (w.minZ + w.maxZ) / 2);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat);
    edges.position.copy(mesh.position);
    scene.add(edges);
    // a thin light strip along the top of every wall: reads as a silhouette even in shadow
    const strip = new THREE.Mesh(new THREE.BoxGeometry(sx + 0.02, 0.06, sz + 0.02), stripMat);
    strip.position.set(mesh.position.x, CFG.wallHeight - 0.03, mesh.position.z);
    scene.add(strip);
  }

  const resize = () => {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();
  return { renderer, scene, camera, resize };
}
