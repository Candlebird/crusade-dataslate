import { onField, terrainNear, WARPATH, type Squad, type WarpathRun } from '../../rules/warpath';
import type { IconName } from '../iconData';
import { ICONS } from '../iconData';
import { alpha, bar, label } from '../training/art';

// Warpath on a Canvas2D: the field (ground, grid, terrain), pickups, the enemy swarm, the force (each squad's models in
// a loose cluster round its anchor), the hero, shots and blast markers, then floating numbers. Every body is a
// game-icons silhouette drawn once per colour and size into a sprite cache, then stamped with drawImage, which keeps a
// thousand bodies cheap. The spec planned a WebGL2 batcher; Canvas2D sprites held 60 fps in the passes, so it stays.

/** The camera: centre in inches, pixels per inch, canvas size in CSS pixels. */
export interface View { cx: number; cy: number; ppi: number; w: number; h: number }

export interface Palette { own: string; foe: string }

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
  c = document.createElement('canvas');
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
    ctx.shadowBlur = (glow * box) / size;
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
    const col = e.boss === 'lord' ? '#ff7ae6' : e.boss ? '#ffc94d' : e.status.stun ? '#9fb4ff' : e.status.bleed ? '#ff6a6a' : pal.foe;
    stamp(ctx, (e.boss ? (e.boss === 'lord' ? 'g:dread-skull' : 'g:crowned-skull') : k.icon) as IconName, col, x, y, px, e.boss ? 10 : 0);
    if (e.boss || e.hp < e.maxHp) {
      if (e.boss || px > 14) bar(ctx, x - px / 2, y + px * 0.55, px, e.hp / e.maxHp, e.boss ? '#ff5a4a' : undefined, e.boss ? 5 : 3);
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
        stamp(ctx, icon, pal.own, sx(s.x), sy(s.y) - (1 - k) * h * 0.6, 3.2 * ppi);
        continue;
      }
      stamp(ctx, icon, pal.own, sx(s.x), sy(s.y), 3.2 * ppi, 4);
      bar(ctx, sx(s.x) - 1.6 * ppi, sy(s.y) + 1.9 * ppi, 3.2 * ppi, f.hp / f.maxHp, undefined, 4);
      continue;
    }
    if (!onField(s)) continue;
    const big = s.kind === 'heavy' || s.kind === 'artillery' || s.kind === 'air';
    const px = (big ? 2.4 : 1.25) * ppi;
    const spread = big ? 1.2 + s.size * 0.5 : 0.9 + Math.sqrt(s.size) * 0.75;
    for (let i = 0; i < s.alive && i < CLUSTER.length; i++) {
      const [ox, oy] = CLUSTER[i];
      stamp(ctx, icon, pal.own, sx(s.x + ox * spread), sy(s.y + oy * spread), px);
    }
    if (s.alive < s.size) {
      const x = sx(s.x);
      const y = sy(s.y) - (spread + 1.2) * ppi;
      bar(ctx, x - ppi * 1.5, y, ppi * 3, s.alive / s.size, '#8fc7ff', 3);
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
    } else if (f.kind === 'melee') {
      ctx.strokeStyle = `rgba(255,255,255,${Math.min(1, f.t * 5)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 1.2 * ppi, -0.9 + f.t * 6, 0.9 + f.t * 6);
      ctx.stroke();
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
  ctx.fillStyle = hit ? 'rgba(255,80,80,0.35)' : 'rgba(255,215,90,0.16)';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,215,90,0.75)';
  ctx.stroke();
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
  stamp(ctx, squadIcon(run.squads[0]), hit ? '#ff8a7a' : '#ffe08a', hx, hy, 2.4 * ppi, 8);
  bar(ctx, hx - 1.6 * ppi, hy + 1.9 * ppi, 3.2 * ppi, run.hp / run.maxHp, undefined, 4);

  // Floating numbers on top.
  for (const f of run.fx) {
    if ((f.kind !== 'dmg' && f.kind !== 'heal') || !inView(f.x, f.y)) continue;
    const rise = (0.8 - f.t) * 2.5;
    const a = Math.min(1, f.t * 3);
    ctx.globalAlpha = a;
    const col = f.kind === 'heal' ? '#7ee07e' : f.hurt ? '#ff5a4a' : f.crit ? '#ffd166' : f.hero ? '#ffe9a8' : '#e6e6e6';
    label(ctx, f.kind === 'heal' ? `+${Math.round(f.n ?? 0)}` : `${f.hurt ? '-' : ''}${Math.round(f.n ?? 0)}`, sx(f.x), sy(f.y - rise), (f.hurt ? 1.1 : f.crit ? 0.9 : 0.65) * ppi, col);
    ctx.globalAlpha = 1;
  }
}
