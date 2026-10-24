import type { Status } from '../../rules/abilities';
import { TRAINING_ENEMIES, type TrainingEnemyShape } from '../../rules/downtimeData';
import { FX_COLOR, FX_TIME, centreOf, pieceById, type Enemy, type Fx, type TrainingRun } from '../../rules/training';
import { bar } from './draw';

// Canvas drawing for what moves on the Training map: enemies (the old modal's shapes) and fx. Same frame as draw.ts.

/** An enemy shape, `r` pixels round, centred on (x, y) and turned to `facing`. A veteran gets a gold dashed ring. */
export function enemyShape(ctx: CanvasRenderingContext2D, shape: TrainingEnemyShape, x: number, y: number, r: number, facing: number, color: string, vet?: boolean) {
  // Points of a regular polygon, or a star alternating between two radii.
  const ring = (n: number, r1: number, r2 = r1, turn = 0) =>
    Array.from({ length: n * (r2 === r1 ? 1 : 2) }, (_, i) => {
      const a = turn + (i * Math.PI * 2) / (n * (r2 === r1 ? 1 : 2));
      const rr = r2 === r1 || i % 2 === 0 ? r1 : r2;
      return [Math.cos(a) * rr, Math.sin(a) * rr];
    });
  const pts: Record<TrainingEnemyShape, number[][]> = {
    dart: [[r * 1.2, 0], [-r * 0.8, r * 0.75], [-r * 0.4, 0], [-r * 0.8, -r * 0.75]],
    diamond: [[r * 1.1, 0], [0, r * 0.8], [-r * 1.1, 0], [0, -r * 0.8]],
    pentagon: ring(5, r * 1.05),
    chevron: [[r * 1.2, 0], [-r * 0.6, r * 0.95], [-r * 0.15, 0], [-r * 0.6, -r * 0.95]],
    hexagon: ring(6, r * 1.05),
    shield: [[r * 1.15, 0], [r * 0.25, r * 0.95], [-r * 0.85, r * 0.85], [-r * 0.85, -r * 0.85], [r * 0.25, -r * 0.95]],
    star: ring(4, r * 1.25, r * 0.45),
    spikes: ring(8, r * 1.15, r * 0.75),
    crown: ring(6, r * 1.15, r * 0.7, Math.PI / 6),
  };
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(facing);
  ctx.fillStyle = color;
  ctx.beginPath();
  pts[shape].forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
  ctx.closePath();
  ctx.fill();
  // Armour shows as a thick dark rim, a mirrored hide as a bright one; the boss gets a gold one.
  if (shape === 'hexagon' || shape === 'crown' || shape === 'shield') {
    ctx.strokeStyle = shape === 'crown' ? '#c9a24a' : shape === 'shield' ? '#f2fbff' : '#2a3038';
    ctx.lineWidth = Math.max(2, r * 0.18);
    ctx.stroke();
  }
  if (vet) {
    ctx.strokeStyle = '#e8c55a';
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 2]);
    ctx.beginPath(); ctx.arc(0, 0, r + 6, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
}

/** The colour of the status that shows on an enemy, worst first. */
const TINTS: [Status, string][] = [['stun', '#ffe066'], ['slow', '#5ab0ff'], ['daze', FX_COLOR.field], ['mark', '#ff5ad1'], ['bleed', '#d0303a']];
const statusTint = (e: Enemy) => TINTS.find(([k]) => e.status[k])?.[1] ?? (e.dots.length ? FX_COLOR.bleed : undefined);

/** How high a flyer is drawn above its shadow, in cells. */
const LIFT = 0.3;

