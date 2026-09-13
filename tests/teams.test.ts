import { describe, expect, it } from 'vitest';
import { findFireSolution, pickTarget } from '../src/sim/ai.ts';
import { buildArena } from '../src/sim/arena.ts';
import { CFG } from '../src/sim/config.ts';
import { World } from '../src/sim/world.ts';

const DT = 1 / 120;
const idle = (yaw: number) => ({ move: { x: 0, z: 0 }, torsoYaw: yaw, dash: false, fire: false });

describe('mech collision', () => {
  it('two mechs walking into each other stop at touching distance instead of overlapping', () => {
    const rows = ['###########', '#P.......E#', '###########'];
    const world = new World(buildArena(rows));
    const a = world.addMech('a', true, world.arena.spawns.player, 0, 'blue');
    const b = world.addMech('b', false, world.arena.spawns.enemy, 0, 'red');
    a.maxShells = 0; b.maxShells = 0;
    for (let t = 0; t < 6; t += DT) {
      world.step(DT, [{ move: { x: 1, z: 0 }, torsoYaw: a.torsoYaw, dash: false, fire: false }, { move: { x: -1, z: 0 }, torsoYaw: b.torsoYaw, dash: false, fire: false }]);
      const d = Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);
      expect(d).toBeGreaterThanOrEqual(a.radius + b.radius - 1e-6);
    }
    const d = Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);
    expect(d).toBeLessThan(a.radius + b.radius + 0.2); // they met and are pressed together
  });
});

describe('teams', () => {
  it('parses P/B and E/R spawns into two teams with facing yaws', () => {
    const a = buildArena();
    expect(a.spawns.blue.length).toBe(3);
    expect(a.spawns.red.length).toBe(3);
    expect(a.spawnYaw.blue.length).toBe(3);
    expect(a.spawns.blue[0]).toEqual(a.spawns.player);
  });

  it('a round ends only when a whole team is down, and the other team scores', () => {
    const rows = ['###########', '#P.B......#', '#.........#', '#.........#', '#.........#', '#.........#', '#.........#', '#.........#', '#......R.E#', '###########'];
    const world = new World(buildArena(rows));
    const b0 = world.addMech('b0', true, world.arena.spawns.blue[0], 0, 'blue');
    const b1 = world.addMech('b1', false, world.arena.spawns.blue[1], 0, 'blue');
    const r0 = world.addMech('r0', false, world.arena.spawns.red[0], 0, 'red');
    const r1 = world.addMech('r1', false, world.arena.spawns.red[1], 0, 'red');
    for (const m of world.mechs) { m.hpMax = 1; m.hp = 1; }
    const shootAt = (victim: typeof r0, owner: typeof b0) => {
      world.shells.push({ id: world.nextShellId++, owner: owner.id, pos: { x: victim.pos.x, z: victim.pos.z - 1.5 }, prev: { x: victim.pos.x, z: victim.pos.z - 1.5 }, vel: { x: 0, z: CFG.shell.speed }, bounces: 0, age: 1, alive: true });
    };
    const run = (sec: number) => { for (let t = 0; t < sec; t += DT) world.step(DT, world.mechs.map((m) => idle(m.torsoYaw))); };
    shootAt(r0, b0); run(0.2);
    expect(r0.alive).toBe(false);
    expect(world.roundOver).toBe(false);
    expect(world.score).toEqual({ blue: 0, red: 0 });
    expect(b0.kills).toBe(1);
    shootAt(r1, b1); run(0.2);
    expect(r1.alive).toBe(false);
    expect(world.roundOver).toBe(true);
    expect(world.score).toEqual({ blue: 1, red: 0 });
    // friendly fire kills but earns nothing
    run(CFG.round.respawnDelay + 0.1);
    expect(world.roundOver).toBe(false);
    shootAt(b1, b0); run(0.2);
    expect(b1.alive).toBe(false);
    expect(b0.kills).toBe(1);
  });

  it('picks the enemy it has a line of fire to over a somewhat nearer one behind a wall', () => {
    // near (R) is 12.6 m away behind the pillar, far (E) is 20 m away in the clear; the 10 m line-of-fire
    // penalty decides it. Past that gap the nearer one wins and the hunting logic finds an angle instead.
    const rows = ['###########', '#P........#', '#.........#', '#.#.......#', '#.R..E....#', '#.........#', '#.........#', '#.........#', '#.........#', '###########'];
    const world = new World(buildArena(rows));
    const me = world.addMech('me', true, world.arena.spawns.blue[0], 0, 'blue');
    const near = world.addMech('near', false, world.arena.spawns.red[1], 0, 'red'); // 'R': behind the pillar at row 3
    const far = world.addMech('far', false, world.arena.spawns.red[0], 0, 'red');
    const t = pickTarget(world, me);
    expect(t?.id).toBe(far.id);
    expect(t?.id).not.toBe(near.id);
  });

  it('refuses a direct shot through a teammate and banks around it instead', () => {
    const rows = ['#########', '#P..B..E#', '#########'];
    const world = new World(buildArena(rows));
    const me = world.addMech('me', true, world.arena.spawns.blue[0], 0, 'blue');
    const mate = world.addMech('mate', false, world.arena.spawns.blue[1], 0, 'blue');
    const foe = world.addMech('foe', false, world.arena.spawns.red[0], 0, 'red');
    const alone = findFireSolution(me, foe, world.shellWalls);
    expect(alone?.via).toBeNull(); // without mates: the direct shot
    const withMate = findFireSolution(me, foe, world.shellWalls, CFG.shell.speed, undefined, [mate]);
    expect(withMate).not.toBeNull();
    expect(withMate!.via).not.toBeNull(); // a bank shot that clears the mate by the wall
  });
});
