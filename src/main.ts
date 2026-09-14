import { type AiState, aiThink, makeAiState, pickTarget } from './sim/ai.ts';
import { MAP_A, buildArena } from './sim/arena.ts';
import { CFG } from './sim/config.ts';
import { type Vec2, forward, norm, right } from './sim/geom.ts';
import type { Mech, MechInput, Team } from './sim/mech.ts';
import { predictImpacts } from './sim/predict.ts';
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
import { setLang, t } from './ui/i18n.ts';
import { Radar } from './ui/radar.ts';
import { loadSettings, saveSettings } from './ui/settings.ts';
import { SlowMo } from './ui/slowmo.ts';
import { ThreatRing } from './ui/threat.ts';

declare const __BUILD__: string;

// ---- settings, scene ------------------------------------------------------------------------
const settings = loadSettings();
setLang(settings.lang);
const arena = buildArena(MAP_A);
const view = document.getElementById('view') as HTMLElement;
const { renderer, scene, camera, render, setQuality, update: updateScene } = createScene(view, arena, settings.quality);
const fx = new Fx(scene);
const rig = new CameraRig(camera, scene, arena.walls, COLORS.you);
const spec = new SpectatorCamera(camera);
const hud = new Hud();
const radar = new Radar(document.getElementById('radar') as HTMLCanvasElement, arena, { you: '#6fb6ff', ai: '#ff6a5c' });
const threat = new ThreatRing(document.getElementById('threat') as HTMLCanvasElement);
const audio = new Audio();
audio.setVolumes(settings.sfx, settings.music);
hud.setCamMode(rig.mode);
hud.setSplash(TEX.keyart);
hud.setBuild(__BUILD__);
hud.setMusicStatus(t('music.none'));
hud.menuHoverSync();
const teamColor = (team: Team) => (team === 'blue' ? COLORS.you : COLORS.ai);

// ---- roster: N mechs per team, rebuilt when the match size changes ----------------------------
interface Slot { mech: Mech; view: MechView; state: AiState; marker: HeadMarker; trail: GroundTrail }
let world = new World(arena);
let slots: Slot[] = [];
let player: Mech = world.addMech('you', true, arena.spawns.player, arena.spawnYaw.player, 'blue');
let shellViews = new ShellViews(scene, () => COLORS.you, QUALITY[settings.quality].shellLights);
/** Kill cam: the sim runs at quarter speed for a beat after every kill (TODO 观赏性 2). In director modes the
 *  camera swings onto the victim and the shooter; in the cockpit you just get the moment stretched. Mech ids,
 *  not mech objects: the roster can be rebuilt underneath it (GOTCHAS #16). */
const slowmo = new SlowMo();
let killcam: { victim: number; shooter: number } | null = null;
/** Start the kill cam this many SIM seconds before a predicted fatal hit (≈ 4× that in real time at the
 *  floor), so the shell is seen arriving. The hit itself then restarts the hold. */
const KILLCAM_LEAD = 0.12;
/** Shell id the kill cam was pre-armed on, so one approaching shell triggers once. */
let armedShell = -1;

function buildRoster(n: number): void {
  for (const s of slots) { s.view.dispose(); s.marker.dispose(); s.trail.dispose(); }
  slots = [];
  world = new World(arena);
  for (let i = 0; i < n; i++) world.addMech(i === 0 ? 'you' : `blue${i + 1}`, i === 0, arena.spawns.blue[i], arena.spawnYaw.blue[i], 'blue');
  for (let i = 0; i < n; i++) world.addMech(`red${i + 1}`, false, arena.spawns.red[i], arena.spawnYaw.red[i], 'red');
  for (const m of world.mechs) {
    slots.push({ mech: m, view: new MechView(scene, teamColor(m.team)), state: makeAiState(m.torsoYaw), marker: new HeadMarker(scene, teamColor(m.team)), trail: new GroundTrail(scene, teamColor(m.team)) });
  }
  player = world.mechs[0];
  yaw = player.torsoYaw;
  shellViews.sync([]);
  shellViews = new ShellViews(scene, (owner) => teamColor(world.mechs[owner]?.team ?? 'red'), QUALITY[settings.quality].shellLights);
  hud.clearFeed();
  killcam = null; armedShell = -1; slowmo.reset(); spec.focus(null);
  applyLives();
}

