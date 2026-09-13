import { type AiState, aiThink, makeAiState } from './sim/ai.ts';
import { MAP_A, buildArena } from './sim/arena.ts';
import { CFG } from './sim/config.ts';
import { type Vec2, forward, norm, right } from './sim/geom.ts';
import type { MechInput } from './sim/mech.ts';
import { World } from './sim/world.ts';
import { CameraRig } from './render/camera.ts';
import { Fx } from './render/fx.ts';
import { HeadMarker } from './render/marker.ts';
import { MechView } from './render/mech.ts';
import { TEX } from './render/assets.ts';
import { COLORS, createScene } from './render/scene.ts';
import { ShellViews } from './render/shells.ts';
import { SpectatorCamera } from './render/spectator.ts';
import { GroundTrail } from './render/trail.ts';
import { Audio } from './ui/audio.ts';
import { Hud } from './ui/hud.ts';
import { Radar } from './ui/radar.ts';
import { ThreatRing } from './ui/threat.ts';

// ---- world ----------------------------------------------------------------------------------
const arena = buildArena(MAP_A);
const world = new World(arena);
const player = world.addMech('you', true, arena.spawns.player, arena.spawnYaw.player);
const enemy = world.addMech('AI', false, arena.spawns.enemy, arena.spawnYaw.enemy);
const aiState: AiState = makeAiState(enemy.torsoYaw);
/** Brain for the blue mech while spectating (AI vs AI). Same code as red. */
const blueState: AiState = makeAiState(player.torsoYaw);

// ---- render + ui ----------------------------------------------------------------------------
const view = document.getElementById('view') as HTMLElement;
const { renderer, scene, camera, render } = createScene(view, arena);
const playerView = new MechView(scene, COLORS.you);
const enemyView = new MechView(scene, COLORS.ai);
const shellViews = new ShellViews(scene, (owner) => (owner === player.id ? COLORS.you : COLORS.ai));
const fx = new Fx(scene);
const enemyMarker = new HeadMarker(scene, COLORS.ai);
const playerMarker = new HeadMarker(scene, COLORS.you);
const enemyTrail = new GroundTrail(scene, COLORS.ai);
const playerTrail = new GroundTrail(scene, COLORS.you);
const rig = new CameraRig(camera, scene, arena.walls, COLORS.you);
const spec = new SpectatorCamera(camera);
const hud = new Hud();
const radar = new Radar(document.getElementById('radar') as HTMLCanvasElement, arena, { you: '#6fb6ff', ai: '#ff6a5c' });
const threat = new ThreatRing(document.getElementById('threat') as HTMLCanvasElement);
const audio = new Audio();
hud.setCamMode(rig.mode);
hud.setKeyArt(TEX.keyart);

// ---- input ----------------------------------------------------------------------------------
const keys = new Set<string>();
let yaw = player.torsoYaw;
let firePressed = false;
let fireHeld = false;
let dashPressed = false;
let locked = false;
let spectating = false;
let dragging = false;
const SENS = 0.0022;

function setSpectate(on: boolean): void {
  if (spectating === on) return;
  spectating = on;
  hud.setSpectate(on);
  if (on) {
    if (document.pointerLockElement) document.exitPointerLock();
    hud.setOverlay(false);
    spec.reset();
    blueState.round = -1; // resync its torso to the mech on the first think
    for (const m of world.mechs) { m.maxShells = CFG.spectate.maxShells; m.fireCooldown = CFG.spectate.fireCooldown; }
    rig.setViewmodelVisible(false);
  } else {
    player.maxShells = CFG.player.maxShells; player.fireCooldown = CFG.player.fireCooldown;
    enemy.maxShells = CFG.ai.maxShells; enemy.fireCooldown = CFG.ai.fireCooldown;
    yaw = player.torsoYaw;
    rig.pitch = 0;
    hud.setOverlay(!locked);
  }
}
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

