// Every tunable of the simulation in one place. The AI reads the SAME mech numbers as the player
// (VISION §4: perfect within limits, never beyond them). Mutable on purpose so tests and tuning can
// override a field; nothing here is `as const`.

export const CFG = {
  /** Arena grid cell size in metres. Walls are full cells. */
  cell: 4,
  wallHeight: 3,

  mech: {
    radius: 0.7,
    /** Speed cap, m/s. */
    maxSpeed: 7,
    /** How fast the velocity can change while a direction is commanded, m/s². */
    accel: 32,
    /** How fast the velocity decays with no input, m/s². */
    brake: 40,
    /** Dash: a short burst at a fixed speed in the commanded direction. */
    dashSpeed: 18,
    dashTime: 0.16,
    dashCooldown: 1.4,
    /** Camera height for the first-person view (render only). */
    eyeHeight: 1.75,
    /** Torso (turret) slew rate for the AI, rad/s. The player's mouse is unbounded. */
    torsoTurnRateAI: 6,
    /** Visual only: how fast the legs turn to face the movement direction. */
    legsTurnRate: 10,
  },

  shell: {
    speed: 16,
    radius: 0.18,
    /** Bounces allowed before the shell dies on the NEXT wall (1 = one ricochet). */
    maxBounces: 1,
    lifetime: 5,
    /** Flight height (render only; the sim is planar — VISION §3). */
    height: 1.2,
    /** A shell cannot hit its own shooter until it has bounced once or lived this long. */
    selfArmTime: 0.15,
  },

  player: { maxShells: 4, fireCooldown: 0.22 },

  ai: {
    maxShells: 2,
    fireCooldown: 0.7,
    /** How far ahead (s) the dodge search looks. */
    horizon: 1.5,
    /** Replan interval (s) — the AI's "wind-up"; VISION §4 "telegraphed". */
    replanInterval: 0.08,
    /** Time step of the prediction sim. Shells and candidate moves are sampled on the same grid. */
    predictDt: 1 / 40,
    /** Number of candidate movement directions (plus "stand still"). */
    dirs: 16,
    /** Preferred engagement range band, metres. */
    minRange: 7,
    maxRange: 16,
    /** Fire only when the torso is within this angle (rad) of the solution. */
    aimTolerance: 0.035,
    /** Extra clearance the AI demands between itself and a predicted shell. */
    dodgeMargin: 0.15,
  },

  round: { respawnDelay: 2.0 },
};
