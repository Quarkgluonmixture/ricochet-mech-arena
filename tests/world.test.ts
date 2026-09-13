import { describe, expect, it } from 'vitest';
import { buildArena } from '../src/sim/arena.ts';
import { CFG } from '../src/sim/config.ts';
import { World } from '../src/sim/world.ts';

const DT = 1 / 120;

describe('lives (VISION §4c)', () => {
  it('the human loses a life per hit, ignores hits while invulnerable, and dies on the last one', () => {
    // the AI stands on a different row: a shell that passes the invulnerable player bounces back down the
    // row and would otherwise kill the AI (own ricochet), deciding the round before the last shot lands
    const rows = ['###########', '#.........#', '#.........#', '#.........#', '#P........#', '#.........#', '#.........#', '#........E#', '#.........#', '###########'];
    const world = new World(buildArena(rows));
    const p = world.addMech('player', true, world.arena.spawns.player);
    const a = world.addMech('ai', false, world.arena.spawns.enemy);
    expect(p.hp).toBe(CFG.player.lives);
    expect(a.hp).toBe(1);
    const idle = { move: { x: 0, z: 0 }, torsoYaw: p.torsoYaw, dash: false, fire: false };
    const shoot = () => {
      world.shells.push({ id: world.nextShellId++, owner: a.id, pos: { x: p.pos.x + 1.5, z: p.pos.z }, prev: { x: p.pos.x + 1.5, z: p.pos.z }, vel: { x: -CFG.shell.speed, z: 0 }, bounces: 0, age: 1, alive: true });
    };
    const run = (seconds: number) => { const hits: boolean[] = []; for (let t = 0; t < seconds; t += DT) { world.step(DT, [idle, null]); for (const e of world.events) if (e.kind === 'hit') hits.push(e.fatal); } return hits; };
    shoot();
    expect(run(0.2)).toEqual([false]);
    expect(p.hp).toBe(CFG.player.lives - 1);
    expect(p.alive).toBe(true);
    expect(world.roundOver).toBe(false);
    // a second shell inside the invulnerability window passes straight through
    shoot();
    expect(run(0.2)).toEqual([]);
    expect(p.hp).toBe(CFG.player.lives - 1);
    // after the window, hits count again (a little past it: the timer counts down in float steps)
    run(CFG.player.invulnTime + 0.1);
    shoot();
    expect(run(0.2)).toEqual([false]);
    expect(p.hp).toBe(1);
    run(CFG.player.invulnTime + 0.1);
    shoot();
    expect(run(0.2)).toEqual([true]);
    expect(p.alive).toBe(false);
    expect(world.roundOver).toBe(true);
    expect(a.kills).toBe(1);
  });
});

describe('firing against a wall', () => {
  it('a shell fired while pressed against a wall bounces back instead of passing through', () => {
    const rows = ['#######', '#P...E#', '#######'];
    const world = new World(buildArena(rows));
    const p = world.addMech('player', true, world.arena.spawns.player);
    world.addMech('ai', false, world.arena.spawns.enemy);
    // press the player against the north wall (z = minZ of the arena interior) and face it
    const north = world.arena.walls[0];
    p.pos = { x: p.pos.x, z: north.maxZ + p.radius + 0.01 };
    p.torsoYaw = Math.atan2(0, 1); // forward = (0, -1): straight into the wall
    // the nominal muzzle (1.13 m ahead) would be 0.4 m INSIDE the wall
    world.step(DT, [{ move: { x: 0, z: 0 }, torsoYaw: p.torsoYaw, dash: false, fire: true }, null]);
    const fired = world.events.find((e) => e.kind === 'fire');
    expect(fired).toBeDefined();
    expect(fired!.pos.z).toBeGreaterThan(north.maxZ + CFG.shell.radius - 1e-3); // born on the arena side
    // it bounced off the wall face (on the arena side) instead of passing through it
    const bounce = world.events.find((e) => e.kind === 'bounce');
    expect(bounce).toBeDefined();
    expect(bounce!.pos.z).toBeGreaterThan(north.maxZ + CFG.shell.radius - 1e-3);
    // point-blank into a wall is an own goal by design: the ricochet comes straight back
    const hit = world.events.find((e) => e.kind === 'hit');
    expect(hit && hit.kind === 'hit' ? hit.victim : -1).toBe(p.id);
    for (const sh of world.shells) expect(sh.pos.z).toBeGreaterThan(north.maxZ);
  });

  it('a shell fired from 1 m off a wall at an angle banks off it rather than tunnelling', () => {
    const rows = ['#######', '#P...E#', '#######'];
    const world = new World(buildArena(rows));
    const p = world.addMech('player', true, world.arena.spawns.player);
    world.addMech('ai', false, world.arena.spawns.enemy);
    const north = world.arena.walls[0];
    p.pos = { x: p.pos.x, z: north.maxZ + 1.0 }; // not touching: 0.3 m of air between hull and wall
    // 35° off the wall normal, towards +x
    const ang = (35 * Math.PI) / 180;
    const dir = { x: Math.sin(ang), z: -Math.cos(ang) };
    p.torsoYaw = Math.atan2(-dir.x, -dir.z);
    world.step(DT, [{ move: { x: 0, z: 0 }, torsoYaw: p.torsoYaw, dash: false, fire: true }, null]);
    let bounced = false;
    for (let t = 0; t < 0.5; t += DT) {
      world.step(DT, [{ move: { x: 0, z: 0 }, torsoYaw: p.torsoYaw, dash: false, fire: false }, null]);
      if (world.events.some((e) => e.kind === 'bounce')) bounced = true;
      for (const sh of world.shells) expect(sh.pos.z).toBeGreaterThan(north.maxZ);
    }
    expect(bounced).toBe(true);
  });
});
