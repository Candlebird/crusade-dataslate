import { atWill, holdOf, hymn, inCover, onField, ROLES, roleOf, SITE_NAMES, terrainNear, WARPATH, type SiteKind, type Squad, type WarpathRun } from '../../rules/warpath';
import type { IconName } from '../iconData';
import { ICONS } from '../iconData';
import { alpha, bar } from '../training/art';
import type { EmblemLayer } from '../../model/types';
import { drawEmblem } from '../Emblem';
import { blades, blastCore, bossFall, dusk, FX, ground, heroAura, levelBurst, lowHp, motes, pops, shakeOf, spreeArc } from './vfx';

// Warpath on a Canvas2D: the field (ground, grid, terrain), pickups, the enemy swarm, the force (each squad's models in
// a loose cluster round its anchor), the hero, shots and blast markers, then floating numbers. Every body is a
// game-icons silhouette drawn once per colour and size into a sprite cache, then stamped with drawImage, which keeps a
// thousand bodies cheap. The spec planned a WebGL2 batcher; Canvas2D sprites held 60 fps in the passes, so it stays.

/** The camera: centre in inches, pixels per inch, canvas size in CSS pixels. */
export interface View { cx: number; cy: number; ppi: number; w: number; h: number }

/** Colours, and the emblems the player made for each unit (by unit id), drawn in place of the stock icons. */
export interface Palette { own: string; foe: string; faces?: Record<string, EmblemLayer[]> }

const faces = new Map<string, HTMLCanvasElement>();

/** Drop every cached sprite. The browser can throw away a canvas's pixels when it runs short of graphics memory (after
 *  a long stall, say); cached sprites would then stamp blank forever, so a lost or restored canvas clears the caches
 *  and they draw afresh. */
export function resetSprites(): void {
  faces.clear();
  sprites.clear();
}

/** A fresh offscreen canvas for the cache, which clears the caches if its pixels are ever lost. */
function cacheCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.addEventListener('contextlost', resetSprites);
  c.addEventListener('contextrestored', resetSprites);
  return c;
}

/** Spot-check one cached sprite now and then: a lost one means they all go. */
export function checkSprites(): void {
  for (const c of [sprites.values().next().value, faces.values().next().value]) {
    const ctx = c?.getContext('2d') as (CanvasRenderingContext2D & { isContextLost?: () => boolean }) | null | undefined;
    if (ctx?.isContextLost?.()) return resetSprites();
  }
}

/** A unit's emblem `px` across, drawn once per size and cached, on a dark disc so it reads on any ground. */
function face(id: string, layers: EmblemLayer[], px: number): HTMLCanvasElement {
  const size = Math.max(6, Math.round(px / 2) * 2);
  const key = `${id}|${size}`;
  let c = faces.get(key);
  if (c) return c;
  if (faces.size > 300) faces.clear();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c = cacheCanvas();
  c.width = c.height = Math.ceil(size * dpr);
  const ctx = c.getContext('2d')!;
  ctx.scale(dpr, dpr);
  drawEmblem(ctx, layers, 0, 0, size);
  faces.set(key, c);
  return c;
}

/** Stamp a unit's emblem centred on (x, y), or its stock icon when it has none. */
function stampUnit(ctx: CanvasRenderingContext2D, pal: Palette, s: Squad, icon: IconName, color: string, x: number, y: number, px: number, glow = 0) {
  const layers = pal.faces?.[s.unitId];
  if (!layers?.length) return stamp(ctx, icon, color, x, y, px, glow);
  const c = face(s.unitId, layers, px);
  const size = Math.max(6, Math.round(px / 2) * 2);
  ctx.drawImage(c, x - size / 2, y - size / 2, size, size);
}

const sprites = new Map<string, HTMLCanvasElement>();
const paths = new Map<IconName, Path2D>();

const pathOf = (name: IconName) => {
  let p = paths.get(name);
  if (!p) {
    p = new Path2D(ICONS[name][1]);
    paths.set(name, p);
  }
  return p;
};

/** An icon `px` across in a colour, with a dark rim (and a glow for bosses), drawn once and cached. */
function sprite(name: IconName, color: string, px: number, glow = 0): HTMLCanvasElement {
  const size = Math.max(4, Math.round(px / 2) * 2);
  const key = `${name}|${color}|${size}|${glow}`;
  let c = sprites.get(key);
  if (c) return c;
  if (sprites.size > 600) sprites.clear();
  const pad = Math.ceil(size * 0.15) + glow;
  c = cacheCanvas();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = c.height = Math.ceil((size + pad * 2) * dpr);
  const ctx = c.getContext('2d')!;
  ctx.scale(dpr, dpr);
  ctx.translate(pad, pad);
  const box = ICONS[name][0];
  ctx.scale(size / box, size / box);
  const p = pathOf(name);
  if (glow) {
    ctx.shadowColor = color;
    ctx.shadowBlur = glow * dpr; // shadowBlur ignores the transform: device pixels
  }
  ctx.lineWidth = (box / size) * 2.2;
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.stroke(p);
  ctx.fillStyle = color;
  ctx.fill(p);
  sprites.set(key, c);
  return c;
}

/** Stamp a cached sprite centred on (x, y) at `px` across. */
function stamp(ctx: CanvasRenderingContext2D, name: IconName, color: string, x: number, y: number, px: number, glow = 0) {
  const s = sprite(name, color, px, glow);
  const size = Math.max(4, Math.round(px / 2) * 2);
  const pad = Math.ceil(size * 0.15) + glow;
  ctx.drawImage(s, x - size / 2 - pad, y - size / 2 - pad, size + pad * 2, size + pad * 2);
}

