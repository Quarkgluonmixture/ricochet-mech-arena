// Planar geometry: vectors in the XZ plane, axis-aligned wall boxes, rays, circle resolution.
// This file has no knowledge of mechs or shells; everything above it builds on these primitives.

export interface Vec2 { x: number; z: number }
export interface Aabb { minX: number; maxX: number; minZ: number; maxZ: number }
export interface RayHit { t: number; nx: number; nz: number; wall: Aabb }

export const EPS = 1e-6;

export const v2 = (x: number, z: number): Vec2 => ({ x, z });
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, z: a.z + b.z });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, z: a.z - b.z });
export const scale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, z: a.z * s });
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.z * b.z;
export const len = (a: Vec2): number => Math.hypot(a.x, a.z);
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.z - b.z);
export const copy = (a: Vec2): Vec2 => ({ x: a.x, z: a.z });
export function norm(a: Vec2): Vec2 {
  const l = len(a);
  return l < EPS ? { x: 0, z: 0 } : { x: a.x / l, z: a.z / l };
}

/**
 * Yaw convention shared by sim and render: yaw 0 looks down -Z (three.js camera default),
 * positive yaw turns left. forward(yaw) and yawOf(dir) are inverses.
 */
export const forward = (yaw: number): Vec2 => ({ x: -Math.sin(yaw), z: -Math.cos(yaw) });
export const right = (yaw: number): Vec2 => ({ x: Math.cos(yaw), z: -Math.sin(yaw) });
export const yawOf = (d: Vec2): number => Math.atan2(-d.x, -d.z);
/** Smallest signed difference b - a in (-π, π]. */
export function angleDiff(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

export const expand = (b: Aabb, r: number): Aabb => ({ minX: b.minX - r, maxX: b.maxX + r, minZ: b.minZ - r, maxZ: b.maxZ + r });
export const expandAll = (walls: Aabb[], r: number): Aabb[] => walls.map((w) => expand(w, r));
export const inside = (p: Vec2, b: Aabb): boolean => p.x > b.minX && p.x < b.maxX && p.z > b.minZ && p.z < b.maxZ;

/**
 * Slab-method ray vs box. Returns the nearest entry with 0 <= t <= maxT, or null.
 * A ray whose origin is inside the box returns null: the caller already resolved that penetration.
 */
export function rayAabb(ox: number, oz: number, dx: number, dz: number, b: Aabb, maxT: number): RayHit | null {
  let tmin = 0;
  let tmax = maxT;
  let nx = 0;
  let nz = 0;
  // x slab
  if (Math.abs(dx) < EPS) {
    if (ox <= b.minX || ox >= b.maxX) return null;
  } else {
    const inv = 1 / dx;
    let t1 = (b.minX - ox) * inv;
    let t2 = (b.maxX - ox) * inv;
    let n = -1;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; n = 1; }
    if (t1 > tmin) { tmin = t1; nx = n; nz = 0; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  // z slab
  if (Math.abs(dz) < EPS) {
    if (oz <= b.minZ || oz >= b.maxZ) return null;
  } else {
    const inv = 1 / dz;
    let t1 = (b.minZ - oz) * inv;
    let t2 = (b.maxZ - oz) * inv;
    let n = -1;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; n = 1; }
    if (t1 > tmin) { tmin = t1; nx = 0; nz = n; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (tmin <= 0) return null; // origin inside (or exactly on the surface heading in)
  return { t: tmin, nx, nz, wall: b };
}

/** Nearest wall hit along direction d (need not be unit; t is in units of |d|). */
export function raycast(o: Vec2, d: Vec2, walls: Aabb[], maxT = Infinity): RayHit | null {
  let best: RayHit | null = null;
  for (const w of walls) {
    const h = rayAabb(o.x, o.z, d.x, d.z, w, best ? best.t : maxT);
    if (h && (!best || h.t < best.t)) best = h;
  }
  return best;
}

/** True when the straight segment a→b touches no wall. */
export function segmentClear(a: Vec2, b: Vec2, walls: Aabb[]): boolean {
  const d = sub(b, a);
  if (len(d) < EPS) return true;
  return raycast(a, d, walls, 1) === null;
}

/** Distance from point p to the segment a→b. */
export function pointSegmentDist(p: Vec2, a: Vec2, b: Vec2): number {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  if (l2 < EPS) return dist(p, a);
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2));
  return dist(p, add(a, scale(ab, t)));
}

/**
 * Push a circle out of every box it overlaps. Mutates p. Returns the summed push normal
 * (zero vector when nothing collided) so the caller can cancel velocity into the wall.
 */
export function resolveCircle(p: Vec2, r: number, walls: Aabb[]): Vec2 {
  const push = { x: 0, z: 0 };
  for (let pass = 0; pass < 2; pass++) {
    for (const b of walls) {
      const cx = Math.max(b.minX, Math.min(p.x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(p.z, b.maxZ));
      let dx = p.x - cx;
      let dz = p.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 < EPS) {
        // centre is inside the box: leave through the nearest face
        const toMinX = p.x - b.minX, toMaxX = b.maxX - p.x, toMinZ = p.z - b.minZ, toMaxZ = b.maxZ - p.z;
        const m = Math.min(toMinX, toMaxX, toMinZ, toMaxZ);
        if (m === toMinX) { p.x = b.minX - r; push.x -= 1; }
        else if (m === toMaxX) { p.x = b.maxX + r; push.x += 1; }
        else if (m === toMinZ) { p.z = b.minZ - r; push.z -= 1; }
        else { p.z = b.maxZ + r; push.z += 1; }
        continue;
      }
      const d = Math.sqrt(d2);
      dx /= d; dz /= d;
      p.x = cx + dx * r;
      p.z = cz + dz * r;
      push.x += dx; push.z += dz;
    }
  }
  return push;
}

export const reflect = (v: Vec2, nx: number, nz: number): Vec2 => {
  const d = v.x * nx + v.z * nz;
  return { x: v.x - 2 * d * nx, z: v.z - 2 * d * nz };
};
