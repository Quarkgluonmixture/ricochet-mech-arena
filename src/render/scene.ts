import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Arena } from '../sim/arena.ts';
import { CFG } from '../sim/config.ts';
import { TEX, getTexture, hdr } from './assets.ts';

export interface SceneBundle {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  resize: () => void;
  /** Render through the post chain (bloom). */
  render: () => void;
}

export const COLORS = { you: 0x6fb6ff, ai: 0xff6a5c, wall: 0x67728c, wallEdge: 0xb9c7e6, floor: 0x262c3a };

/** Wall side tile: 2.25 m wide × 1.5 m tall (the 3:2 source image at wall height). Top tile: 2 m. */
const SIDE_TILE: [number, number] = [2.25, CFG.wallHeight];
const TOP_TILE = 2;

/**
 * Stretch a box's per-face UVs so ONE shared repeating texture tiles at a fixed metric size on every
 * face, whatever the box's dimensions. BoxGeometry lays out 4 vertices per face in the order
 * +x, -x, +y, -y, +z, -z.
 */
function scaleBoxUVs(geo: THREE.BoxGeometry, sx: number, sy: number, sz: number): void {
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    const face = Math.floor(i / 4);
    let u = uv.getX(i), v = uv.getY(i);
    if (face < 2) { u *= sz / SIDE_TILE[0]; v *= sy / SIDE_TILE[1]; }
    else if (face < 4) { u *= sx / TOP_TILE; v *= sz / TOP_TILE; }
    else { u *= sx / SIDE_TILE[0]; v *= sy / SIDE_TILE[1]; }
    uv.setXY(i, u, v);
  }
  uv.needsUpdate = true;
}

export function createScene(container: HTMLElement, arena: Arena): SceneBundle {
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0e14);
  scene.fog = new THREE.Fog(0x0b0e14, 55, 150);
  getTexture(TEX.sky, (t) => {
    t.mapping = THREE.EquirectangularReflectionMapping;
    scene.background = t;
    scene.environment = t;
    scene.environmentIntensity = 0.35;
  });

  const camera = new THREE.PerspectiveCamera(78, 1, 0.08, 220);
  camera.rotation.order = 'YXZ';

  // kept below 1.0 linear on lit surfaces so only the HDR emissives reach the bloom threshold
  scene.add(new THREE.HemisphereLight(0xc4d2f0, 0x3a3128, 1.5));
  scene.add(new THREE.AmbientLight(0x404a5e, 0.6));
  const sun = new THREE.DirectionalLight(0xfff1dc, 1.3);
  sun.position.set(18, 30, 12);
  sun.castShadow = true;
  const half = Math.max(arena.width, arena.depth) * 0.55;
  sun.shadow.camera.left = -half; sun.shadow.camera.right = half;
  sun.shadow.camera.top = half; sun.shadow.camera.bottom = -half;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 120;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.08;
  scene.add(sun);

  // floor: one texture tile per 4 m arena cell
  const floorMat = new THREE.MeshStandardMaterial({ color: COLORS.floor, roughness: 0.75, metalness: 0.3 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(arena.width, arena.depth), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  getTexture(TEX.floor, (t) => {
    const tex = t.clone();
    tex.repeat.set(arena.width / CFG.cell, arena.depth / CFG.cell);
    floorMat.map = tex; floorMat.color.set(0xffffff); floorMat.needsUpdate = true;
  });

  // walls: shared materials, per-box UV scaling
  const wallSide = new THREE.MeshStandardMaterial({ color: COLORS.wall, roughness: 0.75, metalness: 0.3 });
  const wallTop = new THREE.MeshStandardMaterial({ color: 0x3d4557, roughness: 0.9, metalness: 0.1 });
  getTexture(TEX.wallSide, (t) => { wallSide.map = t; wallSide.color.set(0xffffff); wallSide.needsUpdate = true; });
  getTexture(TEX.wallTop, (t) => { wallTop.map = t; wallTop.color.set(0xb9c0cf); wallTop.needsUpdate = true; });
  const wallMat = [wallSide, wallSide, wallTop, wallSide, wallSide, wallSide];
  const edgeMat = new THREE.LineBasicMaterial({ color: COLORS.wallEdge, transparent: true, opacity: 0.5 });
  const stripMat = new THREE.MeshBasicMaterial({ color: hdr(0x4f8fe0, 1.9) });
  const stripParts: THREE.BufferGeometry[] = [];
  const STRIP_W = 0.09, STRIP_H = 0.05;
  for (const w of arena.walls) {
    const sx = w.maxX - w.minX, sz = w.maxZ - w.minZ;
    const geo = new THREE.BoxGeometry(sx, CFG.wallHeight, sz);
    scaleBoxUVs(geo, sx, CFG.wallHeight, sz);
    const mesh = new THREE.Mesh(geo, wallMat);
    mesh.position.set((w.minX + w.maxX) / 2, CFG.wallHeight / 2, (w.minZ + w.maxZ) / 2);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat);
    edges.position.copy(mesh.position);
    scene.add(edges);
    // light strip: a thin frame around the top EDGE (not a slab over the whole top), sitting on the wall
    // so no face is coplanar with the top. All frames merge into one mesh.
    const y = CFG.wallHeight + STRIP_H / 2 - 0.005;
    const cx = mesh.position.x, cz = mesh.position.z;
    const long = (len: number, x: number, z: number, alongX: boolean) => {
      const g = new THREE.BoxGeometry(alongX ? len + STRIP_W : STRIP_W, STRIP_H, alongX ? STRIP_W : len + STRIP_W);
      g.translate(x, y, z);
      stripParts.push(g);
    };
    long(sx, cx, w.minZ + STRIP_W / 2, true);
    long(sx, cx, w.maxZ - STRIP_W / 2, true);
    long(sz, w.minX + STRIP_W / 2, cz, false);
    long(sz, w.maxX - STRIP_W / 2, cz, false);
  }
  const strips = new THREE.Mesh(mergeGeometries(stripParts), stripMat);
  scene.add(strips);

  // post: MSAA render target → bloom → tone mapping / colour space
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const target = new THREE.WebGLRenderTarget(size.x, size.y, { samples: 4, type: THREE.HalfFloatType });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.32, 0.25, 1.35);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const resize = () => {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    bloom.resolution.set(w / 2, h / 2);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();
  return { renderer, scene, camera, resize, render: () => composer.render() };
}
