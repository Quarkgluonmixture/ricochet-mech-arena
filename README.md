# ricochet-mech-arena

First-person mech duel with ricocheting shells. The enemy mech dodges perfectly inside the same movement
limits you have. Direct shots never land. You win with geometry: corner it, bank a shell in from the side,
or make two shells converge so nowhere it can reach is safe. It does the same to you. One hit kills.

This README describes only what is shipped. Design intent lives in `docs/VISION.md`; stages in `docs/ROADMAP.md`.

## Run

```
npm install
npm run dev      # http://localhost:5173
npm test         # node tests: the sim, plus the kill-cam clock (src/ui/slowmo.ts)
npm run build    # tsc + vite → dist/
```

## Controls

| Input | Action |
|---|---|
| Mouse | aim (torso). Pitch is look-only: shells always fly level. |
| Left click | fire (up to 8 shells in flight) |
| W A S D | move relative to where you look. Inertia: the speed cap is shared with the AI. |
| Shift / Space | dash: a short burst in the movement direction, 1.4 s cooldown (bar under the shell pips) |
| V | first ↔ third person |
| R | reset the round |
| Esc | release the mouse |
| T | **watch AI vs AI**: both mechs run the same brain; drag to orbit, wheel to zoom, V for top-down, Esc back |

Open `?spectate` in the URL to start in spectator mode.

Live at <https://quarkgluonmixture.github.io/ricochet-mech-arena/> (GitHub Pages, deploys from `main`). Also
published as a copy of `dist/` inside the owner's site repository, to appear at
<https://quarkspace.top/ricochet-mech-arena> when that site next deploys; the copy does **not** follow this
repository — rebuild and re-copy to update it.

## PvE and EvE

**Play is always the 1v1 duel** (VISION §1): you against one AI, three lives against its one. **Watch and
the menu's attract scene are AI vs AI**, and Settings → AI battle picks that roster: 1v1, 2v2 (default
since 2026-09-14) or 3v3. In a team battle every mech runs the same brain, friendly fire is on and earns nothing, and a
round ends when a whole team is down. What makes it a contest rather than three duels: teammates
**focus** the same enemy (a target a mate is already on scores as 6 m closer) and take **crossfire**
positions (a bearing to the target 90° away from a mate's is rewarded), because two shells from two angles
remove the dodger's safe moves where one shooter never can. The AI never shoots through a teammate (it banks
around them), keeps 3 m from mates, and dodges every shell in the air, its own team's included. A kill feed
at the top left names every kill and how it landed. Spawns: `P`/`B` blue, `E`/`R` red in the arena map.

## Rules (M0)

- One arena (`MAP_A` in `src/sim/arena.ts`), 180°-rotation symmetric, 4 m corridors, **1.5 m walls**:
  they block shells (flying at 1.2 m) but not your 1.9 m eye, so you see the enemy's torso over the maze.
- Shells fly at 16 m/s, bounce **once** off walls, die on the second wall or after 5 s. They hit anyone,
  including the shooter after the first bounce or 0.15 s. **You have three lives per round, the AI has
  one.** A hit on you costs a life (red flash, camera shake, 1.2 s of invulnerability shown as a blue edge
  glow); the last life pulses red under the score. The AI dies in one hit. **The first fatal hit decides
  the round**: survivors are invulnerable until the reset 2 s later (a trade in the same step is a draw).
  The score counts rounds won: your kills, plus rounds the other side handed over with an own goal.
- A shell leaves 1.13 m ahead of the mech, or just short of a wall if one is closer, so it can never be
  born inside a wall. Firing point-blank into a wall is an own goal.
- Mechs have volume: they push off each other (teammates included) and never overlap; the AI's dodge
  search treats every other mech as an obstacle.
- The AI has exactly your movement model (`stepMotion` in `src/sim/mech.ts` is the only one), 2 shells
  in flight, one shot per second at most. Its torso rides on its legs (turning the body swings the aim),
  slews back at 7 rad/s, and cannot aim more than 100° off the body; standing still, the legs turn in place
  towards the aim. Your mouse has no such limits.
- Finding it: an always-on-top diamond over the enemy's head, a bearing marker with distance around the
  crosshair whenever it is outside your view, and a rotating radar (walls, both mechs pinned to the rim
  when out of range, live shells and their predicted paths). Its recent path is drawn on the floor so the
  footwork is visible.
- HUD: score, shell pips, dash bar, threat markers around the crosshair for shells outside your view or
  predicted to reach you, a banner that names how each kill happened, and an "AI safe moves N/17" line so
  you can watch it get cornered.
