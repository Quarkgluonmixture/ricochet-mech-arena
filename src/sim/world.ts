import { CFG } from './config.ts';
import { type Arena, buildArena } from './arena.ts';
import { type Aabb, type Vec2, add, expandAll, forward, pointSegmentDist, raycast, scale } from './geom.ts';
import { type Mech, type MechInput, makeMech, stepMech } from './mech.ts';
import { type BounceEvent, type Shell, advanceShell } from './shell.ts';

export type WorldEvent =
  | { kind: 'fire'; pos: Vec2; mech: number }
  | { kind: 'dash'; pos: Vec2; mech: number }
  | { kind: 'bounce'; pos: Vec2; nx: number; nz: number; shell: number; owner: number }
  | { kind: 'expire'; pos: Vec2; shell: number; owner: number }
  | { kind: 'hit'; pos: Vec2; shooter: number; victim: number; bounces: number; shell: number; /** shell velocity at impact */ vel: Vec2 }
  | { kind: 'round'; pos: Vec2 };

export const MUZZLE_OFFSET = CFG.mech.radius + CFG.shell.radius + 0.25;

/**
 * The whole game state and its single step function. No rendering, no DOM, no three.js.
 * Inputs come in per mech id; the world does not care who produced them (VISION §4 symmetry).
 */
export class World {
  arena: Arena;
  walls: Aabb[];
  /** Walls grown by the shell radius: what a shell's centre actually collides with. */
  shellWalls: Aabb[];
  mechs: Mech[] = [];
  shells: Shell[] = [];
  time = 0;
  events: WorldEvent[] = [];
  roundResetAt = -1;
  /** Sim time of the first hit this round; -1 while the round is still open. Once set, survivors are
   *  invulnerable — a shell that arrives after you are already dead cannot win you the round. Hits in the
   *  SAME step as the first one still count, so a genuine trade is a draw, not a coin flip on shell order. */
  roundDecidedAt = -1;
  round = 1;
  nextShellId = 1;

  constructor(arena: Arena = buildArena()) {
    this.arena = arena;
    this.walls = arena.walls;
    this.shellWalls = expandAll(arena.walls, CFG.shell.radius);
  }

  addMech(name: string, isPlayer: boolean, pos: Vec2, yaw = 0): Mech {
    const m = makeMech(this.mechs.length, name, isPlayer, pos, yaw);
    this.mechs.push(m);
    return m;
  }

  step(dt: number, inputs: (MechInput | null)[]): void {
    this.events.length = 0;
    this.time += dt;

    for (const m of this.mechs) {
      if (!m.alive) continue;
      const input = inputs[m.id] ?? { move: { x: 0, z: 0 }, torsoYaw: m.torsoYaw, dash: false, fire: false };
      const r = stepMech(m, input, dt, this.walls);
      if (r.dashed) this.events.push({ kind: 'dash', pos: { ...m.pos }, mech: m.id });
      if (input.fire && m.fireCd <= 0 && m.shellsOut < m.maxShells) this.fire(m);
    }

    const bounces: BounceEvent[] = [];
    for (const s of this.shells) {
      if (!s.alive) continue;
      s.prev = { ...s.pos };
      bounces.length = 0;
      advanceShell(s, dt, this.shellWalls, CFG.shell.maxBounces, bounces);
      for (const b of bounces) this.events.push({ kind: 'bounce', pos: b.pos, nx: b.nx, nz: b.nz, shell: s.id, owner: s.owner });
      if (!s.alive) {
        this.events.push({ kind: 'expire', pos: { ...s.pos }, shell: s.id, owner: s.owner });
        continue;
      }
      this.hitTest(s);
    }

    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i];
      if (!s.alive) {
        const owner = this.mechs[s.owner];
        if (owner) owner.shellsOut = Math.max(0, owner.shellsOut - 1);
        this.shells.splice(i, 1);
      }
    }

    if (this.roundResetAt >= 0 && this.time >= this.roundResetAt) this.resetRound();
  }

  /** Where a shell leaves the mech. Normally MUZZLE_OFFSET ahead of the centre; if a wall is closer than
   *  that, just short of the wall — a shell must never be born inside a box, because a ray that starts
   *  inside a box sees no wall and the shell would sail straight through it. */
  muzzlePoint(m: Mech): Vec2 {
    const f = forward(m.torsoYaw);
    let d = MUZZLE_OFFSET;
    const hit = raycast(m.pos, f, this.shellWalls, d);
    if (hit) d = Math.max(0.02, hit.t - 0.02);
    return add(m.pos, scale(f, d));
  }

  private fire(m: Mech): void {
    const f = forward(m.torsoYaw);
    const muzzle = this.muzzlePoint(m);
    const s: Shell = {
      id: this.nextShellId++, owner: m.id,
      pos: muzzle, prev: { ...muzzle }, vel: scale(f, CFG.shell.speed),
      bounces: 0, age: 0, alive: true,
    };
    this.shells.push(s);
    m.shellsOut++;
    m.fireCd = m.fireCooldown;
    this.events.push({ kind: 'fire', pos: { ...muzzle }, mech: m.id });
  }

  get roundOver(): boolean { return this.roundDecidedAt >= 0; }

  private hitTest(s: Shell): void {
    if (this.roundDecidedAt >= 0 && this.time !== this.roundDecidedAt) return;
    for (const m of this.mechs) {
      if (!m.alive) continue;
      if (m.id === s.owner && s.bounces === 0 && s.age < CFG.shell.selfArmTime) continue;
      if (pointSegmentDist(m.pos, s.prev, s.pos) > m.radius + CFG.shell.radius) continue;
      m.alive = false;
      m.deaths++;
      // the round goes to the shooter, or on an own goal to whoever is still standing
      const shooter = this.mechs[s.owner];
      const winner = shooter && shooter.id !== m.id ? shooter : this.mechs.find((o) => o.id !== m.id && o.alive);
      if (winner) winner.kills++;
      s.alive = false;
      this.events.push({ kind: 'hit', pos: { ...m.pos }, shooter: s.owner, victim: m.id, bounces: s.bounces, shell: s.id, vel: { ...s.vel } });
      if (this.roundDecidedAt < 0) {
        this.roundDecidedAt = this.time;
        this.roundResetAt = this.time + CFG.round.respawnDelay;
      }
      return;
    }
  }

  /** New match: scores and round counter back to zero, then a fresh round. */
  resetMatch(): void {
    for (const m of this.mechs) { m.kills = 0; m.deaths = 0; }
    this.round = 0;
    this.time = 0;
    this.resetRound();
  }

  resetRound(): void {
    this.roundResetAt = -1;
    this.roundDecidedAt = -1;
    this.round++;
    for (const s of this.shells) s.alive = false;
    this.shells.length = 0;
    const spawns = [this.arena.spawns.player, this.arena.spawns.enemy];
    const yaws = [this.arena.spawnYaw.player, this.arena.spawnYaw.enemy];
    this.mechs.forEach((m, i) => {
      const sp = spawns[i % spawns.length];
      m.pos = { ...sp };
      m.vel = { x: 0, z: 0 };
      m.alive = true;
      m.dashT = 0; m.dashCd = 0; m.fireCd = 0; m.shellsOut = 0;
      const yaw = yaws[i % yaws.length];
      m.torsoYaw = yaw; m.legsYaw = yaw;
    });
    this.events.push({ kind: 'round', pos: { x: 0, z: 0 } });
  }
}
