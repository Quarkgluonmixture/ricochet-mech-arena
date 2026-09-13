# VISION — ricochet-mech-arena

**Gold standard for this repo.** When a design call is unclear, decide by this file and write down which
section you used. Higher than ROADMAP, higher than the current code.

## §1 The game in one paragraph

A first-person duel in a walled arena. You pilot a mech. Shells are slow, glowing, and **bounce off walls**.
The enemy mech is an AI that **dodges perfectly** within the *same* movement limits you have (speed cap,
inertia, dash cooldown). It also shoots back, including bank shots off walls. Direct shots never land on it.
You win by **geometry**: corner it, bounce a shell in from a side it cannot see, or make two shells converge
so no reachable point is safe. It kills you the same way. One hit kills.

The reference feeling is the 2D bouncing-shell tank games (Wii Play *Tanks!*, Tank Trouble) where the AI
tanks slide around your ricochets with inhuman precision, and you learn to trap them instead of aiming at
them. This repo is that feeling in 3D, from inside the cockpit.

## §2 Why a mech and not a tank (decided 2026-09-13)

The 2D "tanks" were never tanks physically: they move in any direction instantly and only wear a tank skin.
The skin's job is to make the movement limits feel fair. In first person a real tracked tank cannot strafe,
so the player could never dodge a ricochet, which breaks the symmetry the whole game rests on. A **mech**
keeps every constraint that matters and can sidestep:

- **Hull with inertia** — the legs. Speed cap, acceleration cap, no instant reversal.
- **Independent torso** — the turret. Aim is decoupled from movement.
- **Visible dodge** — a sidestep or dash reads at a glance; a hull pivot does not.
- **Plane-locked** — no jump, no crouch. This is the load-bearing choice, see §3.

"换皮不换骨": keep the skeleton (inertia + independent torso + slow visible shells + one-hit kill + capped
shells in flight), change the skin.

## §3 Plane-locked, wall-only bounce (load-bearing)

Every body moves on one plane. Shells fly level at a fixed height and bounce **only off walls**, never off
floor or ceiling. Consequences that this repo relies on:

- The AI's "perfect dodge" is a **2D** search (candidate directions × predicted shell paths). It stays
  cheap, exact, and explainable. Introducing vertical movement turns it into a 3D problem and makes the AI
  either fake or unbeatable.
- The player can **reason about bank shots** the same way they did top-down: the arena is a 2D maze with
  height.
- Mouse pitch is look-only. Shells leave level regardless of pitch. The crosshair sits at shell height.

⛔ Do not add jumping, crouching, ramps, or floor/ceiling bounces without rewriting this section first.

## §4 The AI contract

- **Perfect within limits, never beyond them.** The AI has exactly the player's movement model. It may
  not teleport, exceed the speed cap, ignore inertia, or pass through walls. If it can be shown dodging
  something a player with the same inputs could not, that is a bug.
- **Beatable only by geometry.** Corners, convergence, and shells arriving from outside its reachable
  set are the *only* ways it dies. Difficulty knobs are therefore **wall layout** and **shells in flight**,
  not reaction time.
- **Telegraphed.** A short replan interval (tens of ms) is the AI's "wind-up". Without it, dodges look
  like cheating even when they are legal.
- **Symmetric offence.** The AI uses the same shell rules and finds the same bank shots a player could.
  It may lead its target using the target's current velocity. It may not read the player's *inputs*.
- **Reads world truth for geometry only.** Positions, velocities, walls, and live shells are public in
  this game (they are visible on the 2D reference). That is allowed. Player intent is not.
- **Its aim is a body, not a cursor** (user, 2026-09-13: "turn the upper body with it — cooler, and it
  stops shooting straight at me while it turns"). The movement model is shared with the player; the
  *aim* model is where the AI's humanity lives: its torso rides on its legs, slews back at a bounded rate,
  and cannot point outside a cone around the body. A target behind it means turning first. The player's
  mouse has none of these limits. Fire rate, slew rate and cone are the aggression knobs; dodge quality
  is never one.

## §4c Lives (human vs AI only)

The human has three lives per round; the AI has one. The asymmetry is deliberate and is the difficulty
lever: the AI's dodge is perfect, so the human's error budget is what makes the duel winnable, while the
AI's one-hit death keeps "geometry kills" crisp. A non-fatal hit costs a life, flashes the screen, shakes
the camera and grants 1.2 s of invulnerability so a single volley cannot strip every life. The round is
decided only by a fatal hit. In AI-vs-AI (spectate, attract) both mechs have one life.

## §4b Round resolution

The first hit decides the round. From that step on every survivor is invulnerable and the AI stops
shooting (it keeps dodging: a mech standing still reads as broken). Hits landing in the very same step as
the first one still count, so a genuine trade is a draw. Otherwise a player who dies could still "win" from
shells already in the air, which the first playtest correctly called nonsense.

## §5 What first person costs, and what pays it back

The 2D games are fair because you see every shell. First person hides shells behind you. The repo owes the
player these compensations, and they are part of the product, not polish:

1. **Slow, glowing shells with trails and a flight sound.** A shell should be heard before it is seen.
2. **A radar** (small top-down inset) showing walls, both mechs, live shells and their short predicted paths.
3. **Threat cues at the screen edge** for shells predicted to reach you soon.
4. **Small, enclosed arenas** so ricochets mostly stay in view.
5. **A third-person toggle** as a first-class option, not a debug view. Many players will prefer it.
6. **Walls block shells, not sight** (added 2026-09-13 after the first human playtest: "in first person I
   have no idea where it is"). Walls are 1.5 m, the eye is at 1.9 m, shells fly at 1.2 m. You see the
   enemy's torso over the maze the way you saw everything top-down; the shell geometry is unchanged.
   Plus an always-on-top marker over its head, and a bearing + distance cue when it is outside the view.
7. **Enough shells to make it weave.** The dodge only reads as footwork under pressure. The player gets
   8 shells in flight; the AI's fire rate is the difficulty knob that stays gentle.

## §6 Assets

Version one shipped with **no external assets** (primitives, synthesised sound) so readability came first
and the build had zero pipeline. On 2026-09-13 the user asked for a visual pass using generated images
(GPT Image via the Codex image tool). The rules that survive that change:

- **Art is render-only.** Nothing in `src/sim/` knows a texture exists; a missing image leaves the flat
  colour in place. The game must remain fully playable with `public/textures/` deleted.
- **Regenerable, not precious.** Every image comes from a prompt kept in `assets-src/PROMPTS.md`, and the
  originals live in `assets-src/`. Re-rolling an asset is a prompt edit, not an art task.
- **Tileable, textless, matte.** Textures tile at a fixed metric size (walls 2.25 m, floor 4 m) so they
  never stretch with wall length; no text or logos anywhere; matte so the bloom pass only catches the
  things that are meant to glow (shells, strips, visors, markers).
- Still out of scope: 3D models. If a mech glTF ever arrives it needs separate legs and torso nodes.

## §7 Non-goals for now

Multiplayer, progression, weapons other than the one shell type, health bars. Each of these would dilute the
single loop: shoot, dodge, trap.
