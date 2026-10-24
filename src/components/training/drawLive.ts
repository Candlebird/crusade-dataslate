import type { Status } from '../../rules/abilities';
import { TRAINING_ENEMIES, type TrainingEnemyShape } from '../../rules/downtimeData';
import { FX_COLOR, FX_TIME, centreOf, pieceById, type Enemy, type Fx, type TrainingRun } from '../../rules/training';
import { bar, shade } from './art';
import { HOLD_COLOR } from './drawPieces';
import { drawAt } from './smooth';

// Canvas drawing for what moves on the Training map: enemies (the old modal's shapes) and fx. Same frame as draw.ts.

/**
 * An enemy shape, `r` pixels round, centred on (x, y) and turned to `facing`, with a dark outline so it stands off the
 * route and pads. An elite gets a gold outline.
 */
export function enemyShape(ctx: CanvasRenderingContext2D, shape: TrainingEnemyShape, x: number, y: number, r: number, facing: number, color: string, elite?: boolean) {
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
  ctx.beginPath();
  pts[shape].forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
  ctx.closePath();
  // Lit from the front: a lighter nose, the base colour behind.
  const g = ctx.createLinearGradient(r, 0, -r, 0);
  g.addColorStop(0, shade(color, 0.35));
  g.addColorStop(1, color);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(0,0,0,0.8)';
  ctx.lineWidth = Math.max(1, r * 0.12);
  ctx.stroke();
  // Armour shows as a thick dark rim, a mirrored hide as a bright one; the boss gets a gold one.
  if (shape === 'hexagon' || shape === 'crown' || shape === 'shield') {
    ctx.strokeStyle = shape === 'crown' ? '#e8c55a' : shape === 'shield' ? '#f2fbff' : '#2a3038';
    ctx.lineWidth = Math.max(1.5, r * 0.16);
    ctx.stroke();
  }
  if (elite) {
    // A gold outline round the shape itself, glowing a little.
    ctx.shadowColor = '#ffd45a';
    ctx.shadowBlur = Math.max(3, r * 0.5);
    ctx.strokeStyle = '#ffd45a';
    ctx.lineWidth = Math.max(1.5, r * 0.22);
    ctx.stroke();
  }
  ctx.restore();
}

/** The colour of the status that shows on an enemy, worst first. */
const TINTS: [Status, string][] = [['stun', '#ffe066'], ['slow', '#5ab0ff'], ['daze', FX_COLOR.field], ['mark', '#ff5ad1'], ['bleed', '#d0303a']];
const statusTint = (e: Enemy) => TINTS.find(([k]) => e.status[k])?.[1] ?? (e.dots.length ? FX_COLOR.bleed : undefined);

/** How high a flyer is drawn above its shadow, in cells. */
const LIFT = 0.35;
/** The least an enemy is drawn round, in pixels, however far out the map is; and how much bigger the boss is. */
const MIN_R = 4;
const BOSS_SCALE = 1.5;

const isBossKind = (e: Enemy) => TRAINING_ENEMIES[e.kind].spawn === 'boss';

/** How many pixels round an enemy is drawn at `s` pixels a cell. */
export const enemyRadius = (e: Enemy, s: number) =>
  Math.max(MIN_R * (isBossKind(e) ? 1.5 : 1), TRAINING_ENEMIES[e.kind].size * s * (isBossKind(e) ? BOSS_SCALE : 1));

/** A flyer's wings over (x, y), flapped up by `flap` px (drawn on the map and on the HUD's next-round icon). */
export function flyerWings(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, flap = 0) {
  ctx.strokeStyle = 'rgba(225,230,255,0.85)';
  ctx.lineWidth = Math.max(1.2, r * 0.18);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - r * 1.7, y - r * 0.5 - flap); ctx.quadraticCurveTo(x - r * 0.8, y - r * 1.25 - flap, x, y - r * 0.3);
  ctx.quadraticCurveTo(x + r * 0.8, y - r * 1.25 - flap, x + r * 1.7, y - r * 0.5 - flap);
  ctx.stroke();
  ctx.lineCap = 'butt';
}