document.addEventListener('keydown', (e) => {
  if (e.code === 'Space') e.preventDefault();
  if (e.repeat) return;
  keys.add(e.code);
  if (e.code === 'KeyT') { setSpectate(!spectating); return; }
  if (spectating) {
    if (e.code === 'Escape') setSpectate(false);
    if (e.code === 'KeyV') spec.toggle();
    if (e.code === 'KeyR') world.resetRound();
    return;
  }
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'Space') dashPressed = true;
  if (e.code === 'KeyV') hud.setCamMode(rig.toggle());
  if (e.code === 'KeyR') world.resetRound();
});
document.addEventListener('keyup', (e) => keys.delete(e.code));
document.addEventListener('mousemove', (e) => {
  if (spectating) { if (dragging) spec.orbit(-e.movementX * 0.006); return; }
  if (!locked) return;
  yaw -= e.movementX * SENS;
  rig.pitch = clamp(rig.pitch - e.movementY * SENS, -1.2, 1.2);
});
document.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  if (spectating) { dragging = true; return; }
  if (!locked) return;
  firePressed = true;
  fireHeld = true;
});
document.addEventListener('mouseup', (e) => { if (e.button === 0) { fireHeld = false; dragging = false; } });
document.addEventListener('wheel', (e) => { if (spectating) spec.zoomBy(e.deltaY > 0 ? 1.12 : 0.89); }, { passive: true });
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === renderer.domElement;
  hud.setOverlay(!locked);
  if (!locked) { keys.clear(); fireHeld = false; }
});
const play = () => {
  audio.unlock();
  renderer.domElement.requestPointerLock();
};
(document.getElementById('play') as HTMLElement).addEventListener('click', play);
(document.getElementById('watch') as HTMLElement).addEventListener('click', () => { audio.unlock(); setSpectate(true); });
view.addEventListener('click', () => { if (!locked && !spectating) play(); });

function playerInput(): MechInput {
  const f = forward(yaw), r = right(yaw);
  let mx = 0, mz = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) { mx += f.x; mz += f.z; }
  if (keys.has('KeyS') || keys.has('ArrowDown')) { mx -= f.x; mz -= f.z; }
  if (keys.has('KeyD') || keys.has('ArrowRight')) { mx += r.x; mz += r.z; }
  if (keys.has('KeyA') || keys.has('ArrowLeft')) { mx -= r.x; mz -= r.z; }
  const input: MechInput = { move: norm({ x: mx, z: mz }), torsoYaw: yaw, dash: dashPressed, fire: firePressed || fireHeld };
  dashPressed = false;
  firePressed = false;
  return input;
}

// ---- events → feedback ----------------------------------------------------------------------
function bearingWord(vel: Vec2): string {
  const from = { x: -vel.x, z: -vel.z };
  const f = forward(player.torsoYaw), r = right(player.torsoYaw);
  const a = Math.atan2(from.x * r.x + from.z * r.z, from.x * f.x + from.z * f.z);
  const deg = (a * 180) / Math.PI;
  if (Math.abs(deg) < 45) return 'the front';
  if (Math.abs(deg) > 135) return 'behind';
  return deg > 0 ? 'the right' : 'the left';
}

const stats = { fires: [0, 0], bounces: 0, hits: 0, selfHits: 0 };

function handleEvents(): void {
  for (const e of world.events) {
    if (e.kind === 'fire') stats.fires[e.mech]++;
    else if (e.kind === 'bounce') stats.bounces++;
    else if (e.kind === 'hit') { stats.hits++; if (e.shooter === e.victim) stats.selfHits++; }
    switch (e.kind) {
      case 'fire':
        audio.fire(e.pos, e.mech === player.id);
        if (e.mech === player.id) { rig.kick(); playerView.kick(); } else enemyView.kick();
        break;
      case 'bounce':
        audio.bounce(e.pos);
        fx.bounce(e.pos.x, e.pos.z, e.nx, e.nz, e.owner === player.id ? COLORS.you : COLORS.ai);
        break;
      case 'dash':
        audio.dash(e.pos);
        break;
      case 'hit': {
        audio.hit(e.pos);
        fx.hit(e.pos.x, e.pos.z, e.victim === player.id ? COLORS.you : COLORS.ai);
        if (spectating) {
          const own = e.shooter === e.victim;
          const how = own ? 'Its own ricochet came back.' : e.bounces > 0 ? `Bank shot from ${bearingWord(e.vel)}.` : 'Direct hit.';
          const victimBlue = e.victim === player.id;
          hud.say(own ? `${victimBlue ? 'BLUE' : 'RED'} OWN GOAL` : victimBlue ? 'RED SCORES' : 'BLUE SCORES', victimBlue ? 'ai' : 'you', how);
        } else if (e.victim === player.id) {
          if (e.shooter === player.id) hud.say('OWN GOAL', 'ai', 'Your own ricochet came back.');
          else hud.say('HIT', 'ai', e.bounces > 0 ? `Bank shot from ${bearingWord(e.vel)}.` : 'Direct hit. Keep moving.');
        } else if (e.shooter === player.id) {
          hud.say('KILL', 'you', e.bounces > 0 ? 'Bank shot. It never saw it coming.' : 'Cornered. It had nowhere left to go.');
        } else hud.say('IT SHOT ITSELF', 'you', 'Its own ricochet.');
        break;
      }
      case 'round':
        yaw = player.torsoYaw;
        rig.pitch = 0;
        enemyTrail.reset();
        playerTrail.reset();
        break;
      default:
        break;
    }
  }
}