/** Index within its team, for names like BLUE 2 / RED 3. */
const teamIndex = (m: Mech) => world.mechs.filter((o) => o.team === m.team && o.id < m.id).length + 1;
const nameOf = (m: Mech) => (m.isPlayer && !aiVsAi() ? t('name.you') : t(m.team === 'blue' ? 'name.blue' : 'name.red', { n: teamIndex(m) }));

// ---- modes ----------------------------------------------------------------------------------
const MUSIC = {
  menu: { url: 'audio/menu.mp3', start: 0, loopStart: 0 },
  game: { url: 'audio/bgm.mp3', start: 17, loopStart: 33 },
};
let locked = false;
let spectating = false;
/** The browser refused to start audio without a gesture (a site it has not seen you use before). */
let autoplayBlocked = false;
/** Attract mode: AI vs AI behind the menu, HUD hidden, effects muted. On until the first Play/Watch. */
let attract = false;
let gameStarted = false;
let dragging = false;
let yaw = 0;
let firePressed = false;
let fireHeld = false;
let dashPressed = false;
let roundAnnounced = false;
const keys = new Set<string>();
const SENS = 0.0022; // × settings.sensitivity
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

/** Both teams on the AI brain (spectator and attract). */
const aiVsAi = () => spectating || attract;

function applyDuck(): void {
  const paused = hud.overlayVisible;
  audio.setDuck(attract ? 0.1 : paused ? 0 : 1, paused && !attract ? 0.35 : 1);
}

/** The human takes CFG.player.lives; every AI-driven mech, the human's included, fights on one. */
function applyLives(): void {
  player.hpMax = aiVsAi() ? 1 : CFG.player.lives;
  if (!player.alive) return;
  player.hp = aiVsAi() ? 1 : world.roundOver ? Math.min(player.hp, player.hpMax) : player.hpMax;
}

function applyRosterLimits(): void {
  for (const m of world.mechs) {
    const human = m.isPlayer && !aiVsAi();
    m.maxShells = human ? CFG.player.maxShells : aiVsAi() ? CFG.spectate.maxShells : CFG.ai.maxShells;
    m.fireCooldown = human ? CFG.player.fireCooldown : aiVsAi() ? CFG.spectate.fireCooldown : CFG.ai.fireCooldown;
  }
}

function setAttract(on: boolean): void {
  if (attract === on) return;
  attract = on;
  if (on) ensureRoster('eve');
  hud.setAttract(on);
  spec.autoOrbit = on ? 0.05 : 0;
  rig.setViewmodelVisible(!on);
  if (on) { spec.reset(); for (const s of slots) s.state.round = -1; }
  applyRosterLimits();
  applyLives();
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
    gameStarted = false; // watching ends the human duel; Play starts a fresh one
    ensureRoster('eve');
    spec.reset();
    for (const s of slots) s.state.round = -1;
    rig.setViewmodelVisible(false);
  } else {
    yaw = player.torsoYaw;
    rig.pitch = 0;
    hud.setOverlay(!locked, gameStarted);
    if (!gameStarted) setAttract(true);
  }
  applyRosterLimits();
  applyLives();
  applyDuck();
}

/** PvE is always the duel; the match-size setting is for AI-vs-AI (attract, spectate) only. */
function rosterFor(mode: 'pve' | 'eve'): number { return mode === 'pve' ? 1 : settings.matchSize; }
function ensureRoster(mode: 'pve' | 'eve'): void {
  const want = rosterFor(mode) * 2;
  if (world.mechs.length !== want) buildRoster(rosterFor(mode));
}
buildRoster(rosterFor('eve'));

// ---- start screen: preload, settings, music -------------------------------------------------
void audio.preload();
const splashTimer = window.setTimeout(() => hud.hideSplash(), 6000);
const loadingTick = setInterval(() => {
  hud.setLoading(audio.loaded, audio.total);
  if (audio.ready) { clearInterval(loadingTick); window.clearTimeout(splashTimer); window.setTimeout(() => hud.hideSplash(), 400); }
}, 100);

