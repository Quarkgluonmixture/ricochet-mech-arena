import { CFG } from './config.ts';
import { type Aabb, type Vec2, angleDiff, dot, len, norm, resolveCircle, scale, sub, yawOf } from './geom.ts';

export interface MechInput {
  /** Desired movement direction in world XZ, |move| <= 1. */
  move: Vec2;
  /** Torso yaw the controller wants this frame (the AI rate-limits before passing it in). */
  torsoYaw: number;
  dash: boolean;
  fire: boolean;
}

export interface Mech {
  id: number;
  name: string;
  isPlayer: boolean;
  pos: Vec2;
  vel: Vec2;
  torsoYaw: number;
  legsYaw: number;
  alive: boolean;
  radius: number;
  dashT: number;
  dashCd: number;
  dashDir: Vec2;
  fireCd: number;
  /** Seconds between shots for THIS mech (set by role; spectator mode overrides both). */
  fireCooldown: number;
  maxShells: number;
  shellsOut: number;
  kills: number;
  deaths: number;
  /** Last commanded move, for animation and for the AI's smoothness term. */
  moveIntent: Vec2;
}

export function makeMech(id: number, name: string, isPlayer: boolean, pos: Vec2, yaw = 0): Mech {
  return {
    id, name, isPlayer,
    pos: { ...pos }, vel: { x: 0, z: 0 },
    torsoYaw: yaw, legsYaw: yaw,
    alive: true, radius: CFG.mech.radius,
    dashT: 0, dashCd: 0, dashDir: { x: 0, z: 0 },
    fireCd: 0,
    fireCooldown: isPlayer ? CFG.player.fireCooldown : CFG.ai.fireCooldown,
    maxShells: isPlayer ? CFG.player.maxShells : CFG.ai.maxShells,
    shellsOut: 0, kills: 0, deaths: 0,
    moveIntent: { x: 0, z: 0 },
  };
}

/** Lightweight copy of the motion state, for the AI's candidate simulations. */
export interface MotionState { pos: Vec2; vel: Vec2; dashT: number; dashCd: number; dashDir: Vec2 }
export const motionOf = (m: Mech): MotionState => ({ pos: { ...m.pos }, vel: { ...m.vel }, dashT: m.dashT, dashCd: m.dashCd, dashDir: { ...m.dashDir } });

/**
 * The movement model. Player, AI and the AI's what-if candidates all go through this one function
 * (VISION §4). Returns the wall push normal (zero when free) and whether a dash started.
 */
export function stepMotion(m: MotionState, move: Vec2, dash: boolean, dt: number, walls: Aabb[]): { dashed: boolean; wallContact: boolean } {
  const c = CFG.mech;
  let mag = len(move);
  if (mag > 1) { move = scale(move, 1 / mag); mag = 1; }
  let dashed = false;
  if (dash && m.dashCd <= 0 && mag > 0.01) {
    m.dashT = c.dashTime;
    m.dashCd = c.dashCooldown;
    m.dashDir = norm(move);
    dashed = true;
  }
  if (m.dashT > 0) {
    m.vel = scale(m.dashDir, c.dashSpeed);
    m.dashT -= dt;
  } else {
    const desired = scale(move, c.maxSpeed);
    const dv = sub(desired, m.vel);
    const maxDv = (mag > 0.01 ? c.accel : c.brake) * dt;
    const l = len(dv);
    m.vel = l > maxDv ? { x: m.vel.x + (dv.x / l) * maxDv, z: m.vel.z + (dv.z / l) * maxDv } : desired;
  }
  m.dashCd = Math.max(0, m.dashCd - dt);
  m.pos = { x: m.pos.x + m.vel.x * dt, z: m.pos.z + m.vel.z * dt };
  const push = resolveCircle(m.pos, c.radius, walls);
  const contact = len(push) > 0;
  if (contact) {
    // cancel the velocity component driving into the wall; sliding along it is fine
    const n = norm(push);
    const into = dot(m.vel, n);
    if (into < 0) m.vel = sub(m.vel, scale(n, into));
    if (m.dashT > 0) m.dashT = 0;
  }
  return { dashed, wallContact: contact };
}

/** Advance a real mech: motion, torso, legs, cooldowns. Fire is handled by the world. */
export function stepMech(m: Mech, input: MechInput, dt: number, walls: Aabb[]): { dashed: boolean } {
  m.moveIntent = { ...input.move };
  const r = stepMotion(m, input.move, input.dash, dt, walls);
  m.torsoYaw = input.torsoYaw;
  m.fireCd = Math.max(0, m.fireCd - dt);
  // legs face the movement direction; standing still, they turn in place to face the torso
  const speed = len(m.vel);
  const target = speed > 0.5 ? yawOf(m.vel) : m.torsoYaw;
  const d = angleDiff(m.legsYaw, target);
  const step = CFG.mech.legsTurnRate * dt;
  m.legsYaw += Math.abs(d) < step ? d : Math.sign(d) * step;
  return { dashed: r.dashed };
}
