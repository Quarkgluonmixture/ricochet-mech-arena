import { describe, expect, it } from 'vitest';
import { CFG } from '../src/sim/config.ts';
import { expandAll } from '../src/sim/geom.ts';
import { type ShellState, advanceShell, predictPath } from '../src/sim/shell.ts';

const walls = expandAll([{ minX: 5, maxX: 6, minZ: -10, maxZ: 10 }], CFG.shell.radius);

const shellAt = (x: number, vx: number): ShellState => ({ pos: { x, z: 0 }, vel: { x: vx, z: 0 }, bounces: 0, age: 0, alive: true });

describe('shell', () => {
  it('ricochets once and dies on the second wall', () => {
    const s = shellAt(0, 16);
    const events: { pos: { x: number; z: number } }[] = [];
    // 1 s is enough to reach the wall at x≈4.8 (0.3 s) and come back
    for (let i = 0; i < 60; i++) advanceShell(s, 1 / 60, walls, 1, events as never);
    expect(events.length).toBe(1);
    expect(events[0].pos.x).toBeCloseTo(5 - CFG.shell.radius, 2);
    expect(s.vel.x).toBeCloseTo(-16);
    expect(s.alive).toBe(true);
    expect(s.bounces).toBe(1);
    // now a second wall further back along its return path kills the shell on contact
    expect(s.pos.x).toBeGreaterThan(-8); // it has not reached x=-8 yet
    const twoWalls = [...walls, ...expandAll([{ minX: -9, maxX: -8, minZ: -10, maxZ: 10 }], CFG.shell.radius)];
    for (let i = 0; i < 60; i++) advanceShell(s, 1 / 60, twoWalls, 1);
    expect(s.alive).toBe(false);
  });

  it('a large step that crosses the wall still reflects instead of tunnelling', () => {
    const s = shellAt(0, 16);
    advanceShell(s, 0.5, walls, 1); // would travel 8 m, wall is 4.8 m away
    expect(s.pos.x).toBeLessThan(5 - CFG.shell.radius + 1e-6);
    expect(s.vel.x).toBeCloseTo(-16);
  });

  it('predictPath matches the live stepping exactly on the same dt grid', () => {
    const live = shellAt(0, 16);
    const path = predictPath(live, walls, 1, 1 / 40);
    for (const p of path) {
      advanceShell(live, 1 / 40, walls, 1);
      expect(live.pos.x).toBeCloseTo(p.x, 9);
      expect(live.pos.z).toBeCloseTo(p.z, 9);
    }
  });
});