function refreshMenuText(): void {
  hud.relabel();
  hud.setOverlay(hud.overlayVisible, gameStarted);
  hud.setMusicStatus(musicStatusText());
  const hint = document.querySelector('#watch .hint');
  if (hint) hint.textContent = t(settings.matchSize > 1 ? 'menu.watch.hint.team' : 'menu.watch.hint');
}

const setLangSel = $<HTMLSelectElement>('set-lang');
setLangSel.value = settings.lang;
setLangSel.addEventListener('change', () => {
  settings.lang = setLangSel.value as typeof settings.lang;
  setLang(settings.lang);
  refreshMenuText();
  audio.ui('switch');
  saveSettings(settings);
});
const setMatch = $<HTMLSelectElement>('set-match');
setMatch.value = String(settings.matchSize);
setMatch.addEventListener('change', () => {
  settings.matchSize = Number(setMatch.value) as 1 | 2 | 3;
  saveSettings(settings);
  audio.ui('switch');
  // the EvE roster changed: rebuild the AI-vs-AI scene behind the menu (PvE stays the duel)
  if (spectating) setSpectate(false);
  gameStarted = false;
  buildRoster(rosterFor('eve'));
  for (const s of slots) s.state.round = -1;
  if (!attract) setAttract(true);
  refreshMenuText();
});
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
refreshMenuText();

let musicPhase: 'none' | 'menu' | 'game' = 'none';
function musicStatusText(): string {
  const cur = audio.currentTrack;
  if (cur) return t('music.track', { name: cur.split('/').pop() ?? '' });
  return autoplayBlocked ? t('music.blocked') : t('music.none');
}
async function music(phase: 'menu' | 'game'): Promise<void> {
  if (musicPhase === phase) return;
  musicPhase = phase;
  const track = phase === 'game' ? MUSIC.game : MUSIC.menu;
  // the menu track eases in over 4 s: it is the first thing you hear when the page opens
  await audio.playTrack(track.url, phase === 'menu' ? 4 : 2, { start: track.start, loopStart: track.loopStart });
  hud.setMusicStatus(musicStatusText());
}
// Menu music should be playing the moment the site opens. Browsers only allow that for sites you have
// used before (Chrome's media engagement is per origin: a first visit to a new domain is always silent);
// try, and if the context stays suspended say so in the footer and fall back to the first click or key.
const firstGesture = () => { autoplayBlocked = false; audio.unlock(); if (musicPhase === 'none') void music('menu'); };
void audio.tryAutostart().then((ok) => {
  if (ok) { if (musicPhase === 'none') void music('menu'); return; }
  autoplayBlocked = true;
  hud.setMusicStatus(musicStatusText());
  document.addEventListener('pointerdown', firstGesture, { once: true });
  document.addEventListener('keydown', firstGesture, { once: true });
});

// ---- input ----------------------------------------------------------------------------------
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space') e.preventDefault();
  if (e.repeat) return;
  keys.add(e.code);
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
    if (e.code === 'KeyR') resetRoundNow();
    return;
  }
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'Space') dashPressed = true;
  if (e.code === 'KeyV') hud.setCamMode(rig.toggle());
  if (e.code === 'KeyR') resetRoundNow();
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
  if (!gameStarted) { ensureRoster('pve'); resetMatchNow(); gameStarted = true; hud.clearFeed(); applyRosterLimits(); applyLives(); }
  renderer.domElement.requestPointerLock();
};
$('play').addEventListener('click', play);
$('watch').addEventListener('click', () => { audio.unlock(); audio.ui('confirm'); void music('game'); if (!gameStarted) resetMatchNow(); setSpectate(true); });
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
  if (Math.abs(deg) < 45) return t('dir.front');
  if (Math.abs(deg) > 135) return t('dir.behind');
  return t(deg > 0 ? 'dir.right' : 'dir.left');
}

const stats = { fires: [0, 0], bounces: 0, hits: 0, selfHits: 0 };

