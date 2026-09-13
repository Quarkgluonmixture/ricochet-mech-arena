import { type AiState, aiThink, makeAiState } from './sim/ai.ts';
import { MAP_A, buildArena } from './sim/arena.ts';
import { CFG } from './sim/config.ts';
import { type Vec2, forward, norm, right } from './sim/geom.ts';
import type { MechInput } from './sim/mech.ts';
import { World } from './sim/world.ts';
import { TEX } from './render/assets.ts';
import { CameraRig } from './render/camera.ts';
import { Fx } from './render/fx.ts';
import { HeadMarker } from './render/marker.ts';
import { MechView } from './render/mech.ts';
import { QUALITY } from './render/quality.ts';
import { COLORS, createScene } from './render/scene.ts';
import { ShellViews } from './render/shells.ts';
import { SpectatorCamera } from './render/spectator.ts';
import { GroundTrail } from './render/trail.ts';
import { Audio } from './ui/audio.ts';
import { Hud } from './ui/hud.ts';
import { Radar } from './ui/radar.ts';
import { loadSettings, saveSettings } from './ui/settings.ts';
import { ThreatRing } from './ui/threat.ts';

declare const __BUILD__: string;

// ---- world ----------------------------------------------------------------------------------
const arena = buildArena(MAP_A);
const world = new World(arena);
const player = world.addMech('you', true, arena.spawns.player, arena.spawnYaw.player);
const enemy = world.addMech('AI', false, arena.spawns.enemy, arena.spawnYaw.enemy);
const aiState: AiState = makeAiState(enemy.torsoYaw);
/** Brain for the blue mech while spectating or in attract mode (AI vs AI). Same code as red. */
const blueState: AiState = makeAiState(player.torsoYaw);

// ---- render + ui ----------------------------------------------------------------------------
const settings = loadSettings();
const view = document.getElementById('view') as HTMLElement;
const { renderer, scene, camera, render, setQuality, update: updateScene } = createScene(view, arena, settings.quality);
const playerView = new MechView(scene, COLORS.you);
const enemyView = new MechView(scene, COLORS.ai);
const shellViews = new ShellViews(scene, (owner) => (owner === player.id ? COLORS.you : COLORS.ai), QUALITY[settings.quality].shellLights);
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
audio.setVolumes(settings.sfx, settings.music);
hud.setCamMode(rig.mode);
hud.setSplash(TEX.keyart);
hud.setBuild(`build ${__BUILD__}`);
hud.menuHoverSync();

// ---- modes ----------------------------------------------------------------------------------
/** Tracks the user made in Suno. The fight track has a cold open, then an intro from 17 s and the fight
 *  from 33 s: play the intro once, loop the fight. */
const MUSIC = {
  menu: { url: 'audio/menu.mp3', start: 0, loopStart: 0 },
  game: { url: 'audio/bgm.mp3', start: 17, loopStart: 33 },
};
let locked = false;
let spectating = false;
/** Attract mode: AI vs AI behind the menu, HUD hidden, effects muted. On until the first Play/Watch. */
let attract = false;
let gameStarted = false;
let dragging = false;
let yaw = player.torsoYaw;
let firePressed = false;
let fireHeld = false;
let dashPressed = false;
const keys = new Set<string>();
const SENS = 0.0022; // × settings.sensitivity
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

function applyDuck(): void {
  const paused = hud.overlayVisible;
  audio.setDuck(attract ? 0.1 : paused ? 0 : 1, paused && !attract ? 0.35 : 1);
}

function setAttract(on: boolean): void {
  if (attract === on) return;
  attract = on;
  hud.setAttract(on);
  spec.autoOrbit = on ? 0.05 : 0;
  rig.setViewmodelVisible(!on); // the cockpit gun is parented to the camera; the director cam must not carry it
  if (on) { spec.reset(); blueState.round = -1; aiState.round = -1; }
  applyDuck();
}

