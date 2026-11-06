import { bladesOf, DOCTRINES, type WarpathRun } from '../../rules/warpath';

// Warpath's show: screen shake, sparks, bursts and the mood of the field. All of it is worked out from the run and the
// clock at draw time, with no dice of its own, so it can never change how a run plays.

type Ctx = CanvasRenderingContext2D;
type Burst = NonNullable<WarpathRun['fx']>[number];

/** Every effect is drawn at this opacity, so the units stay the loudest thing on the field. */
export const FX = 0.8;
/** Most small kill bursts drawn in a frame. */
const POP_CAP = 160;
/** The run's minute at which the field has turned fully to dusk. */
const DUSK_MIN = 20;

const still = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** A steady 0..1 from a seed: the same spark flies the same way every frame. */
const noise = (n: number) => {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
};

/** How far the screen jolts this frame, in pixels. */
export function shakeOf(run: WarpathRun, now: number): { x: number; y: number } {
  if (still()) return { x: 0, y: 0 };
  let amp = 0;
  for (const f of run.fx) {
    if (f.kind === 'fall') amp = Math.max(amp, 16 * Math.min(1, f.t));
    else if (f.kind === 'boom' || f.kind === 'land') amp = Math.max(amp, Math.min(4, (f.n ?? 1) * 0.6) * Math.min(1, f.t * 2.5));
    // Only a blow that tells on the hero: chip damage and squad losses leave the screen still.
    else if (f.kind === 'dmg' && f.hurt) amp = Math.max(amp, Math.min(6, ((f.n ?? 0) / Math.max(1, run.maxHp)) * 50) * Math.min(1, f.t * 1.6));
  }
  return { x: Math.sin(now * 61) * amp, y: Math.cos(now * 47) * amp };
}

/** How far the run has turned from day to dusk, 0..1. */
export const duskOf = (run: WarpathRun) => Math.min(1, run.t / (DUSK_MIN * 60));

/** The field reddens as a run wears on. */
export function dusk(ctx: Ctx, run: WarpathRun, w: number, h: number): void {
  const d = duskOf(run);
  if (d <= 0) return;
  ctx.fillStyle = `rgba(92,18,12,${0.32 * d})`;
  ctx.fillRect(-20, -20, w + 40, h + 40);
}

/** Motes drifting up past the camera: ash early on, embers late. */
export function motes(ctx: Ctx, run: WarpathRun, camX: number, camY: number, w: number, h: number, now: number): void {
  const d = duskOf(run);
  const n = 34 + Math.round(26 * d);
  const r = Math.round(190 + 65 * d);
  const g = Math.round(195 - 85 * d);
  const b = Math.round(215 - 165 * d);
  for (let i = 0; i < n; i++) {
    const depth = 0.3 + 0.7 * noise(i + 0.5);
    const x = (((noise(i + 1.7) * w + Math.sin(now * 0.4 + i) * 14 - camX * depth) % w) + w) % w;
    const y = (((noise(i + 3.1) * h - now * (10 + 26 * depth) - camY * depth) % h) + h) % h;
    const a = (0.12 + 0.3 * depth) * (0.6 + 0.4 * Math.sin(now * 2 + i * 1.3));
    const size = 1 + 1.6 * depth;
    ctx.fillStyle = `rgba(${r},${g},${b},${a})`;
    ctx.fillRect(x, y, size, size);
  }
}

/** Sparks thrown out from (x, y): `k` runs 0..1 over their life. */
function sparks(ctx: Ctx, x: number, y: number, n: number, reach: number, k: number, col: string, seed: number, size: number): void {
  ctx.fillStyle = `rgba(${col},${1 - k})`;
  const ease = 1 - (1 - k) * (1 - k);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + noise(seed + i) * 1.1;
    const far = reach * (0.55 + 0.6 * noise(seed + i + 9)) * ease;
    const s = size * (1 - k * 0.6);
    ctx.fillRect(x + Math.cos(a) * far - s / 2, y + Math.sin(a) * far - s / 2, s, s);
  }
}

/** The hot heart and flying wreckage of an explosion. */
export function blastCore(ctx: Ctx, f: Burst, x: number, y: number, ppi: number): void {
  const life = f.kind === 'boom' ? Math.min(0.6, f.t + 0.001) : 0;
  if (!life) return;
  const k = 1 - Math.min(1, f.t / 0.6);
  const R = (f.n ?? 3) * ppi;
  ctx.globalCompositeOperation = 'lighter';
  if (k < 0.75) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, R * 0.8);
    g.addColorStop(0, `rgba(255,240,200,${0.75 * (1 - k)})`);
    g.addColorStop(0.5, `rgba(255,140,50,${0.4 * (1 - k)})`);
    g.addColorStop(1, 'rgba(255,80,20,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, R * 0.8, 0, Math.PI * 2);
    ctx.fill();
  }
  sparks(ctx, x, y, 10, R * 1.3, k, '255,190,110', f.x * 3.1 + f.y, Math.max(2, ppi * 0.16));
  ctx.globalCompositeOperation = 'source-over';
}