function handleEvents(): void {
  for (const e of world.events) {
    if (e.kind === 'fire') stats.fires[world.mechs[e.mech]?.team === 'blue' ? 0 : 1]++;
    else if (e.kind === 'bounce') stats.bounces++;
    else if (e.kind === 'hit') { stats.hits++; if (e.shooter === e.victim) stats.selfHits++; }
    switch (e.kind) {
      case 'fire': {
        const m = world.mechs[e.mech];
        audio.fire(e.pos, m.id === player.id && !aiVsAi());
        if (m.id === player.id && !aiVsAi()) rig.kick();
        slots[m.id]?.view.kick();
        break;
      }
      case 'bounce':
        audio.bounce(e.pos);
        fx.bounce(e.pos.x, e.pos.z, e.nx, e.nz, teamColor(world.mechs[e.owner]?.team ?? 'red'));
        break;
      case 'dash':
        audio.dash(e.pos);
        break;
      case 'hit': {
        const victim = world.mechs[e.victim];
        const shooter = world.mechs[e.shooter];
        const isMe = victim.id === player.id && !aiVsAi();
        if (!e.fatal) {
          fx.bounce(e.pos.x, e.pos.z, -e.vel.x, -e.vel.z, teamColor(victim.team));
          if (isMe) {
            hud.flashDamage();
            rig.hurt();
            audio.damage(e.hpLeft === 1);
            hud.setLives(player.hp, player.hpMax);
            const how = e.bounces > 0 ? t('h.bankFrom', { dir: bearingWord(e.vel) }) : t('h.direct');
            hud.say('', 'ai', e.hpLeft === 1 ? t('h.lastLife', { how }) : t('h.livesLeft', { n: e.hpLeft, how }), 1.6);
          }
          break;
        }
        audio.hit(e.pos);
        fx.hit(e.pos.x, e.pos.z, teamColor(victim.team));
        slowmo.trigger(); // restarts the hold from the hit, whether or not the run-up already started it
        killcam = { victim: victim.id, shooter: shooter.id };
        armedShell = -1;
        if (attract) break;
        const own = shooter.id === victim.id;
        const friendly = !own && shooter.team === victim.team;
        const howKey = own ? 'feed.own' : friendly ? 'feed.friendly' : e.bounces > 0 ? 'feed.bank' : 'feed.direct';
        hud.feed(`<span class="${victim.team}">${nameOf(victim)}</span> <span class="dim">←</span> <span class="${shooter.team}">${nameOf(shooter)}</span> <span class="dim">· ${t(howKey)}</span>`);
        const decided = world.roundOver && !roundAnnounced;
        if (decided) roundAnnounced = true;
        const winner: Team | null = decided ? (world.alive('blue').length > 0 ? 'blue' : world.alive('red').length > 0 ? 'red' : null) : null;
        const howLong = own ? (isMe ? t('h.ownRicochet') : t('h.itsOwnRicochet')) : e.bounces > 0 ? t('h.bankFrom', { dir: bearingWord(e.vel) }) : isMe ? t('h.directKeepMoving') : t('h.direct');
        if (aiVsAi()) {
          if (winner) hud.say(t(winner === 'blue' ? 'b.blueRound' : 'b.redRound'), winner === 'blue' ? 'you' : 'ai', howLong);
          break;
        }
        if (isMe) hud.say(t(own ? 'b.ownGoal' : 'b.hit'), 'ai', howLong, decided ? 3 : 2.2);
        else if (shooter.id === player.id && victim.team !== player.team) hud.say(t('b.kill'), 'you', e.bounces > 0 ? t('h.bankNeverSaw') : t('h.cornered'));
        else if (winner) hud.say(t(winner === player.team ? 'b.roundWon' : 'b.roundLost'), winner === player.team ? 'you' : 'ai', t(winner === player.team ? 'h.teamWiped' : 'h.yourTeamWiped'));
        break;
      }
      case 'round':
        onRound();
        break;
      default:
        break;
    }
  }
}

/** A new round started: re-sync the camera yaw, drop trails and any kill cam still running. Called from the
 *  'round' event (the automatic reset inside World.step) AND directly after a manual reset — World.step clears
 *  the event list at the start of the next step, so an event pushed by a direct resetRound()/resetMatch() call
 *  never reaches handleEvents. Before this helper R mid kill cam left the camera glued to the respawned mech. */