const fontOf = (size: number) => `bold ${size}px Rajdhani, 'Segoe UI', system-ui, sans-serif`;

/** A floating number: bold, with a dark outline so it reads over the swarm. */
function number(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, px: number, color: string) {
  const size = Math.round(px);
  ctx.font = fontOf(size);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(3, size / 5);
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

/** A message on a dark plate, centred on `x` with its top at `y`, wrapped to fit `room`. */
function plate(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, px: number, color: string, room: number) {
  const size = Math.round(px);
  ctx.font = fontOf(size);
  const lines: string[] = [];
  for (const word of text.split(' ')) {
    const last = lines[lines.length - 1];
    if (last !== undefined && ctx.measureText(`${last} ${word}`).width <= room) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  const lead = size * 1.2;
  const wide = Math.max(...lines.map((l) => ctx.measureText(l).width)) + size * 1.4;
  const tall = lines.length * lead + size * 0.5;
  ctx.beginPath();
  ctx.roundRect(x - wide / 2, y, wide, tall, 8);
  ctx.fillStyle = 'rgba(12,13,17,0.82)';
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = alpha(color, 0.55);
  ctx.stroke();
  lines.forEach((l, i) => number(ctx, l, x, y + size * 0.25 + lead * (i + 0.5), size, color));
}

/** A rough outline round (x, y): `wobble` of the radius in or out, the same every frame for a given `seed`. `sharp` leaves
 *  the corners in, for rock; otherwise it rounds them off. */
function blob(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, seed: number, wobble: number, sharp = false) {
  const n = sharp ? 9 : 16;
  const at = (i: number): [number, number] => {
    const a = (i / n) * Math.PI * 2;
    const k = r * (1 + wobble * (Math.sin(a * 3 + seed) + 0.6 * Math.sin(a * 5 + seed * 1.7)) / 1.6);
    return [x + Math.cos(a) * k, y + Math.sin(a) * k];
  };
  ctx.beginPath();
  if (sharp) {
    for (let i = 0; i < n; i++) ctx.lineTo(...at(i));
  } else {
    const [ax, ay] = at(0);
    const [bx, by] = at(n - 1);
    ctx.moveTo((ax + bx) / 2, (ay + by) / 2);
    for (let i = 0; i < n; i++) {
      const [px, py] = at(i);
      const [qx, qy] = at(i + 1);
      ctx.quadraticCurveTo(px, py, (px + qx) / 2, (py + qy) / 2);
    }
  }
  ctx.closePath();
}

/** The icon a squad's models are drawn with. */
export function squadIcon(s: Squad): IconName {
  switch (s.kind) {
    case 'hero': return 'g:crowned-heart';
    case 'heavy': return s.tough >= 9 ? 'g:battle-mech' : 'g:battle-tank';
    case 'artillery': return 'g:cannon';
    case 'air': return 'g:jet-fighter';
    case 'fort': return 'g:watchtower';
    default: return s.guns.every((g) => g.melee) ? 'g:spartan-helmet' : 'g:visored-helm';
  }
}

const PICKUP: Record<string, [IconName, string]> = {
  ration: ['g:meat', '#ff9a7a'],
  beacon: ['g:radar-sweep', '#7fe0ff'],
  supply: ['g:wooden-crate', '#ffd166'],
};
const SITE: Record<SiteKind, [IconName, string]> = {
  shrine: ['g:holy-symbol', '#c9a6ff'],
  cache: ['g:open-treasure-chest', '#ffd166'],
  well: ['g:medical-pack', '#7ee07e'],
  champion: ['g:crossed-swords', '#ff8a5c'],
};
const ELITE = '#ffd34d';
/** Foes that shoot lean toward the colour of their shots. */
const SHOOTER = '#ffb347';
const GEM_COLOR = ['#6fd3ff', '#7ee07e', '#ffd166', '#ff7ad9'];
const TERRAIN: Record<string, { fill: string; edge: string; icon: IconName; tint: string }> = {
  block: { fill: '#2f2e36', edge: '#17171b', icon: 'g:rock', tint: '#46444f' },
  cover: { fill: 'rgba(60,110,60,0.35)', edge: 'rgba(120,190,110,0.55)', icon: 'g:berry-bush', tint: '#6fae66' },
  difficult: { fill: 'rgba(110,90,50,0.32)', edge: 'rgba(170,140,80,0.45)', icon: 'g:swamp', tint: '#a68a52' },
  dangerous: { fill: 'rgba(150,40,30,0.2)', edge: 'rgba(240,90,60,0.6)', icon: 'g:fire', tint: '#e0603c' },
};

/** Golden-angle offsets for a squad's models (unit circle), so a cluster always looks the same. */
/** The player's units are drawn this much larger than their footing. */
const UNIT = 1.25;
/** A squad model's width in inches: big bodies, a lone Tough(3+) model at twice a trooper's old size, then troopers. */
const modelInches = (s: Squad, big: boolean) => (big ? 2.4 * UNIT : s.size === 1 && s.tough >= 3 ? 1.25 * 2 : 1.25 * UNIT);

const CLUSTER = Array.from({ length: 24 }, (_, i) => {
  const r = Math.sqrt(i + 0.5) / Math.sqrt(24);
  const a = i * 2.39996;
  return [Math.cos(a) * r, Math.sin(a) * r];
});

/** Draw one frame. `blend` (0–1) eases the hero between steps; `now` is wall seconds (for pulsing). */
/** Seconds a body flashes white when hit, and the colour of a kill's sparks. */
const HIT_FLASH = 0.09;
const FOE_SPARK = '255,120,90';

/** A hex colour `k` of the way to another. */
function blend(a: string, b: string, k: number): string {
  const [p, q] = [parseInt(a.slice(1), 16), parseInt(b.slice(1), 16)];
  const c = (s: number) => Math.round(((p >> s) & 255) + (((q >> s) & 255) - ((p >> s) & 255)) * k);
  return `#${((c(16) << 16) | (c(8) << 8) | c(0)).toString(16).padStart(6, '0')}`;
}

/** The swarm's colours by tier, plain and shooting: the book's colour, then hotter as the mix steps tougher, so the field
 *  itself shows harder bodies arriving. */
function foeTints(foe: string): { melee: string[]; shoots: string[] } {
  const melee = [foe, '#ee5cb4', '#ff4242'];
  return { melee, shoots: melee.map((c) => blend(c, SHOOTER, 0.35)) };
}

export function drawWarpath(ctx: CanvasRenderingContext2D, run: WarpathRun, v: View, pal: Palette, now: number) {
  const { ppi, w, h } = v;
  const sx = (x: number) => (x - v.cx) * ppi + w / 2;
  const sy = (y: number) => (y - v.cy) * ppi + h / 2;
  const halfW = w / 2 / ppi + 4;
  const halfH = h / 2 / ppi + 4;
  const inView = (x: number, y: number, pad = 0) => Math.abs(x - v.cx) < halfW + pad && Math.abs(y - v.cy) < halfH + pad;

  // Everything on the field shakes with it; pointers, numbers and the banner hold still.
  const jolt = shakeOf(run, now);
  ctx.save();
  ctx.translate(jolt.x, jolt.y);

  // Ground and a 6" grid, so moving reads even on open ground.
  ctx.fillStyle = '#16171c';
  ctx.fillRect(-20, -20, w + 40, h + 40);
  ground(ctx, v.cx, v.cy, ppi, w, h);
  ctx.globalAlpha = FX;
  dusk(ctx, run, w, h);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  const g = 6;
  for (let x = Math.floor((v.cx - halfW) / g) * g; x < v.cx + halfW; x += g) { ctx.moveTo(sx(x), 0); ctx.lineTo(sx(x), h); }
  for (let y = Math.floor((v.cy - halfH) / g) * g; y < v.cy + halfH; y += g) { ctx.moveTo(0, sy(y)); ctx.lineTo(w, sy(y)); }
  ctx.stroke();

  // Terrain.
  for (const t of terrainNear(run.seed, v.cx - halfW - 8, v.cy - halfH - 8, v.cx + halfW + 8, v.cy + halfH + 8)) {
    const st = TERRAIN[t.kind];
    const x = sx(t.x);
    const y = sy(t.y);
    const R = t.r * ppi;
    const seed = t.x * 0.37 + t.y * 0.61;
    if (t.kind === 'block') {
      // A boulder: a shadow, the rock, and a paler top. It fills the circle bodies stop at.
      blob(ctx, x + R * 0.06, y + R * 0.14, R, seed, 0.07, true);
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fill();
      blob(ctx, x, y, R, seed, 0.07, true);
      ctx.fillStyle = st.fill;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = st.edge;
      ctx.stroke();
      blob(ctx, x - R * 0.1, y - R * 0.14, R * 0.68, seed + 2, 0.1, true);
      ctx.fillStyle = st.tint;
      ctx.fill();
      continue;
    }
    blob(ctx, x, y, R, seed, 0.06);
    ctx.fillStyle = st.fill;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = st.edge;
    ctx.stroke();
    const n = Math.min(4, Math.round(t.r / 2));
    ctx.globalAlpha = 0.75;
    for (let i = 0; i < n; i++) {
      const [ox, oy] = n === 1 ? [0, 0] : CLUSTER[(i * 5 + t.icon) % 24];
      stamp(ctx, st.icon, st.tint, sx(t.x + ox * t.r * 0.6), sy(t.y + oy * t.r * 0.6), 2.2 * ppi);
    }
    ctx.globalAlpha = 1;
  }

  ctx.globalAlpha = FX;
  motes(ctx, run, v.cx * ppi, v.cy * ppi, w, h, now);
  ctx.globalAlpha = 1;

  // Sites: a ring on the ground and the site's mark (a shrine fills as it's held).
  for (const st of run.sites ?? []) {
    if (!inView(st.x, st.y, 6)) continue;
    const [icon, col] = SITE[st.kind];
    const x = sx(st.x);
    const y = sy(st.y);
    const R = WARPATH.sites.radius * ppi;
    const pulse = 0.5 + 0.5 * Math.sin(now * 2.5 + st.id);
    ctx.beginPath();
    ctx.arc(x, y, R, 0, Math.PI * 2);
    ctx.fillStyle = alpha(col, 0.08 + 0.06 * pulse);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.strokeStyle = alpha(col, 0.75);
    ctx.stroke();
    ctx.setLineDash([]);
    if (st.kind !== 'champion' && st.held > 0) {
      ctx.beginPath();
      ctx.arc(x, y, R, -Math.PI / 2, -Math.PI / 2 + Math.min(1, st.held / holdOf(st.kind, run)) * Math.PI * 2);
      ctx.lineWidth = 5;
      ctx.strokeStyle = col;
      ctx.stroke();
    }
    if (st.kind !== 'champion') stamp(ctx, icon, col, x, y - Math.sin(now * 3 + st.id) * 0.15 * ppi, 2.6 * ppi, 8);
    number(ctx, st.kind === 'champion' ? SITE_NAMES[st.kind] : `${SITE_NAMES[st.kind]}: stand in it`, x, y + R + 10, 13, col);
  }

  // Pickups.
  for (const p of run.pickups) {
    if (!inView(p.x, p.y)) continue;
    if (p.kind === 'gem') {
      const tier = p.xp >= 8 ? 3 : p.xp >= 4 ? 2 : p.xp >= 2 ? 1 : 0;
      const r = (0.32 + tier * 0.08) * ppi;
      const x = sx(p.x);
      const y = sy(p.y);
      const shine = 1.75 + 0.3 * Math.sin(now * 5 + p.id);
      ctx.fillStyle = GEM_COLOR[tier];
      ctx.globalAlpha = 0.2;
      ctx.beginPath();
      ctx.moveTo(x, y - r * 1.3 * shine); ctx.lineTo(x + r * shine, y); ctx.lineTo(x, y + r * 1.3 * shine); ctx.lineTo(x - r * shine, y);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.moveTo(x, y - r * 1.3); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r * 1.3); ctx.lineTo(x - r, y);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath();
      ctx.moveTo(x, y - r * 1.1); ctx.lineTo(x + r * 0.45, y - r * 0.15); ctx.lineTo(x - r * 0.45, y - r * 0.15);
      ctx.closePath();
      ctx.fill();
    } else {
      const [icon, col] = PICKUP[p.kind];
      const bob = Math.sin(now * 4 + p.id) * 0.15;
      stamp(ctx, icon, col, sx(p.x), sy(p.y + bob), 1.8 * ppi, 6);
    }
  }

  // Blast markers wait on the ground (filling as the fuse burns down); shots fly.
  for (const m of run.missiles) {
    if (!inView(m.x, m.y, 4)) continue;
    if (m.blast) {
      const R = (m.radius ?? WARPATH.enemy.blastRadius) * ppi;
      const k = 1 - Math.max(0, m.life) / (m.fuse ?? WARPATH.enemy.blastFuse);
      ctx.beginPath();
      ctx.arc(sx(m.x), sy(m.y), R, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,70,50,${0.1 + 0.25 * k})`;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255,110,80,0.9)';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(sx(m.x), sy(m.y), R * k, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,200,160,0.8)';
      ctx.stroke();
    } else {
      const x = sx(m.x);
      const y = sy(m.y);
      const sp = Math.hypot(m.vx, m.vy) || 1;
      ctx.strokeStyle = 'rgba(255,150,70,0.55)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x - (m.vx / sp) * ppi * 1.6, y - (m.vy / sp) * ppi * 1.6);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.fillStyle = '#ffb347';
      ctx.beginPath();
      ctx.arc(x, y, Math.max(2.5, WARPATH.enemy.shotRadius * ppi * 0.5), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // The swarm: shooters winding up show a line to where they aim; hurt bodies flash pale.
  const kinds = run.enemyKinds;
  const tints = foeTints(pal.foe);
  // Shells on the way down: a crosshair closing on where they land.
  for (const sh of run.shells ?? []) {
    if (!inView(sh.x, sh.y, 4)) continue;
    const k = 1 - sh.t / WARPATH.roles.shellTime;
    const r = (1.6 - k) * ppi;
    const x = sx(sh.x);
    const y = sy(sh.y);
    ctx.strokeStyle = `rgba(255,179,71,${0.35 + 0.5 * k})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.moveTo(x - r * 1.3, y);
    ctx.lineTo(x + r * 1.3, y);
    ctx.moveTo(x, y - r * 1.3);
    ctx.lineTo(x, y + r * 1.3);
    ctx.stroke();
  }

  for (const e of run.enemies) {
    if (!inView(e.x, e.y, e.size)) continue;
    const k = kinds[e.kind];
    const px = (e.boss ? e.size : k.size) * ppi;
    const x = sx(e.x);
    const y = sy(e.y);
    // Coming out of the ground: a ring closes, then it's there.
    if (e.emerge) {
      const q = 1 - e.emerge / WARPATH.foes.emerge;
      ctx.beginPath();
      ctx.arc(x, y, px * (1.6 - q), 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255,90,70,${0.4 + 0.5 * q})`;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.globalAlpha = 0.25 + 0.5 * q;
      stamp(ctx, k.icon as IconName, tints.melee[k.tier] ?? pal.foe, x, y, px * Math.max(0.3, q), 0);
      ctx.globalAlpha = 1;
      continue;
    }
    // A lunge winding up: a thin lane along its path, filling from the body as the moment comes.
    if (e.dash && !e.dash.go) {
      const len = Math.hypot(e.dash.x - e.x, e.dash.y - e.y) * ppi;
      const q = Math.max(0, 1 - e.dash.t / WARPATH.foes.lungeWind);
      const half = Math.max(2.5, px * 0.26);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.atan2(e.dash.y - e.y, e.dash.x - e.x));
      ctx.fillStyle = `rgba(255,90,60,${0.14 + 0.2 * q})`;
      ctx.fillRect(0, -half, len * q, half * 2);
      ctx.lineWidth = 1;
      ctx.strokeStyle = `rgba(255,120,90,${0.3 + 0.4 * q})`;
      ctx.strokeRect(0, -half, len, half * 2);
      ctx.restore();
    }
    // Fliers cast a shadow; fuses flicker.
    if (k.ways?.flies) {
      ctx.beginPath();
      ctx.ellipse(x + px * 0.2, y + px * 0.55, px * 0.42, px * 0.2, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fill();
    }
    if (k.ways?.fuse && !e.boss && Math.sin(now * 12 + e.id) > 0.3) {
      ctx.beginPath();
      ctx.arc(x, y, px * 0.6, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,160,60,0.3)';
      ctx.fill();
    }
    if (e.aim > 0) {
      ctx.strokeStyle = `rgba(255,120,80,${0.25 + 0.5 * (1 - e.aim / WARPATH.enemy.windUp)})`;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(sx(e.tx), sy(e.ty));
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (e.boss) {
      const pulse = 0.5 + 0.5 * Math.sin(now * 3);
      ctx.beginPath();
      ctx.arc(x, y, px * (0.7 + 0.08 * pulse), 0, Math.PI * 2);
      ctx.fillStyle = alpha(e.boss === 'lord' ? '#ff4fd8' : '#ffb000', 0.18 + 0.12 * pulse);
      ctx.fill();
      if (e.lord?.ward) {
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(140,200,255,0.8)';
        ctx.stroke();
      }
    }
    if (e.champ !== undefined) {
      // A champion's gold ring. Plain elites come in hundreds late on, so theirs is only a hairline.
      ctx.beginPath();
      ctx.arc(x, y, px * 0.62, 0, Math.PI * 2);
      ctx.fillStyle = alpha(ELITE, 0.22);
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = alpha(ELITE, 0.9);
      ctx.stroke();
    } else if (e.elite) {
      ctx.beginPath();
      ctx.arc(x, y, px * 0.56, 0, Math.PI * 2);
      ctx.lineWidth = 1;
      ctx.strokeStyle = alpha(ELITE, 0.25);
      ctx.stroke();
    }
    const col = e.boss === 'lord' ? '#ff7ae6' : e.boss ? '#ffc94d' : e.status.stun ? '#9fb4ff' : e.status.bleed ? '#ff6a6a' : (e.shoots ? tints.shoots : tints.melee)[k.tier] ?? pal.foe;
    const look = (e.boss ? (e.boss === 'lord' ? 'g:dread-skull' : 'g:crowned-skull') : k.icon) as IconName;
    stamp(ctx, look, col, x, y, px, e.boss ? 10 : 0);
    // Just hit: a white flash.
    if (e.hitT !== undefined && run.t - e.hitT < HIT_FLASH) {
      ctx.globalAlpha = 0.7 * FX * (1 - (run.t - e.hitT) / HIT_FLASH);
      stamp(ctx, look, '#ffffff', x, y, px, 0);
      ctx.globalAlpha = 1;
    }
    if (e.boss || e.hp < e.maxHp) {
      const named = e.boss || e.champ !== undefined;
      if (named || e.elite || px > 14) bar(ctx, x - px / 2, y + px * 0.55, px, e.hp / e.maxHp, e.boss ? '#ff5a4a' : named ? ELITE : '#c8c8d0', named ? 5 : 2);
    }
  }

  // The force: each squad's standing models round its anchor (a fort as one tower with its own HP bar).
  for (let si = run.squads.length - 1; si >= 1; si--) {
    const s = run.squads[si];
    if (!inView(s.x, s.y, 6)) continue;
    const icon = squadIcon(s);
    if (s.fort) {
      const f = s.fort;
      if (f.down > 0 && f.hp <= 0) continue;
      if (f.down > 0) continue;
      if (f.fall > 0) {
        // Falling: a shadow that grows and the tower dropping in from above.
        const k = 1 - f.fall / 1.2;
        ctx.beginPath();
        ctx.ellipse(sx(s.x), sy(s.y), 1.6 * UNIT * ppi * k, 0.8 * UNIT * ppi * k, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fill();
        stampUnit(ctx, pal, s, icon, pal.own, sx(s.x), sy(s.y) - (1 - k) * h * 0.6, 3.2 * UNIT * ppi);
        continue;
      }
      ctx.beginPath();
      ctx.arc(sx(s.x), sy(s.y), 2.4 * UNIT * ppi, 0, Math.PI * 2);
      ctx.fillStyle = alpha(ROLES.fortress.color, 0.16);
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = alpha(ROLES.fortress.color, 0.7);
      ctx.stroke();
      stampUnit(ctx, pal, s, icon, pal.own, sx(s.x), sy(s.y), 3.2 * UNIT * ppi, 4);
      bar(ctx, sx(s.x) - 1.6 * UNIT * ppi, sy(s.y) + 1.9 * UNIT * ppi, 3.2 * UNIT * ppi, f.hp / f.maxHp, undefined, 4);
      continue;
    }
    if (!onField(s)) continue;
    const roleId = roleOf(s);
    const role = ROLES[roleId];
    // What it's up to: a streak on a charge, a shadow under a flyer, a glow on a boon.
    if (s.rush) {
      const a = Math.atan2(s.rush.y - s.y, s.rush.x - s.x);
      ctx.strokeStyle = alpha(role.color, 0.55 * FX);
      ctx.lineCap = 'round';
      ctx.lineWidth = 2.4 * UNIT * ppi;
      ctx.beginPath();
      ctx.moveTo(sx(s.x), sy(s.y));
      ctx.lineTo(sx(s.x) - Math.cos(a) * 5 * ppi, sy(s.y) - Math.sin(a) * 5 * ppi);
      ctx.stroke();
      ctx.lineCap = 'butt';
    }
    if (roleId === 'flyer') {
      ctx.beginPath();
      ctx.ellipse(sx(s.x) + ppi, sy(s.y) + 1.6 * ppi, 1.7 * ppi, 0.7 * ppi, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fill();
    }
    if (s.boon && Object.values(s.boon).some((t) => (t ?? 0) > 0)) {
      ctx.beginPath();
      ctx.arc(sx(s.x), sy(s.y), (2.6 * UNIT + 0.2 * Math.sin(now * 5)) * ppi, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(126,224,126,0.5)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    const big = s.kind === 'heavy' || s.kind === 'artillery' || s.kind === 'air';
    const px = modelInches(s, big) * ppi;
    const spread = (big ? 1.2 + s.size * 0.5 : 0.9 + Math.sqrt(s.size) * 0.75) * UNIT;
    // In cover: a faint dashed ring round the squad (+1 Defense).
    if (s.kind !== 'air' && inCover(run.seed, s.x, s.y)) {
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(126, 224, 126, 0.55)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx(s.x), sy(s.y), (spread + 0.8) * ppi, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    // Its archetype on the ground: a base in its colour and its mark on the rim, so a glance tells them apart.
    const steady = (s.held ?? 0) >= WARPATH.roles.holdAfter;
    const base = Math.sqrt((Math.min(s.alive, CLUSTER.length) - 0.5) / CLUSTER.length) * spread * ppi + px * 0.75;
    const baseAt = sy(s.y);
    ctx.beginPath();
    ctx.arc(sx(s.x), baseAt, base, 0, Math.PI * 2);
    ctx.fillStyle = alpha(role.color, steady ? 0.26 : 0.16);
    ctx.fill();
    ctx.lineWidth = steady ? 2.5 : 1.5;
    ctx.strokeStyle = alpha(role.color, steady ? 0.95 : 0.7);
    ctx.stroke();
    let top = 0;
    for (let i = 0; i < s.alive && i < CLUSTER.length; i++) {
      const [ox, oy] = CLUSTER[i];
      top = Math.min(top, oy * spread);
      stampUnit(ctx, pal, s, icon, pal.own, sx(s.x + ox * spread), sy(s.y + oy * spread), px);
    }
    if (s.alive < s.size) {
      // Strength just above the topmost model standing.
      const y = sy(s.y + top) - px / 2 - 6;
      bar(ctx, sx(s.x) - ppi * 1.5, y, ppi * 3, s.alive / s.size, '#8fc7ff', 3);
    }
    // Its mark: a small badge on the base's rim, dark so it can't be taken for a model.
    const mark = Math.max(13, 1.05 * ppi);
    const markX = sx(s.x) + base * 0.72;
    const markY = baseAt + base * 0.72;
    ctx.beginPath();
    ctx.arc(markX, markY, mark * 0.68, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(12,13,17,0.9)';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = role.color;
    ctx.stroke();
    stamp(ctx, role.icon as IconName, role.color, markX, markY, mark * 0.9);
  }

  // Fx under the hero: shot lines, melee arcs, rings.
  ctx.globalAlpha = FX;
  for (const f of run.fx) {
    if (!inView(f.x, f.y, 30)) continue;
    const x = sx(f.x);
    const y = sy(f.y);
    if ((f.kind === 'shot' || f.kind === 'relic') && f.x2 !== undefined && f.y2 !== undefined) {
      ctx.strokeStyle = f.kind === 'relic' ? `rgba(255,215,90,${Math.min(1, f.t * 8)})` : f.hero ? `rgba(255,240,170,${Math.min(1, f.t * 6)})` : `rgba(170,220,255,${Math.min(0.8, f.t * 5)})`;
      ctx.lineWidth = f.crit ? 2.5 : 1.3;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(sx(f.x2), sy(f.y2));
      ctx.stroke();
      // A soft glow down the tracer and a spark where it lands.
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.28 * FX;
      ctx.lineWidth = f.crit ? 7 : 4;
      ctx.stroke();
      ctx.globalAlpha = FX;
      ctx.fillStyle = ctx.strokeStyle;
      ctx.beginPath();
      ctx.arc(sx(f.x2), sy(f.y2), Math.max(2, ppi * (f.crit ? 0.3 : 0.18)), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    } else if (f.kind === 'melee' && f.x2 !== undefined && f.y2 !== undefined) {
      // A blow, as in Training: a yellow half-circle swipe across the target from the striker's side, with sparks
      // flying on through it.
      const tx = sx(f.x2);
      const ty = sy(f.y2);
      const a = Math.atan2(ty - y, tx - x);
      const done = 1 - f.t / 0.25;
      const r = 0.9 * ppi;
      const from = a + Math.PI - 1.4;
      ctx.strokeStyle = `rgba(255,214,90,${Math.min(1, f.t * 6)})`;
      ctx.lineCap = 'round';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(tx, ty, r, from, from + 2.8 * Math.min(1, done * 2.5));
      ctx.stroke();
      ctx.lineWidth = 1.5;
      for (const k of [-0.6, 0, 0.6]) {
        const d = a + k;
        const r1 = ppi * (0.25 + done * 0.4);
        ctx.beginPath();
        ctx.moveTo(tx + Math.cos(d) * r1, ty + Math.sin(d) * r1);
        ctx.lineTo(tx + Math.cos(d) * (r1 + ppi * 0.35), ty + Math.sin(d) * (r1 + ppi * 0.35));
        ctx.stroke();
      }
      ctx.lineCap = 'butt';
    } else if (f.kind === 'boom' || f.kind === 'land' || f.kind === 'spell') {
      const k = 1 - Math.min(1, f.t / 0.6);
      const R = (f.n ?? 3) * ppi * (0.4 + 0.6 * k);
      ctx.beginPath();
      ctx.arc(x, y, R, 0, Math.PI * 2);
      const col = f.kind === 'spell' ? '160,120,255' : f.kind === 'land' ? '200,200,200' : '255,150,60';
      ctx.fillStyle = `rgba(${col},${0.25 * (1 - k)})`;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = `rgba(${col},${0.8 * (1 - k)})`;
      ctx.stroke();
      blastCore(ctx, f, x, y, ppi);
    } else if (f.kind === 'dash' && f.x2 !== undefined && f.y2 !== undefined) {
      ctx.strokeStyle = `rgba(255,170,100,${Math.min(0.6, f.t * 2)})`;
      ctx.lineWidth = 1.4 * ppi * Math.min(1, f.t * 3);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(sx(f.x2), sy(f.y2));
      ctx.stroke();
      ctx.lineCap = 'butt';
    } else if (f.kind === 'boon') {
      const k = 1 - f.t / 0.6;
      ctx.beginPath();
      ctx.arc(x, y, (f.n ?? 2) * ppi * (0.5 + k), 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(150,240,150,${0.8 * (1 - k)})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    } else if (f.kind === 'ward') {
      // A hit shrugged off: a small shield glint.
      const k = 1 - f.t / 0.3;
      ctx.beginPath();
      ctx.arc(x, y - ppi * 0.4, ppi * (0.5 + 0.4 * k), -2.4, -0.7);
      ctx.strokeStyle = `rgba(170,225,255,${1 - k})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  pops(ctx, run, sx, sy, (x, y) => inView(x, y, 2), ppi, FOE_SPARK);
  ctx.globalAlpha = 1;

  // The hero: a ring, its facing, the icon, and a pickup-reach hint.
  const hx = sx(run.hx);
  const hy = sy(run.hy);
  const hit = run.iframes > 0;
  const rushing = run.squads[0].rush;
  const hu = ppi * UNIT;
  if (rushing) {
    const a = Math.atan2(rushing.y - run.hy, rushing.x - run.hx);
    ctx.strokeStyle = `rgba(255,215,90,${0.5 * FX})`;
    ctx.lineCap = 'round';
    ctx.lineWidth = 3 * hu;
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(hx - Math.cos(a) * 6 * ppi, hy - Math.sin(a) * 6 * ppi);
    ctx.stroke();
    ctx.lineCap = 'butt';
    // Afterimages down the line of the charge.
    for (let i = 3; i >= 1; i--) {
      ctx.globalAlpha = (0.34 - i * 0.08) * FX;
      stampUnit(ctx, pal, run.squads[0], squadIcon(run.squads[0]), '#ffe08a', hx - Math.cos(a) * i * 1.8 * ppi, hy - Math.sin(a) * i * 1.8 * ppi, 2.4 * hu, 0);
    }
    ctx.globalAlpha = 1;
  }
  heroAura(ctx, hx, hy, hu, atWill(run) ? '#ffd166' : ROLES[roleOf(run.squads[0])].color, now);
  ctx.globalAlpha = FX;
  spreeArc(ctx, run, hx, hy, hu);
  blades(ctx, run, sx, sy, ppi, now);
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.arc(hx, hy, 1.6 * hu, 0, Math.PI * 2);
  ctx.fillStyle = hit ? 'rgba(255,255,255,0.3)' : 'rgba(255,215,90,0.16)';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,215,90,0.75)';
  ctx.stroke();
  if (hymn(run)) {
    ctx.beginPath();
    ctx.arc(hx, hy, (2.4 + 0.2 * Math.sin(now * 8)) * hu, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(201,166,255,0.8)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  if (run.shield && run.shield > 0) {
    ctx.beginPath();
    ctx.arc(hx, hy, 2 * hu, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(120,200,255,0.85)';
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,215,90,0.9)';
  ctx.beginPath();
  const fa = run.face;
  ctx.moveTo(hx + Math.cos(fa) * 2.3 * hu, hy + Math.sin(fa) * 2.3 * hu);
  ctx.lineTo(hx + Math.cos(fa + 0.35) * 1.75 * hu, hy + Math.sin(fa + 0.35) * 1.75 * hu);
  ctx.lineTo(hx + Math.cos(fa - 0.35) * 1.75 * hu, hy + Math.sin(fa - 0.35) * 1.75 * hu);
  ctx.closePath();
  ctx.fill();
  stampUnit(ctx, pal, run.squads[0], squadIcon(run.squads[0]), hit ? '#ffffff' : '#ffe08a', hx, hy, 2.4 * hu, 8);
  bar(ctx, hx - 1.6 * hu, hy + 1.9 * hu, 3.2 * hu, run.hp / run.maxHp, undefined, 4);

  // The big moments, over everything on the field.
  ctx.globalAlpha = FX;
  for (const f of run.fx) {
    if (f.kind === 'level') levelBurst(ctx, f, hx, hy, ppi);
    else if (f.kind === 'fall') bossFall(ctx, f, sx(f.x), sy(f.y), ppi, w, h);
  }
  ctx.restore();
  ctx.globalAlpha = FX;
  lowHp(ctx, run, w, h, now);
  ctx.globalAlpha = 1;

  // Bosses off the screen: a pointer on the edge, toward them.
  for (const e of run.enemies) {
    if (!e.boss || inView(e.x, e.y, -4)) continue;
    const dx = e.x - v.cx;
    const dy = e.y - v.cy;
    const a = Math.atan2(dy, dx);
    const m = 26;
    const k = Math.min((w / 2 - m) / Math.max(1e-6, Math.abs(Math.cos(a))), (h / 2 - m) / Math.max(1e-6, Math.abs(Math.sin(a))));
    const px = w / 2 + Math.cos(a) * k;
    const py = h / 2 + Math.sin(a) * k;
    const col = e.boss === 'lord' ? '#ff7ae6' : '#ffc94d';
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.moveTo(14, 0);
    ctx.lineTo(-4, -10);
    ctx.lineTo(-4, 10);
    ctx.closePath();
    ctx.fillStyle = col;
    ctx.globalAlpha = 0.7 + 0.3 * Math.sin(now * 6);
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
    stamp(ctx, e.boss === 'lord' ? 'g:dread-skull' : 'g:crowned-skull', col, px - Math.cos(a) * 22, py - Math.sin(a) * 22, 22);
  }

  // Sites off the screen: a small pointer on the edge in the site's colour, so there's somewhere to head for.
  for (const st of run.sites ?? []) {
    if (inView(st.x, st.y, -4)) continue;
    const a = Math.atan2(st.y - v.cy, st.x - v.cx);
    const m = 22;
    const k = Math.min((w / 2 - m) / Math.max(1e-6, Math.abs(Math.cos(a))), (h / 2 - m) / Math.max(1e-6, Math.abs(Math.sin(a))));
    const px = w / 2 + Math.cos(a) * k;
    const py = h / 2 + Math.sin(a) * k;
    const [icon, col] = SITE[st.kind];
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.lineTo(-3, -7);
    ctx.lineTo(-3, 7);
    ctx.closePath();
    ctx.fillStyle = col;
    ctx.fill();
    ctx.restore();
    stamp(ctx, icon, col, px - Math.cos(a) * 17, py - Math.sin(a) * 17, 18);
  }

  // A column on its way: the edge it comes from glows red.
  if (run.horde) {
    const a = run.horde.a;
    const k = 0.5 + 0.5 * Math.sin(now * 10);
    if (run.horde.kind === 'ring') {
      ctx.lineWidth = 10;
      ctx.strokeStyle = `rgba(255,60,40,${0.25 + 0.35 * k})`;
      ctx.strokeRect(5, 5, w - 10, h - 10);
    } else {
      const g = ctx.createRadialGradient(w / 2 + Math.cos(a) * w * 0.6, h / 2 + Math.sin(a) * h * 0.6, 0, w / 2 + Math.cos(a) * w * 0.6, h / 2 + Math.sin(a) * h * 0.6, Math.max(w, h) * 0.45);
      g.addColorStop(0, `rgba(255,60,40,${0.35 + 0.3 * k})`);
      g.addColorStop(1, 'rgba(255,60,40,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
  }

  // Floating numbers on top.
  for (const f of run.fx) {
    if ((f.kind !== 'dmg' && f.kind !== 'heal') || !inView(f.x, f.y)) continue;
    const rise = (0.8 - f.t) * 2.5;
    // Chip damage stays on but steps back, so the hits that matter stand out of the stack.
    const chip = f.kind === 'dmg' && !f.hurt && !f.crit && !f.hero && (f.n ?? 0) < 3;
    ctx.globalAlpha = Math.min(1, f.t * 3) * FX * (chip ? 0.6 : 1);
    const col = f.kind === 'heal' ? '#7ee07e' : f.hurt ? '#ff5a4a' : f.crit ? '#ffd166' : f.hero ? '#ffe9a8' : '#e6e6e6';
    number(ctx, f.kind === 'heal' ? `+${Math.round(f.n ?? 0)}` : `${f.hurt ? '-' : ''}${Math.round(f.n ?? 0)}`, sx(f.x), sy(f.y - rise), chip ? Math.max(10, 0.7 * ppi) : Math.max(f.hurt ? 18 : 13, (f.hurt ? 1.6 : f.crit ? 1.35 : 1) * ppi), col);
    ctx.globalAlpha = 1;
  }

  // The banner: a horde coming, a site taken.
  if (run.banner) {
    const b = run.banner;
    ctx.globalAlpha = Math.min(1, b.t * 2);
    plate(ctx, b.text, w / 2, Math.min(150, h * 0.22), Math.max(17, Math.min(26, w / 38)), b.tone === 'warn' ? '#ff8a6a' : '#c9f5a0', Math.min(w - 48, 680));
    ctx.globalAlpha = 1;
  }
}
