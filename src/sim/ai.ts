import { CFG } from './config.ts';
import {
  type Aabb, type Vec2, add, angleDiff, dist, len, norm, pointSegmentDist, raycast, scale,
  segmentClear, sub, yawOf,
} from './geom.ts';
import { type Mech, type MechInput, motionOf, stepMotion } from './mech.ts';
import { predictPath } from './shell.ts';
import type { World } from './world.ts';

export interface FireSolution {
  /** Unit direction to fire. */
  dir: Vec2;
  /** Wall point the shell bounces off, or null for a direct shot. */
  via: Vec2 | null;
  /** Total path length, metres. */
  length: number;
}

export interface AiState {
  replanT: number;
  move: Vec2;
  dash: boolean;
  torsoYaw: number;
  /** Legs yaw seen last frame: the torso is carried by whatever the legs turned since. */
  lastLegsYaw: number;
  round: number;
  solution: FireSolution | null;
  /** Seconds since it last had a firing solution. Past a threshold it hunts for an angle instead of
   *  standing where a zero-width line of sight exists but no shell-width shot does (the AI-vs-AI deadlock). */
  noSolutionT: number;
  /** Diagnostics for the HUD / tests. */
  lastSafe: number;
  lastCandidates: number;
}

export const makeAiState = (yaw = 0): AiState => ({ replanT: 0, move: { x: 0, z: 0 }, dash: false, torsoYaw: yaw, lastLegsYaw: yaw, round: -1, solution: null, noSolutionT: 0, lastSafe: 0, lastCandidates: 0 });

/** Where the target will be when a shell fired now over `pathLen` metres arrives. Two fixed-point iterations. */
function leadPoint(from: Vec2, target: Mech, speed: number): Vec2 {
  let aim = { ...target.pos };
  for (let i = 0; i < 2; i++) {
    const t = dist(from, aim) / speed;
    aim = add(target.pos, scale(target.vel, t));
  }
  return aim;
}

/**
 * Direct or one-bounce firing solution using mirror images across wall faces. Uses the same expanded
 * walls the shell will actually fly against, so a returned solution is one the shell can take.
 * Rejects solutions whose return leg passes through the shooter (VISION §4: no reading the future
 * beyond what a player could compute — this is plain geometry).
 */
export function findFireSolution(self: Mech, target: Mech, shellWalls: Aabb[], speed: number = CFG.shell.speed, preferYaw?: number, mates: Mech[] = []): FireSolution | null {
  const origin = self.pos;
  const aim = leadPoint(origin, target, speed);
  const straight = sub(aim, origin);
  if (len(straight) < 1e-3) return null;
  // never through a teammate: friendly fire is on, so a leg that passes a mate is not a solution
  const clearOfMates = (a: Vec2, b: Vec2) => mates.every((mate) => pointSegmentDist(mate.pos, a, b) > mate.radius + CFG.shell.radius + 0.25);
  // Cost = path length + a turning penalty, so a bank shot the torso is already lined up on beats a
  // marginally shorter one that needs a 90° slew (which would never fire against a moving target).
  const cost = (sol: FireSolution) => sol.length + (preferYaw === undefined ? 0 : Math.abs(angleDiff(preferYaw, yawOf(sol.dir))) * 8);

  // direct. Rays start at the mech CENTRE, never at the nominal muzzle: the muzzle can lie inside a wall
  // when the mech is within ~1.1 m of it, and a ray born inside a box does not see that box.
  const dirDirect = norm(straight);
  if (segmentClear(origin, aim, shellWalls) && clearOfMates(origin, aim)) return { dir: dirDirect, via: null, length: len(straight) };

  let best: FireSolution | null = null;
  let bestCost = Infinity;
  const selfClear = self.radius + CFG.shell.radius + 0.2;
  for (const w of shellWalls) {
    // four faces: (axis, coordinate, sideSign) — a face is usable only from its outside
    const faces: Array<{ axis: 'x' | 'z'; c: number; side: number }> = [
      { axis: 'x', c: w.minX, side: -1 }, { axis: 'x', c: w.maxX, side: 1 },
      { axis: 'z', c: w.minZ, side: -1 }, { axis: 'z', c: w.maxZ, side: 1 },
    ];
    for (const f of faces) {
      const oc = f.axis === 'x' ? origin.x : origin.z;
      const ac = f.axis === 'x' ? aim.x : aim.z;
      // both shooter and target must be on the outer side of this face
      if ((oc - f.c) * f.side <= 0 || (ac - f.c) * f.side <= 0) continue;
      const mirror: Vec2 = f.axis === 'x' ? { x: 2 * f.c - aim.x, z: aim.z } : { x: aim.x, z: 2 * f.c - aim.z };
      const d = sub(mirror, origin);
      const dc = f.axis === 'x' ? d.x : d.z;
      if (Math.abs(dc) < 1e-6) continue;
      const t = (f.c - oc) / dc; // param along origin→mirror where it crosses the face plane
      if (t <= 0 || t >= 1) continue;
      const hit = add(origin, scale(d, t));
      const within = f.axis === 'x' ? hit.z >= w.minZ && hit.z <= w.maxZ : hit.x >= w.minX && hit.x <= w.maxX;
      if (!within) continue;
      const dir = norm(d);
      // leg 1, from the centre, must reach THIS face first
      const legLen = dist(origin, hit);
      const h = raycast(origin, dir, shellWalls, legLen - 1e-3);
      if (h) continue;
      // leg 2 must be clear and must not pass through the shooter
      const back = add(hit, scale(f.axis === 'x' ? { x: f.side, z: 0 } : { x: 0, z: f.side }, 1e-3));
      if (!segmentClear(back, aim, shellWalls)) continue;
      if (pointSegmentDist(origin, back, aim) < selfClear) continue;
      if (!clearOfMates(origin, hit) || !clearOfMates(back, aim)) continue;
      const length = dist(origin, hit) + dist(hit, aim);
      const sol = { dir, via: hit, length };
      const c = cost(sol);
      if (c < bestCost) { bestCost = c; best = sol; }
    }
  }
  return best;
}

