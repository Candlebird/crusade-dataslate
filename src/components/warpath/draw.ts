import { holdOf, hymn, inCover, onField, SITE_NAMES, terrainNear, WARPATH, type SiteKind, type Squad, type WarpathRun } from '../../rules/warpath';
import type { IconName } from '../iconData';
import { ICONS } from '../iconData';
import { alpha, bar } from '../training/art';
import type { EmblemLayer } from '../../model/types';
import { drawEmblem } from '../Emblem';

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

/** A floating number: bold, with a dark outline so it reads over the swarm. */
function number(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, px: number, color: string) {
  const size = Math.round(px);
  ctx.font = `bold ${size}px Rajdhani, 'Segoe UI', system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(3, size / 5);
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
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
const GEM_COLOR = ['#6fd3ff', '#7ee07e', '#ffd166', '#ff7ad9'];
const TERRAIN: Record<string, { fill: string; edge: string; icon: IconName; tint: string }> = {
  block: { fill: '#2b2a30', edge: '#5b5866', icon: 'g:rock', tint: '#77738a' },
  cover: { fill: 'rgba(60,110,60,0.35)', edge: 'rgba(120,190,110,0.55)', icon: 'g:berry-bush', tint: '#6fae66' },
  difficult: { fill: 'rgba(110,90,50,0.32)', edge: 'rgba(170,140,80,0.45)', icon: 'g:swamp', tint: '#a68a52' },
  dangerous: { fill: 'rgba(150,40,30,0.30)', edge: 'rgba(240,90,60,0.6)', icon: 'g:fire', tint: '#e0603c' },
};

/** Golden-angle offsets for a squad's models (unit circle), so a cluster always looks the same. */
const CLUSTER = Array.from({ length: 24 }, (_, i) => {
  const r = Math.sqrt(i + 0.5) / Math.sqrt(24);
  const a = i * 2.39996;
  return [Math.cos(a) * r, Math.sin(a) * r];
});

/** Draw one frame. `blend` (0–1) eases the hero between steps; `now` is wall seconds (for pulsing). */
export function drawWarpath(ctx: CanvasRenderingContext2D, run: WarpathRun, v: View, pal: Palette, now: number) {
  const { ppi, w, h } = v;
  const sx = (x: number) => (x - v.cx) * ppi + w / 2;
  const sy = (y: number) => (y - v.cy) * ppi + h / 2;
  const halfW = w / 2 / ppi + 4;
  const halfH = h / 2 / ppi + 4;
  const inView = (x: number, y: number, pad = 0) => Math.abs(x - v.cx) < halfW + pad && Math.abs(y - v.cy) < halfH + pad;

  // Ground and a 6" grid, so moving reads even on open ground.
  ctx.fillStyle = '#16171c';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(255,255,255,0.045)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  const g = 6;
  for (let x = Math.floor((v.cx - halfW) / g) * g; x < v.cx + halfW; x += g) { ctx.moveTo(sx(x), 0); ctx.lineTo(sx(x), h); }
  for (let y = Math.floor((v.cy - halfH) / g) * g; y < v.cy + halfH; y += g) { ctx.moveTo(0, sy(y)); ctx.lineTo(w, sy(y)); }
  ctx.stroke();

  // Terrain.
  for (const t of terrainNear(run.seed, v.cx - halfW - 8, v.cy - halfH - 8, v.cx + halfW + 8, v.cy + halfH + 8)) {
    const st = TERRAIN[t.kind];
    ctx.beginPath();
    ctx.arc(sx(t.x), sy(t.y), t.r * ppi, 0, Math.PI * 2);
    ctx.fillStyle = st.fill;
    ctx.fill();
    ctx.lineWidth = t.kind === 'block' ? 3 : 1.5;
    ctx.setLineDash(t.kind === 'block' ? [] : [6, 5]);
    ctx.strokeStyle = st.edge;
    ctx.stroke();
    ctx.setLineDash([]);
    const n = t.kind === 'block' ? 1 : Math.min(4, Math.round(t.r / 2));
    for (let i = 0; i < n; i++) {
      const [ox, oy] = n === 1 ? [0, 0] : CLUSTER[(i * 5 + t.icon) % 24];
      stamp(ctx, st.icon, st.tint, sx(t.x + ox * t.r * 0.6), sy(t.y + oy * t.r * 0.6), (t.kind === 'block' ? t.r * 1.3 : 2.2) * ppi);
    }
  }

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
      ctx.fillStyle = GEM_COLOR[tier];
      ctx.beginPath();
      ctx.moveTo(x, y - r * 1.3); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r * 1.3); ctx.lineTo(x - r, y);
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
      const R = WARPATH.enemy.blastRadius * ppi;
      const k = 1 - Math.max(0, m.life) / WARPATH.enemy.blastFuse;
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
  for (const e of run.enemies) {
    if (!inView(e.x, e.y, e.size)) continue;
    const k = kinds[e.kind];
    const px = (e.boss ? e.size : k.size) * ppi;
    const x = sx(e.x);
    const y = sy(e.y);
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
    if (e.elite) {
      // An elite's gold rim (a champion's brighter, with a bar).
      ctx.beginPath();
      ctx.arc(x, y, px * 0.62, 0, Math.PI * 2);
      ctx.fillStyle = alpha(ELITE, e.champ !== undefined ? 0.22 : 0.12);
      ctx.fill();
      ctx.lineWidth = e.champ !== undefined ? 3 : 2;
      ctx.strokeStyle = alpha(ELITE, 0.9);
      ctx.stroke();
    }
    const col = e.boss === 'lord' ? '#ff7ae6' : e.boss ? '#ffc94d' : e.status.stun ? '#9fb4ff' : e.status.bleed ? '#ff6a6a' : pal.foe;
    stamp(ctx, (e.boss ? (e.boss === 'lord' ? 'g:dread-skull' : 'g:crowned-skull') : k.icon) as IconName, col, x, y, px, e.boss ? 10 : 0);
    if (e.boss || e.hp < e.maxHp) {
      if (e.boss || e.elite || px > 14) bar(ctx, x - px / 2, y + px * 0.55, px, e.hp / e.maxHp, e.boss ? '#ff5a4a' : e.elite ? ELITE : undefined, e.boss || e.champ !== undefined ? 5 : 3);
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
        ctx.ellipse(sx(s.x), sy(s.y), 1.6 * ppi * k, 0.8 * ppi * k, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fill();
        stampUnit(ctx, pal, s, icon, pal.own, sx(s.x), sy(s.y) - (1 - k) * h * 0.6, 3.2 * ppi);
        continue;
      }
      stampUnit(ctx, pal, s, icon, pal.own, sx(s.x), sy(s.y), 3.2 * ppi, 4);
      bar(ctx, sx(s.x) - 1.6 * ppi, sy(s.y) + 1.9 * ppi, 3.2 * ppi, f.hp / f.maxHp, undefined, 4);
      continue;
    }
    if (!onField(s)) continue;
    const big = s.kind === 'heavy' || s.kind === 'artillery' || s.kind === 'air';
    const px = (big ? 2.4 : 1.25) * ppi;
    const spread = big ? 1.2 + s.size * 0.5 : 0.9 + Math.sqrt(s.size) * 0.75;
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
  }

  // Fx under the hero: shot lines, melee arcs, rings.
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
    }
  }

  // The hero: a ring, its facing, the icon, and a pickup-reach hint.
  const hx = sx(run.hx);
  const hy = sy(run.hy);
  const hit = run.iframes > 0;
  ctx.beginPath();
  ctx.arc(hx, hy, 1.6 * ppi, 0, Math.PI * 2);
  ctx.fillStyle = hit ? 'rgba(255,255,255,0.3)' : 'rgba(255,215,90,0.16)';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,215,90,0.75)';
  ctx.stroke();
  if (hymn(run)) {
    ctx.beginPath();
    ctx.arc(hx, hy, (2.4 + 0.2 * Math.sin(now * 8)) * ppi, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(201,166,255,0.8)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  if (run.shield && run.shield > 0) {
    ctx.beginPath();
    ctx.arc(hx, hy, 2 * ppi, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(120,200,255,0.85)';
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,215,90,0.9)';
  ctx.beginPath();
  const fa = run.face;
  ctx.moveTo(hx + Math.cos(fa) * 2.3 * ppi, hy + Math.sin(fa) * 2.3 * ppi);
  ctx.lineTo(hx + Math.cos(fa + 0.35) * 1.75 * ppi, hy + Math.sin(fa + 0.35) * 1.75 * ppi);
  ctx.lineTo(hx + Math.cos(fa - 0.35) * 1.75 * ppi, hy + Math.sin(fa - 0.35) * 1.75 * ppi);
  ctx.closePath();
  ctx.fill();
  stampUnit(ctx, pal, run.squads[0], squadIcon(run.squads[0]), hit ? '#ffffff' : '#ffe08a', hx, hy, 2.4 * ppi, 8);
  bar(ctx, hx - 1.6 * ppi, hy + 1.9 * ppi, 3.2 * ppi, run.hp / run.maxHp, undefined, 4);

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
    const a = Math.min(1, f.t * 3);
    ctx.globalAlpha = a;
    const col = f.kind === 'heal' ? '#7ee07e' : f.hurt ? '#ff5a4a' : f.crit ? '#ffd166' : f.hero ? '#ffe9a8' : '#e6e6e6';
    number(ctx, f.kind === 'heal' ? `+${Math.round(f.n ?? 0)}` : `${f.hurt ? '-' : ''}${Math.round(f.n ?? 0)}`, sx(f.x), sy(f.y - rise), Math.max(f.hurt ? 18 : 13, (f.hurt ? 1.6 : f.crit ? 1.35 : 1) * ppi), col);
    ctx.globalAlpha = 1;
  }

  // The banner: a horde coming, a site taken.
  if (run.banner) {
    const b = run.banner;
    ctx.globalAlpha = Math.min(1, b.t * 2);
    number(ctx, b.text, w / 2, Math.min(130, h * 0.2), Math.max(18, Math.min(30, w / 34)), b.tone === 'warn' ? '#ff6a4a' : '#c9f5a0');
    ctx.globalAlpha = 1;
  }
}
