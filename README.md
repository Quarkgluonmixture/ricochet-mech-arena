# ricochet-mech-arena

First-person mech duel with ricocheting shells. The enemy mech dodges perfectly inside the same movement
limits you have. Direct shots never land. You win with geometry: corner it, bank a shell in from the side,
or make two shells converge so nowhere it can reach is safe. It does the same to you. One hit kills.

This README describes only what is shipped. Design intent lives in `docs/VISION.md`; stages in `docs/ROADMAP.md`.

## Run

```
npm install
npm run dev      # http://localhost:5173
npm test         # sim-only tests on node
npm run build    # tsc + vite → dist/
```

## Controls

| Input | Action |
|---|---|
| Mouse | aim (torso). Pitch is look-only: shells always fly level. |
| Left click | fire (up to 4 shells in flight) |
| W A S D | move relative to where you look. Inertia: the speed cap is shared with the AI. |
| Shift / Space | dash: a short burst in the movement direction, 1.4 s cooldown (bar under the shell pips) |
| V | first ↔ third person |
| R | reset the round |
| Esc | release the mouse |

## Rules (M0)

- One arena (`MAP_A` in `src/sim/arena.ts`), 180°-rotation symmetric, 4 m corridors, 3 m walls.
- Shells fly at 16 m/s, bounce **once** off walls, die on the second wall or after 5 s. They hit anyone,
  including the shooter after the first bounce or 0.15 s. One hit kills; the round resets 2 s later.
- The AI has exactly your movement model (`stepMotion` in `src/sim/mech.ts` is the only one), 2 shells
  in flight, and a torso that slews at 6 rad/s.
- HUD: score, shell pips, dash bar, a rotating radar (walls, both mechs, live shells and their predicted
  paths), threat markers around the crosshair for shells outside your view or predicted to reach you,
  a banner that names how each kill happened, and an "AI safe moves N/17" line so you can watch it get
  cornered.
- No external assets: mechs are primitives, sounds are synthesised (fire, bounce, hit, dash, and a
  per-shell hum positioned by bearing and distance).

## How the AI works

Every 80 ms it predicts each live shell's path over 1.5 s using the same `advanceShell` the world uses,
then simulates 17 candidate moves (16 directions + stand still) with the real motion model, and keeps the
ones that never come within reach of a shell. Safe moves are scored by engagement range, line of sight,
wall contact (it dislikes corners), and smoothness; if none is safe and the dash is ready it re-runs the
candidates with a dash. Offence: a direct shot if the lead point is clear, otherwise a one-bounce solution
via mirror images across every wall face, choosing the one closest to where the torso already points so
it actually gets to fire against a moving target. It never reads your inputs.

## Verified 2026-09-13 (headless Chromium, scripted player)

- Scripted player with perfect direct aim, strafing, 40 shots in 20 s: **0 hits on the AI**.
- AI first shot at 1.2 s, first kill at 1.6 s (direct hit on a player that does not dodge).
- Standing player at spawn: killed at 9.2 s by a bank shot off the corridor wall.
- Tests: the AI dodges a direct shot on open ground, dies in a 1.6 m corridor it cannot sidestep in,
  never exceeds the speed cap; a bank-shot solution flown with the real shell model arrives after
  exactly one bounce.

## Layout

- `src/sim/` — the game: `geom` (planar rays, boxes, circle resolution), `arena`, `shell`, `mech`,
  `world` (the step function and events), `ai`. No rendering imports. Tested on node.
- `src/render/` — three.js scene, procedural mech, shell trails, FX, camera rig with a view-model gun.
- `src/ui/` — HUD, radar, threat ring, WebAudio synth.
- `src/main.ts` — input, fixed-step loop (120 Hz), event → feedback, `window.rma` probe for headless runs.
- `tests/` — vitest, sim only.

## Headless probe

`window.rma.drive(seconds, partialInput)` steps the sim without pointer lock; `window.rma.probe()` returns
positions, kills, the AI's safe-move count and solution, draw calls. Used for the screenshots and the duel
numbers above.