function setSpectate(on: boolean): void {
  if (spectating === on) return;
  spectating = on;
  hud.setSpectate(on);
  if (on) {
    setAttract(false);
    if (document.pointerLockElement) document.exitPointerLock();
    hud.setOverlay(false);
    spec.reset();
    blueState.round = -1;
    for (const m of world.mechs) { m.maxShells = CFG.spectate.maxShells; m.fireCooldown = CFG.spectate.fireCooldown; }
    rig.setViewmodelVisible(false);
  } else {
    player.maxShells = CFG.player.maxShells; player.fireCooldown = CFG.player.fireCooldown;
    enemy.maxShells = CFG.ai.maxShells; enemy.fireCooldown = CFG.ai.fireCooldown;
    yaw = player.torsoYaw;
    rig.pitch = 0;
    hud.setOverlay(!locked, gameStarted);
    if (!gameStarted) setAttract(true);
  }
  applyDuck();
}

/** Both mechs on the AI brain (spectator and attract). */
const aiVsAi = () => spectating || attract;

// ---- start screen: preload, settings, music -------------------------------------------------
void audio.preload();
const splashTimer = window.setTimeout(() => hud.hideSplash(), 6000);
const loadingTick = setInterval(() => {
  hud.setLoading(audio.loaded, audio.total);
  if (audio.ready) { clearInterval(loadingTick); window.clearTimeout(splashTimer); window.setTimeout(() => hud.hideSplash(), 400); }
}, 100);

const setQ = $<HTMLSelectElement>('set-quality');
const setSfx = $<HTMLInputElement>('set-sfx');
const setMusic = $<HTMLInputElement>('set-music');
const setSens = $<HTMLInputElement>('set-sens');
const setFps = $<HTMLInputElement>('set-fps');
setQ.value = settings.quality; setSfx.value = String(settings.sfx); setMusic.value = String(settings.music);
setSens.value = String(settings.sensitivity); setFps.checked = settings.showFps;
const applySettings = () => {
  saveSettings(settings);
  audio.setVolumes(settings.sfx, settings.music);
  hud.setFps(settings.showFps ? 0 : null);
};
setQ.addEventListener('change', () => {
  settings.quality = setQ.value as typeof settings.quality;
  setQuality(settings.quality);
  shellViews.setLightCount(QUALITY[settings.quality].shellLights);
  audio.ui('switch');
  applySettings();
});
setSfx.addEventListener('input', () => { settings.sfx = Number(setSfx.value); applySettings(); });
setSfx.addEventListener('change', () => audio.ui('click'));
setMusic.addEventListener('input', () => { settings.music = Number(setMusic.value); applySettings(); });
setSens.addEventListener('input', () => { settings.sensitivity = Number(setSens.value); applySettings(); });
setFps.addEventListener('change', () => { settings.showFps = setFps.checked; audio.ui('switch'); applySettings(); });
$('settings-btn').addEventListener('click', () => { audio.unlock(); audio.ui('click'); hud.showSettings(true); });
$('settings-close').addEventListener('click', () => { audio.ui('back'); hud.showSettings(false); });
applySettings();

let musicPhase: 'none' | 'menu' | 'game' = 'none';
async function music(phase: 'menu' | 'game'): Promise<void> {
  if (musicPhase === phase) return;
  musicPhase = phase;
  const t = phase === 'game' ? MUSIC.game : MUSIC.menu;
  const ok = await audio.playTrack(t.url, 2, { start: t.start, loopStart: t.loopStart });
  if (!ok && phase === 'game') { /* no game track: keep whatever is playing (menu track or silence) */ }
  const cur = audio.currentTrack;
  hud.setMusicStatus(cur ? `music · ${cur.split('/').pop()}` : 'music · none');
}
// the first gesture anywhere unlocks audio and starts the menu track (browsers block earlier starts)
const firstGesture = () => { audio.unlock(); if (musicPhase === 'none') void music('menu'); };
document.addEventListener('pointerdown', firstGesture, { once: true });
document.addEventListener('keydown', firstGesture, { once: true });

// ---- input ----------------------------------------------------------------------------------
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space') e.preventDefault();
  if (e.repeat) return;
  keys.add(e.code);
  // menu keyboard navigation
  if (hud.overlayVisible && !locked && !spectating) {
    if (e.code === 'ArrowDown' || e.code === 'KeyS') { hud.menuMove(1); audio.ui('click'); return; }
    if (e.code === 'ArrowUp' || e.code === 'KeyW') { hud.menuMove(-1); audio.ui('click'); return; }
    if (e.code === 'Enter') { hud.menuActivate(); return; }
    if (e.code === 'Escape') { hud.showSettings(false); return; }
  }
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
  yaw -= e.movementX * SENS * settings.sensitivity;
  rig.pitch = clamp(rig.pitch - e.movementY * SENS * settings.sensitivity, -1.2, 1.2);
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
  hud.setOverlay(!locked, gameStarted);
  if (!locked) { keys.clear(); fireHeld = false; hud.showSettings(false); }
  applyDuck();
});

