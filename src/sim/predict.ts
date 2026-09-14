import { CFG } from './config.ts';
import { pointSegmentDist } from './geom.ts';
import { type ShellState, advanceShell } from './shell.ts';
import type { World } from './world.ts';

export interface Impact {
  shell: number;
  owner: number;
  victim: number;
  /** Sim seconds from now. */
  t: number;
  /** True when the victim is on its last life, so this hit would kill. */
  fatal: boolean;
}

/**
 * Where the live shells are about to land if every mech keeps its current velocity: the sweep that
 * `World.hitTest` will perform, run `lead` seconds early. Same walls, same radii, same arming rule, so a
 * shell that dies on a wall first, or has not armed against its own shooter, is never reported. Used by
 * the kill cam to start slowing time a beat before the hit instead of on it. Earliest impact first.
 */
export function predictImpacts(world: World, lead: number, step = 1 / 60): Impact[] {
  const out: Impact[] = [];
  if (world.roundOver) return out;
  const targets = world.mechs.filter((m) => m.alive && m.invulnT <= 0);
  for (const s of world.shells) {
    if (!s.alive) continue;
    const c: ShellState = { pos: { ...s.pos }, vel: { ...s.vel }, bounces: s.bounces, age: s.age, alive: true };
    let t = 0;
    scan: while (t < lead && c.alive) {
      const prev = { x: c.pos.x, z: c.pos.z };
      const dt = Math.min(step, lead - t);
      advanceShell(c, dt, world.shellWalls);
      t += dt;
      if (!c.alive) break;
      for (const m of targets) {
        if (m.id === s.owner && c.bounces === 0 && c.age < CFG.shell.selfArmTime) continue;
        const p = { x: m.pos.x + m.vel.x * t, z: m.pos.z + m.vel.z * t };
        if (pointSegmentDist(p, prev, c.pos) > m.radius + CFG.shell.radius) continue;
        out.push({ shell: s.id, owner: s.owner, victim: m.id, t, fatal: m.hp <= 1 });
        break scan;
      }
    }
  }
  return out.sort((a, b) => a.t - b.t);
}