interface Candidate { move: Vec2; dash: boolean }

/** Which enemy to fight: the nearest one, with a strong preference for one there is a line of fire to. */
export function pickTarget(world: World, self: Mech): Mech | null {
  let best: Mech | null = null;
  let bestScore = Infinity;
  for (const e of world.enemiesOf(self)) {
    const d = dist(self.pos, e.pos);
    const score = d + (segmentClear(self.pos, e.pos, world.shellWalls) ? 0 : 10);
    if (score < bestScore) { bestScore = score; best = e; }
  }
  return best;
}

/**
 * The dodge search. Every candidate is simulated with the real movement model against every live
 * shell's predicted path over the horizon. Safe candidates are scored by range band, line of sight,
 * wall contact (corners are where it dies) and smoothness; unsafe ones by how late they get hit.
 */
export function planMove(world: World, self: Mech, target: Mech, st: AiState, wantsToShoot = false): { move: Vec2; dash: boolean; safe: number; total: number } {
  const A = CFG.ai;
  const mates = world.matesOf(self);
  // other bodies as obstacles, frozen where they are now: good enough over a 1.5 s horizon and keeps the
  // dodge search from planning a path through a teammate it would then be stopped by
  const others = world.mechs.filter((o) => o.alive && o.id !== self.id).map((o) => ({ pos: o.pos, radius: o.radius }));
  const dt = A.predictDt;
  const steps = Math.ceil(A.horizon / dt);
  const hitR = self.radius + CFG.shell.radius + A.dodgeMargin;

  const paths: Vec2[][] = [];
  for (const s of world.shells) {
    if (!s.alive) continue;
    // a shell heading away and already far cannot matter within the horizon
    if (dist(s.pos, self.pos) > CFG.shell.speed * A.horizon + hitR + 2) continue;
    paths.push(predictPath(s, world.shellWalls, A.horizon, dt));
  }

  const hunting = st.noSolutionT > 0.8;
  const cands: Candidate[] = [{ move: { x: 0, z: 0 }, dash: false }];
  for (let i = 0; i < A.dirs; i++) {
    const a = (i / A.dirs) * Math.PI * 2;
    cands.push({ move: { x: Math.cos(a), z: Math.sin(a) }, dash: false });
  }
  const canDash = self.dashCd <= 0 && self.dashT <= 0;

  const evaluate = (c: Candidate) => {
    const m = motionOf(self);
    let hitAt = -1;
    let contacts = 0;
    for (let k = 0; k < steps; k++) {
      const r = stepMotion(m, c.move, c.dash && k === 0, dt, world.walls, others);
      if (r.wallContact) contacts++;
      for (const p of paths) {
        if (k >= p.length) continue;
        if (dist(p[k], m.pos) < hitR) { hitAt = k * dt; break; }
      }
      if (hitAt >= 0) break;
    }
    let score = 0;
    if (hitAt >= 0) score = -1000 + hitAt * 100;
    else {
      const d = dist(m.pos, target.pos);
      const rangePen = d < A.minRange ? (A.minRange - d) : d > A.maxRange ? (d - A.maxRange) : 0;
      score -= rangePen * 0.6;
      // line of fire, not line of sight: judged with the shell-width walls the solver uses
      if (segmentClear(m.pos, target.pos, world.shellWalls)) score += 2;
      // settle to shoot: a torso that is being dragged around by the legs never lines up
      if (wantsToShoot && paths.length === 0 && len(c.move) < 0.01) score += 1.5;
      // no shot for a while: standing still is the one thing that cannot fix that
      if (hunting) { if (len(c.move) < 0.01) score -= 1.5; score -= d * 0.15; }
      // spread out: a mech standing on a teammate blocks its shots and shares every ricochet
      for (const mate of mates) { const md = dist(m.pos, mate.pos); if (md < 3) score -= (3 - md) * 0.8; }
      score -= contacts * 0.05;
      score -= len(sub(c.move, st.move)) * 0.4;
      if (c.dash) score -= 3; // dashes are precious; spend them only when nothing else is safe
    }
    return { score, hitAt };
  };

  let best: Candidate = cands[0];
  let bestScore = -Infinity;
  let safe = 0;
  for (const c of cands) {
    const r = evaluate(c);
    if (r.hitAt < 0) safe++;
    if (r.score > bestScore) { bestScore = r.score; best = c; }
  }
  if (safe === 0 && canDash) {
    for (const c0 of cands) {
      if (len(c0.move) < 0.5) continue;
      const c = { move: c0.move, dash: true };
      const r = evaluate(c);
      if (r.hitAt < 0) safe++;
      if (r.score > bestScore) { bestScore = r.score; best = c; }
    }
  }
  return { move: best.move, dash: best.dash, safe, total: cands.length };
}