/** Every enemy: walkers on the ground, flyers lifted over a shadow with pale wings, held ones gripped. */
export function drawEnemies(ctx: CanvasRenderingContext2D, run: TrainingRun, s: number) {
  // Walkers first, so flyers pass over them.
  const order = [...run.enemies].sort((a, b) => Number(a.flies) - Number(b.flies));
  for (const e of order) {
    const d = TRAINING_ENEMIES[e.kind];
    const r = d.size * s;
    const x = e.x * s;
    let y = e.y * s;
    if (e.flies) {
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.55, 0, 0, Math.PI * 2); ctx.fill();
      y -= LIFT * s;
      ctx.strokeStyle = 'rgba(220,225,255,0.75)';
      ctx.lineWidth = Math.max(1, r * 0.15);
      ctx.beginPath();
      ctx.moveTo(x - r * 1.7, y - r * 0.5); ctx.quadraticCurveTo(x - r * 0.8, y - r * 1.2, x, y - r * 0.3);
      ctx.quadraticCurveTo(x + r * 0.8, y - r * 1.2, x + r * 1.7, y - r * 0.5);
      ctx.stroke();
    }
    const holder = e.heldBy === undefined ? undefined : pieceById(run, e.heldBy);
    if (holder) {
      const c = centreOf(holder);
      ctx.strokeStyle = FX_COLOR.hold;
      ctx.lineWidth = Math.max(1.5, s * 0.12);
      ctx.beginPath(); ctx.moveTo(c.x * s, c.y * s); ctx.lineTo(x, y); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, r + Math.max(3, s * 0.25), 0, Math.PI * 2); ctx.stroke();
    }
    enemyShape(ctx, d.shape, x, y, r, e.face ?? 0, d.color, e.vet);
    const tint = statusTint(e);
    if (tint) { ctx.strokeStyle = tint; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r + 3, 0, Math.PI * 2); ctx.stroke(); }
    if (e.hp < e.maxHp) bar(ctx, x - r, y - r - 5, r * 2, e.hp / e.maxHp, '#b3352b', Math.max(2, Math.min(4, s * 0.3)));
  }
}

/** A ring swelling out to its radius as it fades; a bleed field also fills faintly red. */
function ring(ctx: CanvasRenderingContext2D, f: Fx, s: number) {
  const k = 1 - f.t / FX_TIME.pulse;
  const r = Math.max(1, (f.r ?? 1) * s * (0.3 + 0.7 * k));
  ctx.globalAlpha = 0.7 * (1 - k);
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(f.x1 * s, f.y1 * s, r, 0, Math.PI * 2);
  if (f.color === FX_COLOR.bleed || f.color === FX_COLOR.blast) {
    ctx.fillStyle = f.color;
    ctx.globalAlpha = 0.18 * (1 - k);
    ctx.fill();
    ctx.globalAlpha = 0.7 * (1 - k);
  }
  ctx.stroke();
}

/** A blow: a curved swipe across the target from the striker's side, sweeping through as it fades, with sparks. */
function slash(ctx: CanvasRenderingContext2D, f: Fx, s: number) {
  const a = Math.atan2(f.y2 - f.y1, f.x2 - f.x1);
  const done = 1 - f.t / FX_TIME.melee;
  const r = s * 0.38;
  const from = a + Math.PI - 1.2;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(f.x2 * s, f.y2 * s, r, from, from + 2.4 * Math.min(1, done * 2.5));
  ctx.stroke();
  ctx.lineWidth = 1.5;
  for (const k of [-0.6, 0, 0.6]) {
    const d = a + k;
    const r1 = s * (0.1 + done * 0.15);
    ctx.beginPath();
    ctx.moveTo(f.x2 * s + Math.cos(d) * r1, f.y2 * s + Math.sin(d) * r1);
    ctx.lineTo(f.x2 * s + Math.cos(d) * (r1 + s * 0.14), f.y2 * s + Math.sin(d) * (r1 + s * 0.14));
    ctx.stroke();
  }
  ctx.lineCap = 'butt';
}

/** Shots, blows, bolts, links and rings. Hold lines are drawn with the enemy they grip, so they are skipped here. */
export function drawFx(ctx: CanvasRenderingContext2D, run: TrainingRun, s: number) {
  for (const f of run.fx) {
    if (f.kind === 'hold') continue;
    ctx.strokeStyle = f.color;
    ctx.globalAlpha = Math.min(1, f.t / 0.1) * (f.miss ? 0.45 : 1);
    if (f.kind === 'pulse') ring(ctx, f, s);
    else if (f.melee) slash(ctx, f, s);
    else {
      ctx.lineWidth = f.kind === 'bolt' ? 3 : 2;
      if (f.kind === 'heal') ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(f.x1 * s, f.y1 * s); ctx.lineTo(f.x2 * s, f.y2 * s); ctx.stroke();
      ctx.setLineDash([]);
      if (f.blocked) {
        // A puff of dust where the cover took the shot.
        ctx.globalAlpha = Math.min(1, f.t / 0.1);
        ctx.fillStyle = '#b8a27a';
        ctx.beginPath(); ctx.arc(f.x2 * s, f.y2 * s, s * 0.14, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  ctx.globalAlpha = 1;
}
