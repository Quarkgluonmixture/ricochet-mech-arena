import { describe, expect, it } from 'vitest';
import { buildArena } from '../src/sim/arena.ts';
import { CFG } from '../src/sim/config.ts';
import { predictImpacts } from '../src/sim/predict.ts';
import type { Shell } from '../src/sim/shell.ts';
import { World } from '../src/sim/world.ts';

// A wide open room: P at the left, E at the right, nothing in between.
const ROWS = ['###############', '#.............#', '#P...........E#', '#.............#', '###############'];

function setup() {
  const world = new World(buildArena(ROWS));
  const a = world.addMech('a', true, world.arena.spawns.player, 0, 'blue');
  const b = world.addMech('b', false, world.arena.spawns.enemy, 0, 'red');
  return { world, a, b };
}
function shell(world: World, owner: number, pos: { x: number; z: number }, vel: { x: number; z: number }, extra: Partial<Shell> = {}): Shell {
  const s: Shell = { id: world.nextShellId++, owner, pos: { ...pos }, prev: { ...pos }, vel: { ...vel }, bounces: 0, age: 1, alive: true, ...extra };
  world.shells.push(s);
  return s;
}

// The bugs these guard against: a kill cam that fires on shells that will never land (no walls in the
// prediction, no arming rule) or that calls a survivable hit fatal — both are silent, both just look wrong.
describe('predictImpacts', () => {
  it('reports a shell flying straight at a standing mech, fatal only on the last life', () => {
    const { world, a, b } = setup();
    const gap = 1.5; // edge to edge
    shell(world, a.id, { x: b.pos.x - (b.radius + CFG.shell.radius + gap), z: b.pos.z }, { x: CFG.shell.speed, z: 0 });
    const hits = predictImpacts(world, 0.3);
    expect(hits).toHaveLength(1);
    expect(hits[0].victim).toBe(b.id);
    expect(hits[0].owner).toBe(a.id);
    expect(hits[0].t).toBeGreaterThan(gap / CFG.shell.speed - 1 / 60);
    expect(hits[0].t).toBeLessThan(gap / CFG.shell.speed + 2 / 60);
    expect(hits[0].fatal).toBe(true);
    b.hp = 2;
    expect(predictImpacts(world, 0.3)[0].fatal).toBe(false);
  });

  it('reports nothing when the impact is beyond the lead, and nothing for a mech stepping out of the line', () => {
    const { world, a, b } = setup();
    shell(world, a.id, { x: b.pos.x - 8, z: b.pos.z }, { x: CFG.shell.speed, z: 0 });
    expect(predictImpacts(world, 0.2)).toHaveLength(0); // 8 m at 16 m/s = 0.5 s away
    expect(predictImpacts(world, 0.6)).toHaveLength(1);
    b.vel = { x: 0, z: CFG.mech.maxSpeed }; // sidestepping at full speed: 3.5 m clear by the time it arrives
    expect(predictImpacts(world, 0.6)).toHaveLength(0);
  });

  it('never reports a shell that dies on a wall first', () => {
    const { world, a } = setup();
    // aimed at the far wall from just in front of it, with one bounce already spent: it dies there
    const wallX = world.arena.spawns.enemy.x + 2; // the east wall face is at x = E + 2 (E sits in the last open cell)
    shell(world, a.id, { x: wallX - 0.5, z: world.arena.spawns.enemy.z }, { x: CFG.shell.speed, z: 0 }, { bounces: CFG.shell.maxBounces });
    // place the target beyond the wall on the same line, so only wall-awareness can rule the hit out
    world.mechs[1].pos = { x: wallX + 1.5, z: world.arena.spawns.enemy.z };
    expect(predictImpacts(world, 0.3)).toHaveLength(0);
  });

  it('applies the arming rule: a fresh own shell passes through its shooter, an armed one does not', () => {
    const { world, a } = setup();
    const s = shell(world, a.id, { x: a.pos.x - 1.2, z: a.pos.z }, { x: CFG.shell.speed, z: 0 }, { age: 0, bounces: 0 });
    expect(predictImpacts(world, 0.2)).toHaveLength(0);
    s.bounces = 1;
    const hits = predictImpacts(world, 0.2);
    expect(hits).toHaveLength(1);
    expect(hits[0].victim).toBe(a.id);
  });

  it('ignores invulnerable mechs and a decided round', () => {
    const { world, a, b } = setup();
    shell(world, a.id, { x: b.pos.x - 1.5, z: b.pos.z }, { x: CFG.shell.speed, z: 0 });
    b.invulnT = 0.5;
    expect(predictImpacts(world, 0.3)).toHaveLength(0);
    b.invulnT = 0;
    expect(predictImpacts(world, 0.3)).toHaveLength(1);
    world.roundDecidedAt = world.time;
    expect(predictImpacts(world, 0.3)).toHaveLength(0);
  });
});
