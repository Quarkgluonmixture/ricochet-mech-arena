import { CFG } from './config.ts';
import type { Aabb, Vec2 } from './geom.ts';

export interface Arena {
  rows: string[];
  cols: number;
  /** Extents in metres, centred on the origin. */
  width: number;
  depth: number;
  walls: Aabb[];
  spawns: { player: Vec2; enemy: Vec2 };
  /** Initial torso yaw per spawn: faces down the longest open corridor, never into a wall. */
  spawnYaw: { player: number; enemy: number };
}

/**
 * The first arena. 180°-rotation symmetric so neither spawn is favoured. Corridors are one cell
 * (4 m) wide: wide enough to sidestep, so kills happen at corners and dead ends, not in hallways.
 */
export const MAP_A = [
  '#############',
  '#P....#.....#',
  '#.##.....##.#',
  '#....#.#....#',
  '#.#..#.#..#.#',
  '#.#.......#.#',
  '#...##.##...#',
  '#.#.......#.#',
  '#.#..#.#..#.#',
  '#....#.#....#',
  '#.##.....##.#',
  '#.....#....E#',
  '#############',
];

/** ASCII rows → arena. Horizontal runs of '#' merge into one box so shells never find a seam. */
export function buildArena(rows: string[] = MAP_A, cell: number = CFG.cell): Arena {
  const cols = rows[0].length;
  const width = cols * cell;
  const depth = rows.length * cell;
  const x0 = -width / 2;
  const z0 = -depth / 2;
  const walls: Aabb[] = [];
  let player: Vec2 | null = null;
  let enemy: Vec2 | null = null;
  rows.forEach((row, r) => {
    if (row.length !== cols) throw new Error(`arena row ${r} has ${row.length} cells, expected ${cols}`);
    let c = 0;
    while (c < cols) {
      const ch = row[c];
      if (ch === '#') {
        let e = c;
        while (e + 1 < cols && row[e + 1] === '#') e++;
        walls.push({ minX: x0 + c * cell, maxX: x0 + (e + 1) * cell, minZ: z0 + r * cell, maxZ: z0 + (r + 1) * cell });
        c = e + 1;
        continue;
      }
      const centre = { x: x0 + (c + 0.5) * cell, z: z0 + (r + 0.5) * cell };
      if (ch === 'P') player = centre;
      if (ch === 'E') enemy = centre;
      c++;
    }
  });
  if (!player || !enemy) throw new Error('arena needs a P and an E spawn');
  const yawAt = (pos: Vec2): number => {
    const c = Math.floor((pos.x - x0) / cell), r = Math.floor((pos.z - z0) / cell);
    let best = { run: -1, dx: 0, dz: -1 };
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      let run = 0;
      while (rows[r + dz * (run + 1)]?.[c + dx * (run + 1)] === '.' || rows[r + dz * (run + 1)]?.[c + dx * (run + 1)] === 'P' || rows[r + dz * (run + 1)]?.[c + dx * (run + 1)] === 'E') run++;
      if (run > best.run) best = { run, dx, dz };
    }
    return Math.atan2(-best.dx, -best.dz);
  };
  return { rows, cols, width, depth, walls, spawns: { player, enemy }, spawnYaw: { player: yawAt(player), enemy: yawAt(enemy) } };
}