/** Small kill bursts, up to a cap so a big wave can't eat the frame. */
export function pops(ctx: Ctx, run: WarpathRun, sx: (x: number) => number, sy: (y: number) => number, seen: (x: number, y: number) => boolean, ppi: number, foe: string): void {
  let left = POP_CAP;
  ctx.globalCompositeOperation = 'lighter';
  for (const f of run.fx) {
    if (f.kind !== 'pop' || !seen(f.x, f.y)) continue;
    if (left-- <= 0) break;
    const k = 1 - f.t / 0.4;
    const x = sx(f.x);
    const y = sy(f.y);
    const size = (f.n ?? 1) * ppi;
    ctx.beginPath();
    ctx.arc(x, y, size * (0.25 + 0.5 * k), 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${f.crit ? '255,214,90' : foe},${0.7 * (1 - k)})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    sparks(ctx, x, y, f.crit ? 8 : 5, size * 0.9, k, f.crit ? '255,214,90' : foe, f.x + f.y * 1.7, Math.max(1.5, ppi * 0.11));
  }
  ctx.globalCompositeOperation = 'source-over';
}

/** A level gained: rings and rays burst from the hero. */
export function levelBurst(ctx: Ctx, f: Burst, hx: number, hy: number, ppi: number): void {
  const k = 1 - f.t / 0.9;
  ctx.globalCompositeOperation = 'lighter';
  for (const lag of [0, 0.18]) {
    const q = Math.max(0, k - lag);
    ctx.beginPath();
    ctx.arc(hx, hy, ppi * (2 + 12 * q), 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255,215,90,${0.8 * (1 - k)})`;
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  ctx.strokeStyle = `rgba(255,235,170,${0.7 * (1 - k)})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + k * 0.6;
    const r1 = ppi * (2.5 + 7 * k);
    const r2 = r1 + ppi * 2.5 * (1 - k);
    ctx.moveTo(hx + Math.cos(a) * r1, hy + Math.sin(a) * r1);
    ctx.lineTo(hx + Math.cos(a) * r2, hy + Math.sin(a) * r2);
  }
  ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
}

/** A boss down: shockwaves, wreckage and a flash of the whole screen (a lord's in its own colour). */
export function bossFall(ctx: Ctx, f: Burst, x: number, y: number, ppi: number, w: number, h: number): void {
  const k = 1 - f.t / 1.4;
  const col = f.hurt ? '255,122,230' : '255,201,77';
  ctx.globalCompositeOperation = 'lighter';
  if (k < 0.25) {
    ctx.fillStyle = `rgba(${col},${0.34 * (1 - k * 4)})`;
    ctx.fillRect(-20, -20, w + 40, h + 40);
  }
  for (const lag of [0, 0.12, 0.26]) {
    const q = Math.max(0, k - lag);
    if (!q) continue;
    ctx.beginPath();
    ctx.arc(x, y, ppi * (f.n ?? 4) * (0.6 + 6 * q), 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${col},${0.85 * (1 - q)})`;
    ctx.lineWidth = 2 + 6 * (1 - q);
    ctx.stroke();
  }
  sparks(ctx, x, y, 30, ppi * (f.n ?? 4) * 5, k, col, f.x + f.y, Math.max(3, ppi * 0.3));
  ctx.globalCompositeOperation = 'source-over';
}

/** A slow ring of dashes round the hero in its archetype's colour. */
export function heroAura(ctx: Ctx, hx: number, hy: number, ppi: number, color: string, now: number): void {
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(now * 0.7);
  ctx.beginPath();
  ctx.arc(0, 0, 2.15 * ppi, 0, Math.PI * 2);
  ctx.setLineDash([ppi * 0.9, ppi * 1.35]);
  ctx.lineWidth = 2;
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.55 * FX;
  ctx.stroke();
  ctx.restore();
}

/** Whirling Blades: each one spins on its own as it circles the hero. */
export function blades(ctx: Ctx, run: WarpathRun, sx: (x: number) => number, sy: (y: number) => number, ppi: number, now: number): void {
  const r = ppi * 1.1;
  for (const b of bladesOf(run)) {
    ctx.save();
    ctx.translate(sx(b.x), sy(b.y));
    ctx.rotate(now * 11 + b.a);
    ctx.fillStyle = 'rgba(190,225,255,0.09)';
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8f2ff';
    ctx.strokeStyle = '#6fb3ff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      ctx.lineTo(Math.cos(a + 0.75) * r * 0.32, Math.sin(a + 0.75) * r * 0.32);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

/** Killing Spree: an arc round the hero fills with the streak and drains as it goes cold. */
export function spreeArc(ctx: Ctx, run: WarpathRun, hx: number, hy: number, ppi: number): void {
  const S = DOCTRINES.killingSpree;
  const left = 1 - (run.t - (run.spreeT ?? 0)) / S.secs;
  if (!run.doctrines.killingSpree || !run.spree || left <= 0) return;
  ctx.beginPath();
  ctx.arc(hx, hy, 2.7 * ppi, -Math.PI / 2, -Math.PI / 2 + (run.spree / S.stacks) * Math.PI * 2);
  ctx.strokeStyle = `rgba(255,90,70,${0.25 + 0.65 * left})`;
  ctx.lineWidth = 3;
  ctx.stroke();
}

/** The edges of the screen beat red when the hero is nearly done. */
export function lowHp(ctx: Ctx, run: WarpathRun, w: number, h: number, now: number): void {
  const share = run.hp / Math.max(1, run.maxHp);
  if (share >= 0.35) return;
  const beat = 0.5 + 0.5 * Math.sin(now * (still() ? 0 : 5 + (0.35 - share) * 14));
  const depth = (0.35 - share) / 0.35;
  const r = Math.hypot(w, h) / 2;
  const g = ctx.createRadialGradient(w / 2, h / 2, r * 0.55, w / 2, h / 2, r);
  g.addColorStop(0, 'rgba(200,20,10,0)');
  g.addColorStop(1, `rgba(200,20,10,${0.22 + 0.33 * depth * (0.55 + 0.45 * beat)})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}