const play = () => {
  audio.unlock();
  audio.ui('confirm');
  void music('game');
  setAttract(false);
  if (!gameStarted) { world.resetMatch(); yaw = player.torsoYaw; rig.pitch = 0; gameStarted = true; }
  renderer.domElement.requestPointerLock();
};
$('play').addEventListener('click', play);
$('watch').addEventListener('click', () => { audio.unlock(); audio.ui('confirm'); void music('game'); if (!gameStarted) world.resetMatch(); setSpectate(true); });
view.addEventListener('click', () => { if (!locked && !spectating && !hud.overlayVisible) play(); });

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
        if (attract) break;
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
        if (!attract) audio.round();
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
let frameMs = 16;
let fpsTimer = 0;

function simStep(input: MechInput | null): void {
  const blue = aiVsAi() ? aiThink(world, player, enemy, blueState, STEP) : input;
  world.step(STEP, [blue, aiThink(world, enemy, player, aiState, STEP)]);
  handleEvents();
}

function frame(now: number): void {
  const raw = now - last;
  const dt = Math.min(0.1, raw / 1000);
  last = now;
  frameMs += (raw - frameMs) * 0.08;
  fpsTimer += dt;
  if (settings.showFps && fpsTimer > 0.4) { fpsTimer = 0; hud.setFps(frameMs); }
  if (locked || spectating || attract) {
    acc += dt;
    while (acc >= STEP) { simStep(aiVsAi() ? null : playerInput()); acc -= STEP; }
  }
  playerView.update(player, dt);
  enemyView.update(enemy, dt);
  playerView.root.visible = player.alive && (rig.mode === 'third' || aiVsAi());
  shellViews.sync(world.shells);
  fx.update(dt);
  updateScene(dt);
  if (aiVsAi()) spec.update(player, enemy, dt); else rig.update(player, dt);
  enemyMarker.update(enemy, camera, dt);
  playerMarker.update(player, camera, dt);
  playerMarker.setVisible(spectating);
  enemyMarker.setVisible(!attract);
  enemyTrail.update(enemy, dt);
  playerTrail.update(player, dt);
  if (aiVsAi()) audio.setListener({ x: camera.position.x, z: camera.position.z }, spec.yaw());
  else audio.setListener(player.pos, player.torsoYaw);
  audio.syncHums(world.shells, player.id);
  if (!aiVsAi()) {
    radar.draw(world, player, enemy);
    const hfov = 2 * Math.atan(Math.tan((camera.fov * Math.PI) / 360) * camera.aspect);
    threat.draw(world, player, enemy, rig.mode === 'first' ? hfov / 2 : Math.PI * 0.4);
  }
  hud.update(player, enemy, aiState.lastSafe, aiState.lastCandidates, dt, spectating ? { safe: blueState.lastSafe, total: blueState.lastCandidates } : undefined);
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
setAttract(true);
if (new URLSearchParams(location.search).has('spectate')) setSpectate(true);

// ---- headless probe (screenshots, tests in a real browser) ----------------------------------
declare global { interface Window { rma: unknown } }
window.rma = {
  world, player, enemy, aiState, blueState, CFG, rig, spec, hud, stats, audio, MUSIC,
  spectate(on: boolean): void { setSpectate(on); },
  attract(on: boolean): void { setAttract(on); },
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
      time: world.time, round: world.round, shells: world.shells.length, locked, spectating, attract, gameStarted,
      mode: spectating ? `spectate:${spec.mode}` : attract ? 'attract' : rig.mode,
      player: { pos: player.pos, alive: player.alive, kills: player.kills, deaths: player.deaths },
      enemy: { pos: enemy.pos, alive: enemy.alive, kills: enemy.kills, deaths: enemy.deaths },
      aiSafe: aiState.lastSafe, aiCandidates: aiState.lastCandidates, aiSolution: aiState.solution, stats: { ...stats, fires: [...stats.fires] },
      drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles, music: audio.currentTrack,
    };
  },
};
