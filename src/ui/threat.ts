import { CFG } from '../sim/config.ts';
import { forward, right } from '../sim/geom.ts';
import type { Mech } from '../sim/mech.ts';
import { predictPath } from '../sim/shell.ts';
import type { World } from '../sim/world.ts';

const HORIZON = 1.3;
const DT = 1 / 30;

/**
 * Screen-edge cues (VISION §5.3): a ring around the crosshair with a marker per live shell outside the
 * front view, brightening as a shell is predicted to reach the player. Direction = where the shell IS now.
 */
export class ThreatRing {
  private ctx: CanvasRenderingContext2D;
  private size: number;

  constructor(canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.size = canvas.width;
  }

  draw(world: World, player: Mech, enemy: Mech, fovHalfAngle: number): void {
    const ctx = this.ctx;
    const S = this.size;
    const R = S * 0.36;
    ctx.clearRect(0, 0, S, S);
    if (!player.alive) return;
    const f = forward(player.torsoYaw);
    const r = right(player.torsoYaw);

    // enemy bearing marker when it is outside the view: a diamond on an outer ring plus the distance
    if (enemy.alive) {
      const dx = enemy.pos.x - player.pos.x, dz = enemy.pos.z - player.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 1e-3) {
        const sx = (dx * r.x + dz * r.z) / d;
        const sy = -(dx * f.x + dz * f.z) / d;
        const angleOff = Math.acos(Math.max(-1, Math.min(1, -sy)));
        if (angleOff > fovHalfAngle * 0.9) {
          const RR = R + 34;
          const px = S / 2 + sx * RR, py = S / 2 + sy * RR;
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(Math.atan2(sy, sx) + Math.PI / 2);
          ctx.fillStyle = 'rgba(255, 106, 92, 0.95)';
          ctx.beginPath();
          ctx.moveTo(0, -13); ctx.lineTo(9, 0); ctx.lineTo(0, 13); ctx.lineTo(-9, 0); ctx.closePath();
          ctx.fill();
          ctx.restore();
          ctx.fillStyle = 'rgba(255, 106, 92, 0.95)';
          ctx.font = '600 13px ui-sans-serif, system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`${Math.round(d)} m`, S / 2 + sx * (RR + 26), S / 2 + sy * (RR + 26));
        }
      }
    }

    const hitR = player.radius + CFG.shell.radius + 0.4;
    for (const s of world.shells) {
      if (!s.alive) continue;
      const dx = s.pos.x - player.pos.x, dz = s.pos.z - player.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 1e-3) continue;
      const sx = (dx * r.x + dz * r.z) / d;
      const sy = -(dx * f.x + dz * f.z) / d; // screen up = forward
      const angleOff = Math.acos(Math.max(-1, Math.min(1, -sy)));
      // time to impact along the predicted path, if any
      let tti = -1;
      const path = predictPath(s, world.shellWalls, HORIZON, DT);
      for (let i = 0; i < path.length; i++) {
        if (Math.hypot(path[i].x - player.pos.x, path[i].z - player.pos.z) < hitR) { tti = (i + 1) * DT; break; }
      }
      const inView = angleOff < fovHalfAngle && d < 30;
      if (tti < 0 && inView) continue; // visible and harmless: no cue
      const urgency = tti < 0 ? 0 : 1 - tti / HORIZON;
      const alpha = tti < 0 ? 0.28 : 0.45 + 0.55 * urgency;
      const size = tti < 0 ? 6 : 8 + 10 * urgency;
      const col = s.owner === player.id ? '111, 182, 255' : '255, 106, 92';
      const px = S / 2 + sx * R, py = S / 2 + sy * R;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(Math.atan2(sy, sx) + Math.PI / 2);
      ctx.fillStyle = `rgba(${col}, ${alpha.toFixed(2)})`;
      ctx.beginPath();
      ctx.moveTo(0, -size);
      ctx.lineTo(size * 0.7, size * 0.5);
      ctx.lineTo(-size * 0.7, size * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      if (tti >= 0 && tti < 0.5) {
        ctx.strokeStyle = `rgba(${col}, ${(0.15 + 0.35 * urgency).toFixed(2)})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(S / 2, S / 2, R + 18, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }
}