function onRound(): void {
  roundAnnounced = false;
  yaw = player.torsoYaw;
  rig.pitch = 0;
  killcam = null; armedShell = -1; slowmo.reset();
  for (const s of slots) s.trail.reset();
  if (!attract) audio.round();
}
function resetRoundNow(): void { world.resetRound(); onRound(); }
function resetMatchNow(): void { world.resetMatch(); onRound(); }

// ---- loop -----------------------------------------------------------------------------------
const STEP = 1 / 120;
let acc = 0;
let last = performance.now();
let frameMs = 16;
let fpsTimer = 0;

function simStep(input: MechInput | null): void {
  const inputs = world.mechs.map((m) => {
    if (m.isPlayer && !aiVsAi()) return input;
    const mateTargets = world.matesOf(m).map((o) => slots[o.id].state.targetId).filter((id) => id >= 0);
    const target = pickTarget(world, m, mateTargets) ?? world.mechs.find((o) => o.team !== m.team) ?? m;
    return aiThink(world, m, target, slots[m.id].state, STEP);
  });
  world.step(STEP, inputs);
  handleEvents();
  anticipateKill();
}

/** Start the kill cam a beat before a fatal hit lands. A human on the last life is taken at face value
 *  (nobody sidesteps in 0.12 s); an AI only counts once its dodge search has come up empty, because an AI
 *  with a safe move left will usually take it and a slow-motion near miss every few seconds gets old. */
function anticipateKill(): void {
  if (slowmo.active && armedShell >= 0) return;
  for (const im of predictImpacts(world, KILLCAM_LEAD)) {
    if (!im.fatal) continue;
    const victim = world.mechs[im.victim];
    const human = victim.isPlayer && !aiVsAi();
    if (!human && slots[victim.id].state.lastSafe > 0) continue;
    armedShell = im.shell;
    slowmo.trigger();
    killcam = { victim: victim.id, shooter: im.owner };
    return;
  }
}

function nearestEnemy(): Mech | null {
  let best: Mech | null = null, bd = Infinity;
  for (const m of world.enemiesOf(player)) { const d = Math.hypot(m.pos.x - player.pos.x, m.pos.z - player.pos.z); if (d < bd) { bd = d; best = m; } }
  return best;
}

function readout(): string {
  const fmt = (team: Team) => {
    const ais = world.mechs.filter((m) => m.team === team && m.alive && !(m.isPlayer && !aiVsAi()));
    if (ais.length === 0) return t('hud.safeDash');
    let min = Infinity, total = 0;
    for (const m of ais) { const s = slots[m.id].state; if (s.lastCandidates > 0) { min = Math.min(min, s.lastSafe); total = s.lastCandidates; } }
    if (total === 0) return t('hud.safeDash');
    return `${min}/${total}${min === 0 ? t('hud.safeTrapped') : ''}`;
  };
  if (aiVsAi()) return world.mechs.length > 2 ? t('hud.teamSafe', { b: fmt('blue'), r: fmt('red') }) : t('hud.safeBoth', { b: fmt('blue'), r: fmt('red') });
  const e = world.mechs.find((m) => m.team !== player.team);
  const s = e ? slots[e.id].state : null;
  return e && e.alive && s && s.lastCandidates > 0 ? t('hud.aiSafe', { n: s.lastSafe, total: s.lastCandidates }) + (s.lastSafe === 0 ? t('hud.trapped') : '') : '';
}

