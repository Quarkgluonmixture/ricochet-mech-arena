import type { Arena } from '../sim/arena.ts';
import { CFG } from '../sim/config.ts';
import { forward } from '../sim/geom.ts';
import type { Mech } from '../sim/mech.ts';
import { predictPath } from '../sim/shell.ts';
import type { World } from '../sim/world.ts';

const PATH_HORIZON = 0.9;
const PATH_DT = 1 / 20;

/**
 * Top-down inset that rotates with the player (forward = up). Shows walls, both mechs, live shells and
 * each shell's short predicted path — the same prediction the AI uses, so the player can see what it sees.
 */
export class Radar {
  private ctx: CanvasRenderingContext2D;
  private size: number;
  private arena: Arena;
  private colors: { you: string; ai: string };

  constructor(canvas: HTMLCanvasElement, arena: Arena, colors: { you: string; ai: string }) {
    this.ctx = canvas.getContext('2d')!;
    this.size = canvas.width;
    this.arena = arena;
    this.colors = colors;
  }

  draw(world: World, player: Mech): void {
    const ctx = this.ctx;
    const S = this.size;
    const R = S / 2;
    const metresVisible = 34; // diameter
    const k = S / metresVisible;
    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.beginPath();
    ctx.arc(R, R, R - 1, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(R, R);
    ctx.scale(k, k);
    ctx.rotate(player.torsoYaw);
    ctx.translate(-player.pos.x, -player.pos.z);

    ctx.fillStyle = 'rgba(160, 176, 210, 0.35)';
    for (const w of this.arena.walls) ctx.fillRect(w.minX, w.minZ, w.maxX - w.minX, w.maxZ - w.minZ);

    ctx.lineWidth = 0.14;
    for (const s of world.shells) {
      if (!s.alive) continue;
      const col = world.mechs[s.owner]?.team === player.team ? this.colors.you : this.colors.ai;
      const path = predictPath(s, world.shellWalls, PATH_HORIZON, PATH_DT);
      ctx.strokeStyle = col;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(s.pos.x, s.pos.z);
      for (const p of path) ctx.lineTo(p.x, p.z);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(s.pos.x, s.pos.z, 0.35, 0, Math.PI * 2);
      ctx.fill();
    }

    const tri = (m: Mech, col: string) => {
      if (!m.alive) return;
      const f = forward(m.torsoYaw);
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(m.pos.x + f.x * 1.1, m.pos.z + f.z * 1.1);
      ctx.lineTo(m.pos.x - f.x * 0.7 - f.z * 0.7, m.pos.z - f.z * 0.7 + f.x * 0.7);
      ctx.lineTo(m.pos.x - f.x * 0.7 + f.z * 0.7, m.pos.z - f.z * 0.7 - f.x * 0.7);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = col;
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.arc(m.pos.x, m.pos.z, CFG.mech.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    };
    const rim = metresVisible / 2 - 1.2;
    for (const m of world.mechs) {
      if (m.id === player.id || !m.alive) continue;
      const col = m.team === player.team ? this.colors.you : this.colors.ai;
      const d = Math.hypot(m.pos.x - player.pos.x, m.pos.z - player.pos.z);
      if (d <= rim) { tri(m, col); continue; }
      // beyond the radar's range: pin a diamond to the rim along its bearing
      const ux = (m.pos.x - player.pos.x) / d, uz = (m.pos.z - player.pos.z) / d;
      const px = player.pos.x + ux * rim, pz = player.pos.z + uz * rim;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(px, pz - 1.1); ctx.lineTo(px + 0.8, pz); ctx.lineTo(px, pz + 1.1); ctx.lineTo(px - 0.8, pz); ctx.closePath();
      ctx.fill();
    }
    tri(player, '#ffffff');
    ctx.restore();

    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(R, R, R - 1, 0, Math.PI * 2);
    ctx.stroke();
  }
}
