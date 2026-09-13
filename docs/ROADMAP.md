# ROADMAP — ricochet-mech-arena

Sole truth for stages. Other files point here; they do not copy this list.

## Current cursor

**M3 — teams** shipped 2026-09-13 (3v3 default). M0–M2 partially folded in along the way; see LOG.

## Stages

- **M0 — playable duel.** One arena, FPV mech with strafe + dash, level bouncing shells (1 bounce), one AI
  mech with the perfect-dodge search and bank-shot offence, radar + threat cues + synth audio, third-person
  toggle, score + respawn. Exit: a tester can kill the AI with a bank shot or a corner trap, and cannot kill
  it with a direct shot from open ground. Tests prove both halves of the AI contract (dodges an open-ground
  shot; dies in a corridor it cannot sidestep in).
- **M1 — feel.** Tune speed/accel/shell speed/bounce count against real play. Dash telegraph. Hit and
  bounce FX. Mobile-safe HUD scaling.
- **M2 — arenas.** Several hand-made layouts, chosen by URL param. A layout must be checked for "no spot
  where the AI can be trapped from spawn" (spawn fairness).
- **M3 — more mechs.** ✅ 1v1 / 2v2 / 3v3, one brain for every AI, friendly fire on, wipe = round.
- **M4 — assets (optional).** glTF mech skin with legs/torso nodes; recorded sounds. Sim untouched.
