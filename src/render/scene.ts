import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Arena } from '../sim/arena.ts';
import { CFG } from '../sim/config.ts';
import { TEX, getTexture, hdr } from './assets.ts';
import { QUALITY, type Quality } from './quality.ts';

export interface SceneBundle {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  resize: () => void;
  /** Render through the post chain (bloom) or straight, per quality. */
  render: () => void;
  setQuality: (q: Quality) => void;
  /** Per-frame ambience: pulsing light strips, drifting dust. */
  update: (dt: number) => void;
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

export function createScene(container: HTMLElement, arena: Arena, quality: Quality = 'medium'): SceneBundle {
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, QUALITY[quality].pixelRatio));
  renderer.shadowMap.enabled = QUALITY[quality].shadows;
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
  // rim lights: a cool one and a warm one from opposite sides, no shadows, so the mechs separate from the floor
  const rimCool = new THREE.DirectionalLight(0x5aa0ff, 0.7);
  rimCool.position.set(-30, 12, 24);
  scene.add(rimCool);
  const rimWarm = new THREE.DirectionalLight(0xffb070, 0.4);
  rimWarm.position.set(28, 9, -26);
  scene.add(rimWarm);
  const sun = new THREE.DirectionalLight(0xfff1dc, 1.3);
  sun.position.set(18, 30, 12);
  sun.castShadow = QUALITY[quality].shadows;
  const half = Math.max(arena.width, arena.depth) * 0.55;
  sun.shadow.camera.left = -half; sun.shadow.camera.right = half;
  sun.shadow.camera.top = half; sun.shadow.camera.bottom = -half;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 120;
  sun.shadow.mapSize.set(QUALITY[quality].shadowMap, QUALITY[quality].shadowMap);
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.08;
  scene.add(sun);

  // apron: the arena stands on a wider dark deck instead of ending at the sky
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(arena.width + 60, arena.depth + 60), new THREE.MeshStandardMaterial({ color: 0x0d1118, roughness: 0.9, metalness: 0.2 }));
  apron.rotation.x = -Math.PI / 2;
  apron.position.y = -0.02;
  apron.receiveShadow = true;
  scene.add(apron);

  // floor: one texture tile per 4 m arena cell; a little glossier so the hangar lights reflect in it
  const floorMat = new THREE.MeshStandardMaterial({ color: COLORS.floor, roughness: 0.55, metalness: 0.35 });
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

  // pylon ring outside the arena: tall dark posts with a vertical light bar, merged into two meshes
  const pylonParts: THREE.BufferGeometry[] = [];
  const barParts: THREE.BufferGeometry[] = [];
  const px = arena.width / 2 + 7, pz = arena.depth / 2 + 7;
  const step = 10;
  const ring: Array<[number, number]> = [];
  for (let x = -px; x <= px + 0.01; x += step) { ring.push([x, -pz]); ring.push([x, pz]); }
  for (let z = -pz + step; z < pz - 0.01; z += step) { ring.push([-px, z]); ring.push([px, z]); }
  for (const [x, z] of ring) {
    const post = new THREE.BoxGeometry(0.7, 8, 0.7); post.translate(x, 4, z); pylonParts.push(post);
    const cap = new THREE.BoxGeometry(1.1, 0.3, 1.1); cap.translate(x, 8.1, z); pylonParts.push(cap);
    const towards = Math.atan2(-x, -z); // face the arena centre
    const bar = new THREE.BoxGeometry(0.12, 5.5, 0.08); bar.translate(0, 4.4, 0.4); bar.rotateY(towards); bar.translate(x, 0, z); barParts.push(bar);
  }
  const pylons = new THREE.Mesh(mergeGeometries(pylonParts), new THREE.MeshStandardMaterial({ color: 0x2a3140, roughness: 0.8, metalness: 0.4 }));
  pylons.castShadow = true;
  scene.add(pylons);
  const barMat = new THREE.MeshBasicMaterial({ color: hdr(0x4f8fe0, 1.6) });
  scene.add(new THREE.Mesh(mergeGeometries(barParts), barMat));

  // dust: a few hundred slow motes in the arena volume, for depth in first person
  const DUST = 360;
  const dustPos = new Float32Array(DUST * 3);
  const dustVel = new Float32Array(DUST * 3);
  for (let i = 0; i < DUST; i++) {
    dustPos[i * 3] = (Math.random() - 0.5) * arena.width;
    dustPos[i * 3 + 1] = 0.3 + Math.random() * 4.5;
    dustPos[i * 3 + 2] = (Math.random() - 0.5) * arena.depth;
    dustVel[i * 3] = (Math.random() - 0.5) * 0.12;
    dustVel[i * 3 + 1] = (Math.random() - 0.5) * 0.05;
    dustVel[i * 3 + 2] = (Math.random() - 0.5) * 0.12;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0xa9c8ff, size: 0.05, transparent: true, opacity: 0.4, depthWrite: false, sizeAttenuation: true }));
  dust.frustumCulled = false;
  scene.add(dust);

  let clock = 0;
  const stripBase = hdr(0x4f8fe0, 1.0);
  const update = (dt: number) => {
    clock += dt;
    // strips breathe slowly; bars pulse out of phase
    stripMat.color.copy(stripBase).multiplyScalar(1.9 + 0.35 * Math.sin(clock * 1.6));
    barMat.color.copy(stripBase).multiplyScalar(1.6 + 0.3 * Math.sin(clock * 1.1 + 1.5));
    const hw = arena.width / 2, hd = arena.depth / 2;
    for (let i = 0; i < DUST; i++) {
      dustPos[i * 3] += dustVel[i * 3] * dt;
      dustPos[i * 3 + 1] += dustVel[i * 3 + 1] * dt;
      dustPos[i * 3 + 2] += dustVel[i * 3 + 2] * dt;
      if (dustPos[i * 3] > hw) dustPos[i * 3] = -hw; else if (dustPos[i * 3] < -hw) dustPos[i * 3] = hw;
      if (dustPos[i * 3 + 2] > hd) dustPos[i * 3 + 2] = -hd; else if (dustPos[i * 3 + 2] < -hd) dustPos[i * 3 + 2] = hd;
      if (dustPos[i * 3 + 1] > 4.8) dustPos[i * 3 + 1] = 0.3; else if (dustPos[i * 3 + 1] < 0.3) dustPos[i * 3 + 1] = 4.8;
    }
    (dustGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  };

  // post chain: MSAA render target → bloom → tone mapping / colour space. Rebuilt on quality change.
  let composer: EffectComposer | null = null;
  let bloom: UnrealBloomPass | null = null;
  let current: Quality = quality;
  const buildPost = () => {
    if (composer) { composer.dispose(); composer = null; bloom = null; }
    const spec = QUALITY[current];
    if (!spec.bloom) return;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { samples: spec.msaa, type: THREE.HalfFloatType });
    composer = new EffectComposer(renderer, target);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.32, 0.25, 1.35);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
  };

  const resize = () => {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    if (composer) composer.setSize(w, h);
    if (bloom) bloom.resolution.set(w / 2, h / 2);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };

  const setQuality = (q: Quality) => {
    current = q;
    const spec = QUALITY[q];
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, spec.pixelRatio));
    renderer.shadowMap.enabled = spec.shadows;
    sun.castShadow = spec.shadows;
    if (sun.shadow.mapSize.x !== spec.shadowMap) {
      sun.shadow.mapSize.set(spec.shadowMap, spec.shadowMap);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
    }
    // shadow on/off is baked into every lit shader
    scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (!m) return;
      for (const mat of Array.isArray(m) ? m : [m]) mat.needsUpdate = true;
    });
    buildPost();
    resize();
  };

  window.addEventListener('resize', resize);
  setQuality(quality);
  return {
    renderer, scene, camera, resize, setQuality, update,
    render: () => { if (composer) composer.render(); else renderer.render(scene, camera); },
  };
}