- **Kill cam.** Every kill (yours, the AI's, a teammate's, an own goal) runs the sim at ¼ speed: 0.06 s in,
  0.7 s held from the hit, 0.4 s easing back out, all in real seconds, so a second kill during the first
  restarts the hold without a frame at full speed. It starts a beat **before** the hit: every sim step
  `predictImpacts` (`src/sim/predict.ts`) sweeps the live shells 0.12 s ahead against each mech's current
  velocity, with the same walls and arming rule as the real hit test, and a shell about to land a fatal hit
  arms the kill cam so you watch it arrive (≈0.5 s of real time at ¼ speed). An AI victim only counts once
  its dodge search has come up empty, so a dodge is not a slow-motion near miss. In the director views
  (Watch, the menu's attract scene, and after you die) the camera whips onto the wreck and the mech that did
  it and pulls in close, then drifts back to the full-field framing; in the cockpit the moment simply
  stretches and you keep control.
  Letterbox bars and a "Kill cam · ¼ speed" caption mark it (not behind the menu). Two clocks: mech
  animation, debris, dust and shell trails follow the slowed world; camera, HUD timers, hit flashes and UI
  sounds stay in real time. World sounds pitch down with the sim and the music sinks under a low-pass.
  The envelope is `KILLCAM` in `src/ui/slowmo.ts`; the camera framing is `focus()` in
  `src/render/spectator.ts`.
- Sound: Kenney CC0 samples (fire, ricochet = dark sci-fi metal thud plus a short heavy clank, both pitched
  down and low-passed, explosion, dash, engine hum per live shell, UI) with a
  synthesised sub-thump under each shot, positioned by bearing and distance, sent through a shared reverb
  and summed into a compressor. Credits in `public/audio/sfx/CREDITS.txt`.
- Music: two Suno tracks by the user. `public/audio/menu.mp3` ("Hangar Silence") loops on the start screen
  from the moment the page opens when the browser allows it, otherwise from the first click or key. Chrome's
  autoplay allowance is per origin and earned by use, so a first visit to a new domain is silent until you
  click; the footer then reads "sound · click anywhere to start" instead of the track name. `public/audio/bgm.mp3` ("Chrome Pulse") is the fight track: it has a cold open, an intro from
  17 s and the fight from 33 s, so Play or Watch starts it at 17 s once and then loops 33 s → end. Offsets
  live in `MUSIC` in `src/main.ts`. Loops crossfade the last 2.5 s of each pass into the next, so any
  exported song loops without a click or a gap. Music ducks while paused. No file, no music, no error.
- Mechs: procedural walkers built from bevelled armour slabs over a dark frame, modelled after a concept
  sheet generated with the Codex image tool (`assets-src/mech-concept.png`): exposed hip and knee joints,
  a piston behind each shin, an angled chest plate, squared pauldrons with a team stripe, a sensor head with
  a visor slit, a right-arm cannon with a muzzle brake and heat vents that flare on firing, a left-arm
  shield, a backpack with two thrusters that light up on a dash. Knees bend and feet stay level in the stride.
- Scene: the arena stands on a wide dark apron inside a ring of lit pylons; cool and warm rim lights;
  breathing wall-edge light frames; drifting dust motes; shells are a hot core in an additive plasma halo;
  a vignette on the HUD layer.
- Art: six generated images (floor, wall side, wall top, mech hull, hangar sky, key art) made with the
  Codex image tool from the prompts in `assets-src/PROMPTS.md`; originals in `assets-src/`, the JPEGs the
  game loads in `public/textures/` (`scripts/convert-assets.sh`). Textures tile at fixed metric sizes
  via per-face UV scaling, so a 4 m wall and a 40 m wall show the same panel size. A bloom pass picks up
  only the HDR emissives: shells, wall-edge light frames, visors, muzzle rings, head markers. Delete
  `public/textures/` and the game still runs on flat colours.

## Start screen and settings

The menu runs over a live attract mode: both mechs on the AI brain, the director camera slowly orbiting,
effects muted. The key art shows as a splash until the sound bank is in. Arrow keys or W/S move the
highlight, Enter selects. The same screen is the pause menu (Esc), with Play becoming Resume. Fonts are
self-hosted Chakra Petch and Rajdhani (OFL, `public/fonts/CREDITS.txt`). Settings persist in `localStorage`:

| Setting | What it changes |
|---|---|
| Language | Chinese (default) or English; every menu, settings and HUD string comes from `src/ui/i18n.ts`. The Chinese copy was rewritten by Gemini 3.8 Flash (via `agy`) in the register of domestic Chinese games. |
| AI battle | Roster for Watch and the attract scene only: 1v1, 2v2, 3v3. Play stays 1v1. |
| Quality | Low: no bloom, no shadows, 1x pixels. Medium (default): 1.25x pixels, 2x MSAA, bloom, 1024 shadows, 4 shell lights. High: full Retina, 4x MSAA, 2048 shadows, 6 shell lights. |
| Effects / Music | Bus volumes. |
| Mouse | Sensitivity multiplier. |
| Show frame time | ms and fps in the corner, so you can pick a quality with numbers. |

## Performance notes

The first visual build stuttered on a Retina display. Three causes, all fixed:

- Rendering at full 2x pixel ratio with a 4x MSAA half-float target plus bloom. Medium caps pixels at 1.25x.
- A point light per shell and per bounce flash. Every change in the number of lights recompiles every lit
  shader, so each shot and each expiry was a hitch. Lights are now fixed pools (shells: 4–6 by quality;
  flashes: 4) that never grow or shrink during play.
- A fresh material per debris cube. Shared now.

## Spectator mode

Both mechs get 4 shells and a 0.5 s cooldown so there is enough in the air to weave around. The director
camera stands off the line between them and pulls back as they separate; the top-down camera shows the
whole maze. The readout at the top right shows how many of each mech's 17 candidate moves are currently
safe — when it hits 0 it is trapped.

## How the AI works

Every 80 ms it predicts each live shell's path over 1.5 s using the same `advanceShell` the world uses,
then simulates 17 candidate moves (16 directions + stand still) with the real motion model, and keeps the
ones that never come within reach of a shell. Safe moves are scored by engagement range, line of sight,
wall contact (it dislikes corners), and smoothness; if none is safe and the dash is ready it re-runs the
candidates with a dash. Offence: a direct shot if the lead point is clear, otherwise a one-bounce solution
via mirror images across every wall face, choosing the one closest to where the torso already points so
it actually gets to fire against a moving target. With a solution and nothing incoming it settles to
shoot; without one for more than 0.8 s it hunts for an angle instead of standing where a zero-width line
of sight exists but no shell-width shot does. It never reads your inputs.

## Verified 2026-09-13 (headless Chromium, scripted player)

- Scripted player with perfect direct aim, strafing, 40 shots in 20 s: **0 hits on the AI**.
- AI first shot at 1.2 s, first kill at 1.6 s (direct hit on a player that does not dodge).
- Standing player at spawn: killed at 9.2 s by a bank shot off the corridor wall.
- Tests: the AI dodges a direct shot on open ground, dies in a 1.6 m corridor it cannot sidestep in,
  never exceeds the speed cap; a bank-shot solution flown with the real shell model arrives after
  exactly one bounce; a shell that arrives after the round is decided cannot hit the survivor; shells
  fired against or 1 m off a wall bounce instead of tunnelling.
- With the body-coupled torso (same duel, 15 s): 5 AI shots, first kill at 13.3 s; before it, 7 shots
  in 20 s and a kill at 1.6 s. The AI is deliberately less of a turret now.
- AI vs AI, 90 s: 106 and 105 shots, 3 rounds, both sides trapped (0 safe moves) at some point.

## Regenerating art

Edit the prompt in `assets-src/PROMPTS.md`, then:

```
codex exec --sandbox workspace-write < assets-src/PROMPTS.md   # ~1 min per image
./scripts/convert-assets.sh                                     # PNG originals → public/textures/*.jpg
```

## Layout

- `src/sim/` — the game: `geom` (planar rays, boxes, circle resolution), `arena`, `shell`, `mech`,
  `world` (the step function and events), `ai`. No rendering imports. Tested on node.
- `src/render/` — three.js scene with bloom post chain, texture loader, procedural mech, shell trails,
  FX, camera rig with a view-model gun, spectator camera.
- `src/ui/` — HUD, radar, threat ring, WebAudio synth.
- `src/main.ts` — input, fixed-step loop (120 Hz), event → feedback, `window.rma` probe for headless runs.
- `tests/` — vitest, sim only.

## Headless probe

`window.rma.drive(seconds, partialInput)` steps the sim without pointer lock; `window.rma.probe()` returns
positions, kills, the AI's safe-move count and solution, draw calls. Used for the screenshots and the duel
numbers above.
