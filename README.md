# ricochet-mech-arena

First-person mech duel with ricocheting shells. The enemy mech dodges perfectly inside the same movement
limits you have. Direct shots never land. You win with geometry: corner it, bank a shell in from the side,
or make two shells converge so nowhere it can reach is safe. It does the same to you. One hit kills.

This README describes only what is shipped. Design intent lives in `docs/VISION.md`.

## Status

M0 scaffold. Nothing playable yet.

## Run

```
npm install
npm run dev
```

## Layout

- `src/sim/` — the game simulation. No rendering imports. Tested on node.
- `src/render/` — Three.js scene, mech models, shell trails, camera.
- `src/ui/` — HUD, radar, audio.
- `tests/` — vitest, sim only.
