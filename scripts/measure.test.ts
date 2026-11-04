// Headless, reproducible AI-vs-AI measurement. Run with `npm run measure`.
//
// Game code imported here comes ONLY from src/sim/* — no three.js, no DOM, no browser, no clock.
// It replays the shipped AI-vs-AI setup from src/main.ts (buildRoster / applyRosterLimits /
// applyLives / simStep) at its fixed STEP = 1/120 for a fixed number of SIMULATED seconds, so the
// numbers do not depend on frame rate, swiftshader, or wall-clock time (GOTCHAS #12, #14, #B).
//
// This file is deliberately NOT under tests/: vite.config.ts includes only tests/**/*.test.ts,
// so `npm test` stays at its 31 sim tests and never counts a measurement as a pass/fail.
//
// Definitions (kept here so the numbers can be reproduced exactly):
//   shots          - 'fire' events, credited to the shooter's team.
//   rounds         - 'round' events = completed rounds (wipe + 2 s respawn delay);
//                    roundsStarted = world.round at the end (includes the last, open round).
//   round length   - from a round's start to the step its first fatal hit decided it; the 2 s
//                    respawn delay is excluded. An undecided final round is reported as open.
//   trapped        - an alive mech whose AiState.lastSafe === 0 on a replan (17 candidates,
//                    dash retry included); same condition main.ts uses for the kill cam.
//                    Only sampled after the first replan (lastCandidates > 0), since lastSafe
//                    starts at 0 before any plan exists.
//   min pair dist  - smallest centre-to-centre distance between any two ALIVE mechs at any step,
//                    and between two opposing mechs; 1.400 m is the sum of two radii.
//   focus          - LOG 2026-09-13 23:00: pickTarget scores a target a mate already engages
//                    6 m closer. Measured as frames where >= 2 alive teammates of a team hold
//                    the same live targetId, and as shots with >= 1 teammate on that target.
//   crossfire      - LOG 2026-09-13 23:00: planMove rewards a bearing to the shared target 90 deg
//                    away from a mate's (max +1.2). Measured at fire time as the largest bearing
//                    separation between the shooter and a mate on the SAME target, in degrees;
//                    >= 60 / >= 90 counts. Caveat: a bank shot's actual shell direction can
//                    differ from this bearing, so this measures stance, not shell paths.
//   digest         - sha256 over every step's round/score/mech state/AI state/event list, used
//                    for the determinism check (two independent runs per roster).

import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { aiThink, makeAiState, pickTarget, type AiState } from '../src/sim/ai.ts';
import { buildArena } from '../src/sim/arena.ts';
import { CFG } from '../src/sim/config.ts';
import { angleDiff, dist } from '../src/sim/geom.ts';
import type { Mech, Team } from '../src/sim/mech.ts';
import { World } from '../src/sim/world.ts';

const DT = 1 / 120;                 // src/main.ts STEP
const WINDOW_S = 300;              // fixed simulated seconds: long enough for team rounds to resolve
const SNAPSHOT_S = 90;             // historical comparison point (LOG 2026-09-13, GOTCHAS #6)
const STEPS = Math.round(WINDOW_S / DT);
const SNAPSHOT_STEP = Math.round(SNAPSHOT_S / DT);
const ROSTERS = [1, 2, 3] as const;
type Roster = (typeof ROSTERS)[number];
const TEAMS: readonly Team[] = ['blue', 'red'];

interface TeamStats {
  shots: number;
  kills: number;            // fatal hits on an enemy
  deaths: number;
  friendlyFire: number;     // hits on a teammate (fatal in EvE: 1 life each)
  ownGoals: number;         // shooter === victim
  bankHits: number;         // hits where the shell had bounced
  dashes: number;
  bounces: number;          // wall bounces by this team's shells
  trappedFrames: number;
  trappedEpisodes: number;
  everTrapped: boolean;
  minSafeMoves: number;
  focusFrames: number;      // frames with >= 2 teammates on the same live target
  teamFrames: number;       // frames with >= 2 alive, replanned teammates
  focusShots: number;       // shots with >= 1 teammate on the same target
  crossfire60: number;
  crossfire90: number;
  bearingSumDeg: number;    // sum of max separation over focusShots (for the mean)
}

interface Snapshot {
  shots: Record<Team, number>;
  roundResets: number;
  score: Record<Team, number>;
  everTrapped: Record<Team, boolean>;
}