// ---- loop -----------------------------------------------------------------------------------
const STEP = 1 / 120;
let acc = 0;
let last = performance.now();

function simStep(input: MechInput | null): void {
  const blue = spectating ? aiThink(world, player, enemy, blueState, STEP) : input;
  world.step(STEP, [blue, aiThink(world, enemy, player, aiState, STEP)]);
  handleEvents();
}

function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (locked || spectating) {
    acc += dt;
    while (acc >= STEP) { simStep(spectating ? null : playerInput()); acc -= STEP; }
  }
  playerView.update(player, dt);
  enemyView.update(enemy, dt);
  playerView.root.visible = player.alive && (rig.mode === 'third' || spectating);
  shellViews.sync(world.shells);
  fx.update(dt);
  if (spectating) spec.update(player, enemy, dt); else rig.update(player, dt);
  enemyMarker.update(enemy, camera, dt);
  playerMarker.update(player, camera, dt);
  playerMarker.setVisible(spectating);
  enemyTrail.update(enemy, dt);
  playerTrail.update(player, dt);
  if (spectating) audio.setListener({ x: camera.position.x, z: camera.position.z }, spec.yaw());
  else audio.setListener(player.pos, player.torsoYaw);
  audio.syncHums(world.shells, player.id);
  if (!spectating) {
    radar.draw(world, player, enemy);
    const hfov = 2 * Math.atan(Math.tan((camera.fov * Math.PI) / 360) * camera.aspect);
    threat.draw(world, player, enemy, rig.mode === 'first' ? hfov / 2 : Math.PI * 0.4);
  }
  hud.update(player, enemy, aiState.lastSafe, aiState.lastCandidates, dt, spectating ? { safe: blueState.lastSafe, total: blueState.lastCandidates } : undefined);
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
if (new URLSearchParams(location.search).has('spectate')) setSpectate(true);

// ---- headless probe (screenshots, tests in a real browser) ----------------------------------
declare global { interface Window { rma: unknown } }
window.rma = {
  world, player, enemy, aiState, blueState, CFG, rig, spec, hud, stats,
  spectate(on: boolean): void { setSpectate(on); },
  /** Run the sim for `seconds` with a scripted player input, without pointer lock. */
  drive(seconds: number, input: Partial<MechInput> = {}): void {
    const n = Math.round(seconds / STEP);
    for (let i = 0; i < n; i++) {
      const fire = typeof input.fire === 'boolean' ? input.fire && i === 0 : false;
      simStep({ move: input.move ?? { x: 0, z: 0 }, torsoYaw: input.torsoYaw ?? player.torsoYaw, dash: input.dash === true && i === 0, fire });
    }
  },
  probe() {
    return {
      time: world.time, round: world.round, shells: world.shells.length, locked, spectating, mode: spectating ? `spectate:${spec.mode}` : rig.mode,
      player: { pos: player.pos, alive: player.alive, kills: player.kills, deaths: player.deaths },
      enemy: { pos: enemy.pos, alive: enemy.alive, kills: enemy.kills, deaths: enemy.deaths },
      aiSafe: aiState.lastSafe, aiCandidates: aiState.lastCandidates, aiSolution: aiState.solution, stats: { ...stats, fires: [...stats.fires] },
      drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
    };
  },
};