function frame(now: number): void {
  const raw = now - last;
  const dt = Math.min(0.1, raw / 1000);
  last = now;
  frameMs += (raw - frameMs) * 0.08;
  fpsTimer += dt;
  if (settings.showFps && fpsTimer > 0.4) { fpsTimer = 0; hud.setFps(frameMs); }
  // kill cam: `sdt` is world time (sim, animation, debris, dust), `dt` stays screen time (camera, HUD)
  const scale = slowmo.step(dt);
  const sdt = dt * scale;
  if (locked || spectating || attract) {
    acc += sdt;
    while (acc >= STEP) { simStep(aiVsAi() ? null : playerInput()); acc -= STEP; }
  }
  const humanFpv = !aiVsAi() && player.alive && rig.mode === 'first';
  for (const s of slots) {
    s.view.update(s.mech, sdt);
    if (s.mech.id === player.id) s.view.root.visible = player.alive && !humanFpv;
    s.marker.update(s.mech, camera, dt);
    s.marker.setVisible(!attract && s.mech.id !== player.id && (s.mech.team !== player.team || spectating));
    s.trail.update(s.mech, sdt);
  }
  shellViews.sync(world.shells);
  fx.update(dt, sdt);
  updateScene(sdt);
  // dead humans watch the rest of the round through the director camera
  const directorCam = aiVsAi() || !player.alive;
  rig.setViewmodelVisible(!directorCam && rig.mode === 'first');
  const kc = slowmo.active && killcam ? killcam : null;
  spec.focus(kc ? [world.mechs[kc.victim], ...(kc.shooter !== kc.victim ? [world.mechs[kc.shooter]] : [])].filter((m) => m !== undefined) : null);
  hud.setKillcam(slowmo.depth, !attract);
  audio.setTimeScale(scale);
  if (directorCam) spec.update(world.mechs, dt); else rig.update(player, dt);
  if (directorCam) audio.setListener({ x: camera.position.x, z: camera.position.z }, spec.yaw());
  else audio.setListener(player.pos, player.torsoYaw);
  audio.syncHums(world.shells, player.id);
  hud.setShield(!aiVsAi() && player.alive && player.invulnT > 0);
  if (!aiVsAi()) {
    hud.setLives(player.hp, player.hpMax);
    radar.draw(world, player);
    const hfov = 2 * Math.atan(Math.tan((camera.fov * Math.PI) / 360) * camera.aspect);
    threat.draw(world, player, nearestEnemy(), rig.mode === 'first' ? hfov / 2 : Math.PI * 0.4);
  }
  hud.update(player, world.score, readout(), dt);
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
setAttract(true);
if (new URLSearchParams(location.search).has('spectate')) setSpectate(true);

// ---- headless probe (screenshots, tests in a real browser) ----------------------------------
declare global { interface Window { rma: unknown } }
window.rma = {
  get world() { return world; }, get player() { return player; }, get enemy() { return world.mechs.find((m) => m.team !== player.team)!; },
  get mechs() { return world.mechs; }, get slots() { return slots; },
  get aiState() { return slots[world.mechs.find((m) => m.team !== player.team)!.id].state; }, get blueState() { return slots[player.id].state; },
  CFG, rig, spec, hud, stats, audio, MUSIC, settings, slowmo,
  spectate(on: boolean): void { setSpectate(on); },
  attract(on: boolean): void { setAttract(on); },
  roster(n: 1 | 2 | 3): void { settings.matchSize = n; buildRoster(n); },
  /** Run the sim for `seconds` with a scripted player input, without pointer lock. */
  drive(seconds: number, input: Partial<MechInput> = {}): void {
    const n = Math.round(seconds / STEP);
    for (let i = 0; i < n; i++) {
      const fire = typeof input.fire === 'boolean' ? input.fire && i === 0 : false;
      simStep({ move: input.move ?? { x: 0, z: 0 }, torsoYaw: input.torsoYaw ?? player.torsoYaw, dash: input.dash === true && i === 0, fire });
    }
  },
  probe() {
    const enemy = world.mechs.find((m) => m.team !== player.team)!;
    return {
      time: world.time, round: world.round, shells: world.shells.length, locked, spectating, attract, gameStarted, roster: world.mechs.length, score: { ...world.score },
      mode: spectating ? `spectate:${spec.mode}` : attract ? 'attract' : rig.mode,
      player: { pos: player.pos, alive: player.alive, kills: player.kills, deaths: player.deaths, hp: player.hp },
      enemy: { pos: enemy.pos, alive: enemy.alive, kills: enemy.kills, deaths: enemy.deaths },
      alive: { blue: world.alive('blue').length, red: world.alive('red').length },
      aiSafe: slots[enemy.id].state.lastSafe, aiCandidates: slots[enemy.id].state.lastCandidates, aiSolution: slots[enemy.id].state.solution, stats: { ...stats, fires: [...stats.fires] },
      drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles, music: audio.currentTrack,
      timeScale: slowmo.scale, killcam: killcam ? { ...killcam, focusing: spec.focusing, armedShell } : null, camera: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
      autoplayBlocked, matchSize: settings.matchSize,
    };
  },
};