/** A boss's gold glow round (x, y), swelling with `pulse` (0 to 1). */
export function bossGlow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, pulse = 0.5) {
  const g = ctx.createRadialGradient(x, y, r * 0.6, x, y, r * (1.9 + 0.3 * pulse));
  g.addColorStop(0, 'rgba(255,214,90,0.45)');
  g.addColorStop(1, 'rgba(255,214,90,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r * (1.9 + 0.3 * pulse), 0, Math.PI * 2); ctx.fill();
}

/**
 * Every enemy: walkers on the ground, flyers lifted over a shadow with pale wings, held ones gripped by a cyan line,
 * the boss big with a pulsing gold aura. HP bars once hurt (always on the boss). Drawn between their last two steps
 * (smooth.ts), so they glide at any speed.
 */
export function drawEnemies(ctx: CanvasRenderingContext2D, run: TrainingRun, s: number, time = performance.now() / 1000) {
  // Walkers first, so flyers pass over them; the boss over everything.
  const rank = (e: Enemy) => (isBossKind(e) ? 2 : Number(e.flies));
  const order = [...run.enemies].sort((a, b) => rank(a) - rank(b));
  for (const e of order) {
    const d = TRAINING_ENEMIES[e.kind];
    const boss = isBossKind(e);
    const r = enemyRadius(e, s);
    const at = drawAt(run, e);
    const x = at.x * s;
    let y = at.y * s;
    if (e.flies) {
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.beginPath(); ctx.ellipse(x, y, r * 0.9, r * 0.5, 0, 0, Math.PI * 2); ctx.fill();
      y -= Math.max(3, LIFT * s);
      flyerWings(ctx, x, y, r, Math.sin(time * 14 + e.id) * r * 0.25);
    }
    if (boss) bossGlow(ctx, x, y, r, 0.5 + 0.5 * Math.sin(time * 4));
    const holder = e.heldBy === undefined ? undefined : pieceById(run, e.heldBy);
    if (holder) {
      const c = centreOf(holder);
      ctx.strokeStyle = HOLD_COLOR;
      ctx.lineWidth = Math.max(1.5, s * 0.12);
      ctx.setLineDash([Math.max(2, s * 0.3), Math.max(2, s * 0.15)]);
      ctx.lineDashOffset = -time * 20;
      ctx.beginPath(); ctx.moveTo(c.x * s, c.y * s); ctx.lineTo(x, y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;
      ctx.lineWidth = Math.max(2, s * 0.15);
      ctx.beginPath(); ctx.arc(x, y, r * 1.25 + Math.max(2, s * 0.15), 0, Math.PI * 2); ctx.stroke();
    }
    enemyShape(ctx, d.shape, x, y, r, e.face ?? 0, d.color, e.elite);
    const tint = statusTint(e);
    if (tint) { ctx.strokeStyle = tint; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r * 1.25 + 2, 0, Math.PI * 2); ctx.stroke(); }
    if (boss || e.hp < e.maxHp) {
      const w = Math.max(12, r * 2.2) * (boss ? 1.3 : 1);
      const h = boss ? Math.max(4, Math.min(6, s * 0.4)) : Math.max(3, Math.min(5, s * 0.3));
      bar(ctx, x - w / 2, y - r * 1.3 - h - 3, w, e.hp / e.maxHp, boss ? '#ff6a8a' : undefined, h);
    }
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
      if (!f.miss && f.kind !== 'heal') {
        // A spark where it lands, swelling as it fades.
        const life = f.kind === 'bolt' ? FX_TIME.bolt : FX_TIME.shot;
        const k = 1 - Math.max(0, f.t) / life;
        ctx.fillStyle = f.color;
        ctx.beginPath(); ctx.arc(f.x2 * s, f.y2 * s, Math.max(1.5, s * (0.1 + 0.12 * k)) * (f.kind === 'bolt' ? 1.5 : 1), 0, Math.PI * 2); ctx.fill();
      }
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
