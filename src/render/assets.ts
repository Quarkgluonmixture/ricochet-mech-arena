import * as THREE from 'three';

/**
 * Generated art (see assets-src/PROMPTS.md). Everything here is render-only: a missing file leaves the
 * fallback colour in place, the sim never knows. Textures are assigned in the load callback, because a
 * texture that has not loaded yet renders black, not "no texture".
 */
export const TEX = {
  floor: 'textures/floor.jpg',
  wallSide: 'textures/wall-side.jpg',
  wallTop: 'textures/wall-top.jpg',
  hull: 'textures/hull.jpg',
  sky: 'textures/sky.jpg',
  keyart: 'textures/keyart.jpg',
} as const;

const loader = new THREE.TextureLoader();
const cache = new Map<string, { tex: THREE.Texture | null; waiters: Array<(t: THREE.Texture) => void>; failed: boolean }>();

/** Load once per URL; `ready` fires when the image is in, immediately if it already is. Never on failure. */
export function getTexture(url: string, ready: (t: THREE.Texture) => void): void {
  let e = cache.get(url);
  if (!e) {
    e = { tex: null, waiters: [], failed: false };
    cache.set(url, e);
    const entry = e;
    loader.load(
      url,
      (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = 8;
        entry.tex = t;
        for (const w of entry.waiters) w(t);
        entry.waiters.length = 0;
      },
      undefined,
      () => { entry.failed = true; entry.waiters.length = 0; console.warn(`texture missing: ${url}`); },
    );
  }
  if (e.tex) ready(e.tex);
  else if (!e.failed) e.waiters.push(ready);
}

/** Colour pushed above 1.0 so the bloom pass picks it up. */
export const hdr = (hex: number, k: number): THREE.Color => new THREE.Color(hex).multiplyScalar(k);
