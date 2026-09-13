import { CFG } from './config.ts';
import { type Aabb, type Vec2, add, inside, len, raycast, reflect, scale } from './geom.ts';

export interface ShellState {
  pos: Vec2;
  vel: Vec2;
  bounces: number;
  age: number;
  alive: boolean;
}

export interface Shell extends ShellState {
  id: number;
  owner: number;
  /** Position at the start of the last step; the hit test sweeps prev→pos. */
  prev: Vec2;
}

export interface BounceEvent { pos: Vec2; nx: number; nz: number }

/**
 * Advance one shell by dt, reflecting off walls. The ONLY place shell motion is defined: the live
 * world, the AI's predictions and the radar's path preview all call this, so they can never disagree.
 * `walls` must already be expanded by the shell radius. Mutates s; returns bounce events if `out` given.
 */
export function advanceShell(s: ShellState, dt: number, walls: Aabb[], maxBounces: number = CFG.shell.maxBounces, out?: BounceEvent[]): void {
  if (!s.alive) return;
  let remaining = dt;
  const speed = len(s.vel);
  for (let i = 0; i < 6 && remaining > 0; i++) {
    const travel = speed * remaining;
    if (travel <= 0) break;
    const hit = raycast(s.pos, s.vel, walls, remaining);
    if (!hit) {
      s.pos = add(s.pos, scale(s.vel, remaining));
      break;
    }
    // Arrive at the wall, step back a hair so the next ray starts outside the box.
    const tArrive = Math.max(0, hit.t - 1e-4 / Math.max(speed, 1e-6));
    s.pos = add(s.pos, scale(s.vel, tArrive));
    remaining -= hit.t;
    s.bounces++;
    if (out) out.push({ pos: { x: s.pos.x, z: s.pos.z }, nx: hit.nx, nz: hit.nz });
    if (s.bounces > maxBounces) {
      s.alive = false;
      return;
    }
    s.vel = reflect(s.vel, hit.nx, hit.nz);
  }
  s.age += dt;
  if (s.age > CFG.shell.lifetime) s.alive = false;
  // Invariant: a shell is never inside a wall. A ray born inside a box cannot see that box, so a shell
  // that somehow got in would sail straight through; kill it at the wall instead.
  if (s.alive) for (const w of walls) if (inside(s.pos, w)) { s.alive = false; break; }
}

/** Sample a shell's future at t = dt, 2dt, … up to horizon. Stops early when the shell dies. */
export function predictPath(s: ShellState, walls: Aabb[], horizon: number, dt: number, maxBounces: number = CFG.shell.maxBounces): Vec2[] {
  const c: ShellState = { pos: { ...s.pos }, vel: { ...s.vel }, bounces: s.bounces, age: s.age, alive: s.alive };
  const out: Vec2[] = [];
  const n = Math.ceil(horizon / dt);
  for (let i = 0; i < n && c.alive; i++) {
    advanceShell(c, dt, walls, maxBounces);
    if (c.alive) out.push({ x: c.pos.x, z: c.pos.z });
  }
  return out;
}
