import { describe, expect, it } from 'vitest';
import { type AiState, aiThink, findFireSolution, makeAiState } from '../src/sim/ai.ts';
import { buildArena } from '../src/sim/arena.ts';
import { CFG } from '../src/sim/config.ts';
import { advanceShell } from '../src/sim/shell.ts';
import { World } from '../src/sim/world.ts';

const DT = 1 / 120;

/** Run the world with the AI controlling mech 1 and a scripted input for mech 0. */
function run(world: World, st: AiState, seconds: number, playerInput: (t: number) => { fire: boolean; yaw: number }) {
  const [player, ai] = world.mechs;
  const hits: number[] = [];
  for (let t = 0; t < seconds; t += DT) {
    const pi = playerInput(t);
    const aiInput = aiThink(world, ai, player, st, DT);
    world.step(DT, [{ move: { x: 0, z: 0 }, torsoYaw: pi.yaw, dash: false, fire: pi.fire }, aiInput]);
    for (const e of world.events) if (e.kind === 'hit') hits.push(e.victim);
    if (hits.length) break;
  }
  return hits;
}

describe('AI contract (VISION §4)', () => {
  it('dodges a direct shot on open ground', () => {
    // open 9x9 room; player at the west edge shoots straight east at a standing AI 20 m away
    const rows = ['###########', '#.........#', '#.........#', '#.........#', '#P.......E#', '#.........#', '#.........#', '#.........#', '#.........#', '###########'];
    const world = new World(buildArena(rows));
    const p = world.addMech('player', true, world.arena.spawns.player);
    const a = world.addMech('ai', false, world.arena.spawns.enemy);
    // aim exactly at the AI
    const yaw = Math.atan2(-(a.pos.x - p.pos.x), -(a.pos.z - p.pos.z));
    p.torsoYaw = yaw;
    // disable the AI's own gun so the test is only about dodging
    a.maxShells = 0;
    const st = makeAiState(0);
    const hits = run(world, st, 4, (t) => ({ fire: t < 0.05, yaw }));
    expect(hits).toEqual([]);
    expect(a.alive).toBe(true);
    expect(st.lastCandidates).toBeGreaterThan(1);
  });

  it('dies in a corridor too narrow to sidestep — geometry beats the perfect dodge', () => {
    // 1-cell corridor with the cell size shrunk so the corridor is 1.6 m wide (mech is 1.4 m).
    const rows = ['#########', '#P.....E#', '#########'];
    const saved = CFG.cell;
    CFG.cell = 1.6;
    try {
      const world = new World(buildArena(rows));
      const p = world.addMech('player', true, world.arena.spawns.player);
      const a = world.addMech('ai', false, world.arena.spawns.enemy);
      const yaw = Math.atan2(-(a.pos.x - p.pos.x), -(a.pos.z - p.pos.z));
      p.torsoYaw = yaw;
      a.maxShells = 0;
      const st = makeAiState(0);
      const hits = run(world, st, 3, (t) => ({ fire: t < 0.05, yaw }));
      expect(hits).toEqual([a.id]);
    } finally {
      CFG.cell = saved;
    }
  });

  it('never exceeds the shared speed cap while dodging', () => {
    const rows = ['###########', '#.........#', '#.........#', '#.........#', '#P.......E#', '#.........#', '#.........#', '#.........#', '#.........#', '###########'];
    const world = new World(buildArena(rows));
    const p = world.addMech('player', true, world.arena.spawns.player);
    const a = world.addMech('ai', false, world.arena.spawns.enemy);
    const yaw = Math.atan2(-(a.pos.x - p.pos.x), -(a.pos.z - p.pos.z));
    p.torsoYaw = yaw;
    a.maxShells = 0;
    const st = makeAiState(0);
    let maxSpeed = 0;
    for (let t = 0; t < 3; t += DT) {
      const aiInput = aiThink(world, a, p, st, DT);
      world.step(DT, [{ move: { x: 0, z: 0 }, torsoYaw: yaw, dash: false, fire: t % 0.4 < DT }, aiInput]);
      if (a.dashT <= 0) maxSpeed = Math.max(maxSpeed, Math.hypot(a.vel.x, a.vel.z));
    }
    expect(maxSpeed).toBeLessThanOrEqual(CFG.mech.maxSpeed + 1e-6);
  });
});