/** One frame of AI control. Replans on its interval; slews the torso every frame. */
export function aiThink(world: World, self: Mech, target: Mech, st: AiState, dt: number): MechInput {
  if (!self.alive) {
    st.move = { x: 0, z: 0 };
    return { move: st.move, torsoYaw: st.torsoYaw, dash: false, fire: false };
  }
  // Once the round is decided it keeps dodging (it is invulnerable, but standing still looks broken)
  // and stops shooting: nothing it fires now can count.
  const live = target.alive && !world.roundOver;
  st.replanT -= dt;
  if (st.replanT <= 0) {
    st.replanT = CFG.ai.replanInterval;
    const plan = planMove(world, self, target, st, live && st.solution !== null && self.shellsOut < self.maxShells);
    st.move = plan.move;
    st.dash = plan.dash;
    st.lastSafe = plan.safe;
    st.lastCandidates = plan.total;
    st.solution = live ? findFireSolution(self, target, world.shellWalls, CFG.shell.speed, st.torsoYaw, world.matesOf(self)) : null;
    st.noSolutionT = st.solution ? 0 : st.noSolutionT + CFG.ai.replanInterval;
  }
  // Torso model (AI only; the player's mouse is free):
  // 1. the torso rides on the legs — whatever the body turned since last frame, the torso turns too;
  if (st.round !== world.round) { st.round = world.round; st.torsoYaw = self.torsoYaw; st.lastLegsYaw = self.legsYaw; }
  //    (only while moving: standing still the legs turn towards the torso, and dragging the torso by
  //    that would make the two chase each other round in circles)
  if (len(self.vel) > 0.5) st.torsoYaw += angleDiff(st.lastLegsYaw, self.legsYaw);
  st.lastLegsYaw = self.legsYaw;
  // 2. then it slews back towards the aim at a bounded rate;
  const wantYaw = st.solution ? yawOf(st.solution.dir) : yawOf(sub(target.pos, self.pos));
  const d = angleDiff(st.torsoYaw, wantYaw);
  const maxStep = CFG.mech.torsoTurnRateAI * dt;
  st.torsoYaw += Math.abs(d) < maxStep ? d : Math.sign(d) * maxStep;
  // 3. and it cannot aim outside the cone around the legs — a target behind it needs a body turn first.
  const rel = angleDiff(self.legsYaw, st.torsoYaw);
  const cone = CFG.ai.aimCone;
  if (rel > cone) st.torsoYaw = self.legsYaw + cone;
  else if (rel < -cone) st.torsoYaw = self.legsYaw - cone;
  const onTarget = st.solution !== null && Math.abs(angleDiff(st.torsoYaw, wantYaw)) < CFG.ai.aimTolerance;
  const fire = live && onTarget && self.fireCd <= 0 && self.shellsOut < self.maxShells;
  const dash = st.dash;
  st.dash = false; // a dash is a one-frame request
  return { move: st.move, torsoYaw: st.torsoYaw, dash, fire };
}