interface MatchResult {
  roster: Roster;
  digest: string;
  score: Record<Team, number>;
  roundsStarted: number;
  roundResets: number;
  roundDurations: number[];
  openRoundS: number | null;
  firstKillS: number | null;
  minAnyPairM: number;
  minEnemyPairM: number;
  meanShellsInFlight: number;
  maxShellsInFlight: number;
  teams: Record<Team, TeamStats>;
  snapshot: Snapshot;
}

function newStats(): TeamStats {
  return {
    shots: 0, kills: 0, deaths: 0, friendlyFire: 0, ownGoals: 0, bankHits: 0,
    dashes: 0, bounces: 0, trappedFrames: 0, trappedEpisodes: 0, everTrapped: false,
    minSafeMoves: Infinity, focusFrames: 0, teamFrames: 0, focusShots: 0,
    crossfire60: 0, crossfire90: 0, bearingSumDeg: 0,
  };
}

/** planMove's crossfire term uses this exact bearing (target minus mech, atan2(z, x)). */
const bearingTo = (from: Mech, target: Mech): number =>
  Math.atan2(target.pos.z - from.pos.z, target.pos.x - from.pos.x);

function runMatch(roster: Roster): MatchResult {
  const arena = buildArena();           // MAP_A, the shipped arena
  const world = new World(arena);
  for (let i = 0; i < roster; i++) {
    world.addMech(`blue${i + 1}`, i === 0, arena.spawns.blue[i], arena.spawnYaw.blue[i], 'blue');
  }
  for (let i = 0; i < roster; i++) {
    world.addMech(`red${i + 1}`, false, arena.spawns.red[i], arena.spawnYaw.red[i], 'red');
  }
  // src/main.ts applyRosterLimits() + applyLives() in AI-vs-AI (attract / spectate):
  // 4 shells in flight, 0.5 s cooldown, one life each (VISION 4c).
  for (const m of world.mechs) {
    m.maxShells = CFG.spectate.maxShells;
    m.fireCooldown = CFG.spectate.fireCooldown;
    m.hpMax = 1;
    m.hp = 1;
  }
  world.resetMatch();
  world.events.length = 0;            // resetMatch pushes its own 'round' event outside a step
  const states: AiState[] = world.mechs.map((m) => makeAiState(m.torsoYaw));
  const teamOf = (id: number): Team => world.mechs[id].team;
  const teams: Record<Team, TeamStats> = { blue: newStats(), red: newStats() };
  const hash = createHash('sha256');
  const prevTrapped: Record<number, boolean> = {};

  let roundStart = 0;
  let decidedThisRound = false;
  let roundResets = 0;
  let firstKillS: number | null = null;
  let minAnyPairM = Infinity;
  let minEnemyPairM = Infinity;
  let shellSum = 0;
  let shellMax = 0;
  const roundDurations: number[] = [];
  let snapshot: Snapshot | null = null;

  for (let k = 0; k < STEPS; k++) {
    // src/main.ts simStep(): every mech, including the human slot, runs the same brain.
    const inputs = world.mechs.map((m) => {
      const mateTargets = world.matesOf(m).map((o) => states[o.id].targetId).filter((id) => id >= 0);
      const target = pickTarget(world, m, mateTargets) ?? world.mechs.find((o) => o.team !== m.team) ?? m;
      return aiThink(world, m, target, states[m.id], DT);
    });
    world.step(DT, inputs);

    for (const e of world.events) {
      switch (e.kind) {
        case 'fire': {
          const st = teams[teamOf(e.mech)];
          st.shots++;
          const shooter = world.mechs[e.mech];
          const targetId = states[e.mech].targetId;
          const target = targetId >= 0 ? world.mechs[targetId] : undefined;
          if (target && target.alive) {
            const mates = world.matesOf(shooter).filter(
              (o) => o.alive && states[o.id].lastCandidates > 0 && states[o.id].targetId === targetId,
            );
            if (mates.length > 0) {
              st.focusShots++;
              const mine = bearingTo(shooter, target);
              let maxSep = 0;
              for (const mate of mates) {
                maxSep = Math.max(maxSep, Math.abs(angleDiff(bearingTo(mate, target), mine)));
              }
              const deg = (maxSep * 180) / Math.PI;
              st.bearingSumDeg += deg;
              if (deg >= 60) st.crossfire60++;
              if (deg >= 90) st.crossfire90++;
            }
          }
          break;
        }
        case 'hit': {
          const st = teams[teamOf(e.shooter)];
          if (e.bounces > 0) st.bankHits++;
          if (e.shooter === e.victim) st.ownGoals++;
          else if (teamOf(e.shooter) === teamOf(e.victim)) st.friendlyFire++;
          else { st.kills++; teams[teamOf(e.victim)].deaths++; }
          if (e.fatal && firstKillS === null) firstKillS = world.time;
          break;
        }
        case 'dash':
          teams[teamOf(e.mech)].dashes++;
          break;
        case 'bounce':
          teams[teamOf(e.owner)].bounces++;
          break;
        case 'round':
          roundResets++;
          roundStart = world.time;
          decidedThisRound = false;
          for (const id of Object.keys(prevTrapped)) delete prevTrapped[Number(id)];
          break;
        case 'expire':
          break;
      }
    }

    if (!decidedThisRound && world.roundDecidedAt >= 0) {
      roundDurations.push(world.roundDecidedAt - roundStart);
      decidedThisRound = true;
    }

    for (let i = 0; i < world.mechs.length; i++) {
      const a = world.mechs[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < world.mechs.length; j++) {
        const b = world.mechs[j];
        if (!b.alive) continue;
        const d = dist(a.pos, b.pos);
        if (d < minAnyPairM) minAnyPairM = d;
        if (a.team !== b.team && d < minEnemyPairM) minEnemyPairM = d;
      }
    }

    for (const team of TEAMS) {
      const st = teams[team];
      const ready = world.alive(team).filter((m) => states[m.id].lastCandidates > 0);
      if (ready.length >= 2) {
        st.teamFrames++;
        const ids = ready.map((m) => states[m.id].targetId)
          .filter((id) => id >= 0 && world.mechs[id] !== undefined && world.mechs[id].alive);
        if (ids.some((id, idx) => ids.indexOf(id) !== idx)) st.focusFrames++;
      }
      for (const m of ready) {
        const safe = states[m.id].lastSafe;
        if (safe < st.minSafeMoves) st.minSafeMoves = safe;
        const trapped = safe === 0;
        if (trapped) {
          st.trappedFrames++;
          st.everTrapped = true;
        }
        if (trapped && !prevTrapped[m.id]) st.trappedEpisodes++;
        prevTrapped[m.id] = trapped;
      }
    }

    shellSum += world.shells.length;
    if (world.shells.length > shellMax) shellMax = world.shells.length;

    // Exact per-step trace: any divergence in mechanics, AI state or events changes the digest.
    hash.update(JSON.stringify([
      k, world.round, world.roundDecidedAt, world.score.blue, world.score.red,
      world.mechs.map((m) => [
        m.alive, m.pos.x, m.pos.z, m.vel.x, m.vel.z, m.torsoYaw, m.legsYaw,
        m.hp, m.fireCd, m.dashCd, m.dashT, m.shellsOut, m.kills, m.deaths,
      ]),
      states.map((s) => [s.lastSafe, s.lastCandidates, s.targetId, s.torsoYaw, s.noSolutionT, s.solution?.length ?? null]),
      world.shells.map((s) => [s.id, s.owner, s.pos.x, s.pos.z, s.vel.x, s.vel.z, s.bounces, s.age]),
      world.events,
    ]));

    if (k + 1 === SNAPSHOT_STEP) {
      snapshot = {
        shots: { blue: teams.blue.shots, red: teams.red.shots },
        roundResets,
        score: { blue: world.score.blue, red: world.score.red },
        everTrapped: { blue: teams.blue.everTrapped, red: teams.red.everTrapped },
      };
    }
  }

  return {
    roster,
    digest: hash.digest('hex'),
    score: { blue: world.score.blue, red: world.score.red },
    roundsStarted: world.round,
    roundResets,
    roundDurations,
    openRoundS: decidedThisRound ? null : world.time - roundStart,
    firstKillS,
    minAnyPairM,
    minEnemyPairM,
    meanShellsInFlight: shellSum / STEPS,
    maxShellsInFlight: shellMax,
    teams,
    snapshot: snapshot as Snapshot,
  };
}

