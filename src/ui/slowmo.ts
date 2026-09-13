/**
 * Time-scale envelope for the kill cam: the sim runs at `floor` speed for a moment after a kill, then
 * eases back to real time. Pure and DOM-free so it can be tested on node. Real seconds in, a multiplier
 * for the sim clock out; everything that lives in world time (mech animation, debris, dust, shell trails)
 * is advanced by the scaled dt, everything that lives in screen time (camera smoothing, HUD timers) by the
 * real one.
 */
export interface SlowMoParams {
  /** Speed multiplier while held. */
  floor: number;
  /** Real seconds to ramp from 1 down to `floor`. */
  attack: number;
  /** Real seconds held at `floor`. */
  hold: number;
  /** Real seconds to ease from `floor` back to 1. */
  release: number;
}

/** The kill cam: ¼ speed for just under a second, a beat longer than the hit itself (TODO "一秒多"). */
export const KILLCAM: SlowMoParams = { floor: 0.25, attack: 0.06, hold: 0.85, release: 0.4 };

const smooth = (f: number) => f * f * (3 - 2 * f);

export class SlowMo {
  private p: SlowMoParams;
  /** Real seconds since the trigger; Infinity while idle. */
  private t = Infinity;

  constructor(p: SlowMoParams = KILLCAM) { this.p = p; }

  get active(): boolean { return this.t < this.p.attack + this.p.hold + this.p.release; }
  /** How deep in the effect we are, 0 (real time) … 1 (at the floor). For the letterbox and the audio filter. */
  get depth(): number { return (1 - this.scale) / (1 - this.p.floor); }
  /** Total real duration of one pass. */
  get duration(): number { return this.p.attack + this.p.hold + this.p.release; }

  /** Start (or restart) the effect. A second kill during the hold restarts the hold from the current
   *  speed rather than snapping back to real time for a frame. */
  trigger(): void {
    const s = this.scale;
    this.t = s >= 1 ? 0 : this.p.attack * (1 - s) / (1 - this.p.floor);
  }

  reset(): void { this.t = Infinity; }

  /** Advance by real seconds and return the multiplier for this frame. */
  step(dt: number): number {
    if (this.t !== Infinity) this.t += dt;
    return this.scale;
  }

  get scale(): number {
    const { floor, attack, hold, release } = this.p;
    const t = this.t;
    if (t < 0 || t >= attack + hold + release) return 1;
    if (t < attack) return 1 - (1 - floor) * (attack > 0 ? t / attack : 1);
    if (t < attack + hold) return floor;
    return floor + (1 - floor) * smooth((t - attack - hold) / release);
  }
}
