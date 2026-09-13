import { describe, expect, it } from 'vitest';
import { KILLCAM, SlowMo } from '../src/ui/slowmo.ts';

// The bug these guard against: a kill cam that never lets go. A stuck multiplier below 1 leaves the whole
// game in slow motion for the rest of the session with nothing thrown and nothing logged.
describe('kill cam time scale', () => {
  it('is real time until triggered, drops to the floor, and comes all the way back', () => {
    const s = new SlowMo({ floor: 0.25, attack: 0.06, hold: 0.85, release: 0.4 });
    expect(s.step(1 / 60)).toBe(1);
    expect(s.active).toBe(false);
    s.trigger();
    let min = 1, t = 0;
    for (; t < 2; t += 1 / 60) min = Math.min(min, s.step(1 / 60));
    expect(min).toBeCloseTo(0.25, 5);
    expect(s.scale).toBe(1);
    expect(s.active).toBe(false);
  });

  it('holds the floor for the configured time and releases within the configured duration', () => {
    const p = { floor: 0.25, attack: 0.06, hold: 0.85, release: 0.4 };
    const s = new SlowMo(p);
    s.trigger();
    let atFloor = 0, active = 0;
    const dt = 1 / 240;
    for (let t = 0; t < 3; t += dt) {
      const k = s.step(dt);
      if (k <= p.floor + 1e-9) atFloor += dt;
      if (k < 1) active += dt;
    }
    expect(atFloor).toBeGreaterThan(p.hold - 0.02);
    expect(atFloor).toBeLessThan(p.hold + 0.02);
    expect(active).toBeLessThan(s.duration + 0.02);
    expect(active).toBeGreaterThan(s.duration - 0.05);
  });

  it('never exceeds 1 or dips under the floor, so the sim clock cannot run backwards or race ahead', () => {
    const s = new SlowMo(KILLCAM);
    s.trigger();
    for (let t = 0; t < 3; t += 1 / 60) {
      const k = s.step(1 / 60);
      expect(k).toBeLessThanOrEqual(1);
      expect(k).toBeGreaterThanOrEqual(KILLCAM.floor - 1e-9);
    }
  });

  it('a second kill during the effect restarts the hold without a frame at real time', () => {
    const s = new SlowMo({ floor: 0.25, attack: 0.06, hold: 0.85, release: 0.4 });
    s.trigger();
    for (let t = 0; t < 0.5; t += 1 / 60) s.step(1 / 60);
    expect(s.scale).toBeCloseTo(0.25, 5);
    s.trigger();
    expect(s.scale).toBeCloseTo(0.25, 5); // no snap back to 1
    let atFloor = 0;
    for (let t = 0; t < 3; t += 1 / 240) if (s.step(1 / 240) <= 0.25 + 1e-9) atFloor += 1 / 240;
    expect(atFloor).toBeGreaterThan(0.8); // the hold ran again from (almost) the start
  });

  it('a trigger mid-release picks the ramp up from the current speed', () => {
    const s = new SlowMo({ floor: 0.25, attack: 0.06, hold: 0.85, release: 0.4 });
    s.trigger();
    for (let t = 0; t < 0.06 + 0.85 + 0.2; t += 1 / 240) s.step(1 / 240);
    const mid = s.scale;
    expect(mid).toBeGreaterThan(0.25);
    expect(mid).toBeLessThan(1);
    s.trigger();
    expect(s.scale).toBeCloseTo(mid, 3);
  });
});