const f1 = (n: number): string => (Number.isFinite(n) ? n.toFixed(1) : 'n/a');
const f3 = (n: number): string => (Number.isFinite(n) ? n.toFixed(3) : 'n/a');
const pct = (n: number, d: number): string => (d > 0 ? `${((100 * n) / d).toFixed(1)}%` : 'n/a');
const roundList = (r: MatchResult): string => {
  const closed = r.roundDurations.map((d) => `${d.toFixed(2)} s`).join(', ');
  const open = r.openRoundS !== null ? `; last round open at ${r.openRoundS.toFixed(2)} s` : '';
  return (closed || 'none') + open;
};

it('measures deterministic AI-vs-AI 1v1 / 2v2 / 3v3 on the sim only', () => {
  const out: string[] = [];
  const say = (s = ''): void => { out.push(s); };
  const results: MatchResult[] = [];
  const mismatches: string[] = [];

  say('=== ricochet-mech-arena · headless AI-vs-AI measurement ===');
  say(`reproduce: npm run measure | src/sim only | MAP_A | dt = 1/${Math.round(1 / DT)} s fixed`);
  say(`window: ${WINDOW_S} simulated seconds (${STEPS} steps) per roster; ${SNAPSHOT_S} s snapshot taken from the same run`);
  say('settings: EvE spectate limits (4 shells, 0.5 s cooldown), 1 life per mech, friendly fire on');
  say('');
  say('--- determinism: two independent runs per roster, full per-step trace ---');

  for (const n of ROSTERS) {
    const a = runMatch(n);
    const b = runMatch(n);
    const ok = a.digest === b.digest;
    if (!ok) mismatches.push(`${n}v${n}: ${a.digest} != ${b.digest}`);
    say(`${ok ? 'PASS' : 'FAIL'}  ${n}v${n}  sha256=${a.digest.slice(0, 16)}  (2 x ${STEPS} steps, identical trace)`);
    results.push(a);
  }

  say('');
  say('--- core metrics, full window ---');
  say('| roster | shots blue / red | rounds (resets) | round lengths | trapped 0/17 | min pair dist (any / enemy) | score |');
  say('|---|---|---|---|---|---|---|');
  for (const r of results) {
    const b = r.teams.blue, rd = r.teams.red;
    const trapped = `${b.everTrapped ? 'yes' : 'no'} / ${rd.everTrapped ? 'yes' : 'no'}`;
    say(`| ${r.roster}v${r.roster} | ${b.shots} / ${rd.shots} | ${r.roundResets} (started ${r.roundsStarted}) | ${roundList(r)} | ${trapped} | ${f3(r.minAnyPairM)} / ${f3(r.minEnemyPairM)} m | ${r.score.blue}-${r.score.red} |`);
  }

  say('');
  say('--- team behaviour, full window (1v1 has no mates: focus/crossfire n/a) ---');
  say('| roster | team | focus frames | focus shots | crossfire >=60 / >=90 | mean max bearing | kills | friendly fire | own goals | bank hits | min safe |');
  say('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of results) {
    for (const team of TEAMS) {
      const s = r.teams[team];
      const teamN = r.roster;
      say(`| ${r.roster}v${r.roster} | ${team} | ${teamN > 1 ? pct(s.focusFrames, s.teamFrames) : 'n/a'} | ${teamN > 1 ? pct(s.focusShots, s.shots) : 'n/a'} | ${teamN > 1 ? `${s.crossfire60} / ${s.crossfire90}` : 'n/a'} | ${s.focusShots > 0 ? `${f1(s.bearingSumDeg / s.focusShots)} deg` : 'n/a'} | ${s.kills} | ${s.friendlyFire} | ${s.ownGoals} | ${s.bankHits} | ${s.minSafeMoves === Infinity ? 'n/a' : s.minSafeMoves} |`);
    }
  }

  say('');
  say(`--- ${SNAPSHOT_S} s snapshot (comparison with the 2026-09-13 "90 s" note) ---`);
  for (const r of results) {
    say(`${r.roster}v${r.roster}: shots ${r.snapshot.shots.blue} / ${r.snapshot.shots.red}, rounds ${r.snapshot.roundResets}, score ${r.snapshot.score.blue}-${r.snapshot.score.red}, trapped ${r.snapshot.everTrapped.blue ? 'yes' : 'no'} / ${r.snapshot.everTrapped.red ? 'yes' : 'no'}`);
  }

  say('');
  say('--- machine-readable (one line per roster; diff two runs to check cross-process determinism) ---');
  for (const r of results) say(`[measure] ${r.roster}v${r.roster} ${JSON.stringify(r)}`);

  say('');
  say('first fatal hit: ' + results.map((r) => `${r.roster}v${r.roster} ${r.firstKillS === null ? 'none' : `${r.firstKillS.toFixed(2)} s`}`).join(' | '));
  say('mean / max shells in flight: ' + results.map((r) => `${r.roster}v${r.roster} ${f1(r.meanShellsInFlight)} / ${r.maxShellsInFlight}`).join(' | '));

  process.stdout.write(`${out.join('\n')}\n`);
  expect(mismatches).toEqual([]);
}, 600_000);