describe('round resolution', () => {
  it('a shell that arrives after the round is decided cannot hit the survivor', () => {
    // narrow corridor: the AI cannot sidestep, so without invulnerability the player's shell WOULD kill it
    const rows = ['#########', '#P.....E#', '#########'];
    const saved = CFG.cell;
    CFG.cell = 1.6;
    try {
      const world = new World(buildArena(rows));
      const p = world.addMech('player', true, world.arena.spawns.player);
      const a = world.addMech('ai', false, world.arena.spawns.enemy);
      const yaw = Math.atan2(-(a.pos.x - p.pos.x), -(a.pos.z - p.pos.z));
      p.torsoYaw = yaw;
      a.maxShells = 0;
      // an AI shell already 1.5 m from the player, flying at it: lands in ~0.1 s
      world.shells.push({ id: 999, owner: a.id, pos: { x: p.pos.x + 1.5, z: p.pos.z }, prev: { x: p.pos.x + 1.5, z: p.pos.z }, vel: { x: -CFG.shell.speed, z: 0 }, bounces: 0, age: 1, alive: true });
      a.shellsOut = 1;
      const st = makeAiState(0);
      // the player fires at t=0; its shell needs ~0.6 s to cross the corridor. The AI's lands at ~0.04 s.
      const hits = run(world, st, 0.2, (t) => ({ fire: t < 0.02, yaw }));
      expect(hits).toEqual([p.id]);
      expect(world.shells.some((sh) => sh.owner === p.id && sh.alive)).toBe(true); // the player's shell is still flying
      for (let t = 0; t < 1.5; t += DT) {
        const aiInput = aiThink(world, a, p, st, DT);
        world.step(DT, [{ move: { x: 0, z: 0 }, torsoYaw: yaw, dash: false, fire: false }, aiInput]);
      }
      expect(p.alive).toBe(false);
      expect(a.alive).toBe(true);
      expect(p.kills).toBe(0);
      expect(a.kills).toBe(1);
      expect(world.roundOver).toBe(true);
    } finally {
      CFG.cell = saved;
    }
  });
});

describe('bank-shot solver', () => {
  it('finds a one-bounce solution around a pillar and the simulated shell actually arrives', () => {
    // pillar between the two; the north wall offers a bounce
    const rows = ['#########', '#.......#', '#.......#', '#P..#..E#', '#.......#', '#########'];
    const world = new World(buildArena(rows));
    const p = world.addMech('player', true, world.arena.spawns.player);
    const a = world.addMech('ai', false, world.arena.spawns.enemy);
    const sol = findFireSolution(a, p, world.shellWalls);
    expect(sol).not.toBeNull();
    expect(sol!.via).not.toBeNull();
    // fly the shell along the solution with the real shell model
    const start = { x: a.pos.x + sol!.dir.x * (a.radius + CFG.shell.radius + 0.25), z: a.pos.z + sol!.dir.z * (a.radius + CFG.shell.radius + 0.25) };
    const s = { pos: start, vel: { x: sol!.dir.x * CFG.shell.speed, z: sol!.dir.z * CFG.shell.speed }, bounces: 0, age: 0, alive: true };
    let bouncesAtArrival = -1;
    for (let i = 0; i < 240 && s.alive; i++) {
      advanceShell(s, 1 / 120, world.shellWalls);
      if (Math.hypot(s.pos.x - p.pos.x, s.pos.z - p.pos.z) < p.radius) { bouncesAtArrival = s.bounces; break; }
    }
    // arrives at the target having bounced exactly once
    expect(bouncesAtArrival).toBe(1);
  });

  it('prefers the direct shot when the line is clear', () => {
    const rows = ['#########', '#P.....E#', '#########'];
    const world = new World(buildArena(rows));
    const p = world.addMech('player', true, world.arena.spawns.player);
    const a = world.addMech('ai', false, world.arena.spawns.enemy);
    const sol = findFireSolution(a, p, world.shellWalls);
    expect(sol!.via).toBeNull();
  });
});
