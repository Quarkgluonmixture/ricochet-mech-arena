import { describe, expect, it } from 'vitest';
import { angleDiff, forward, raycast, reflect, resolveCircle, right, yawOf } from '../src/sim/geom.ts';

const box = { minX: 2, maxX: 4, minZ: -1, maxZ: 1 };

describe('geom', () => {
  it('yaw convention round-trips and forward/right are perpendicular', () => {
    for (const yaw of [0, 0.7, -2.1, 3.0]) {
      expect(angleDiff(yaw, yawOf(forward(yaw)))).toBeCloseTo(0, 9);
      const f = forward(yaw), r = right(yaw);
      expect(f.x * r.x + f.z * r.z).toBeCloseTo(0, 9);
    }
  });

  it('raycast reports the entry face and its outward normal', () => {
    const h = raycast({ x: 0, z: 0 }, { x: 1, z: 0 }, [box]);
    expect(h).not.toBeNull();
    expect(h!.t).toBeCloseTo(2, 9);
    expect(h!.nx).toBe(-1);
    expect(h!.nz).toBe(0);
    // from the far side
    const h2 = raycast({ x: 10, z: 0.5 }, { x: -1, z: 0 }, [box]);
    expect(h2!.t).toBeCloseTo(6, 9);
    expect(h2!.nx).toBe(1);
    // miss above the box
    expect(raycast({ x: 0, z: 5 }, { x: 1, z: 0 }, [box])).toBeNull();
    // origin inside is not a hit
    expect(raycast({ x: 3, z: 0 }, { x: 1, z: 0 }, [box])).toBeNull();
  });

  it('reflect mirrors the normal component only', () => {
    const v = reflect({ x: 3, z: 1 }, -1, 0);
    expect(v.x).toBeCloseTo(-3);
    expect(v.z).toBeCloseTo(1);
  });

  it('resolveCircle pushes a circle out along the shortest axis and reports the normal', () => {
    const p = { x: 1.6, z: 0 };
    const push = resolveCircle(p, 0.7, [box]);
    expect(p.x).toBeCloseTo(1.3, 6);
    expect(push.x).toBeLessThan(0);
    const free = { x: 0, z: 0 };
    const none = resolveCircle(free, 0.7, [box]);
    expect(none.x).toBe(0);
    expect(none.z).toBe(0);
  });
});
