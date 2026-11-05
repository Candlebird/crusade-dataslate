import { rand } from '../training/rng';
import { WARPATH } from './data';
import { unblock } from './field';
import { eliteShare, pickKind, spawnEnemy, spawnRate } from './enemies';

/** How long a site must be held. */
export const holdOf = (k: SiteKind, run?: WarpathRun) =>
  (k === 'shrine' ? S.hold : k === 'cache' ? S.cacheHold : k === 'well' ? S.wellHold : 0) * (1 - T.pathfinder * (run ? metaLv(run, 'pathfinder') : 0));
import { clock } from './loot';
import { has, metaLv, TREE_FX as T } from './meta';
import type { HordeLanding, SiteKind, WarpathRun } from './types';

// The run's surprises. Hordes: every so often, after a short warning, a ring of one kind closes round the hero or a
// column charges in from one side. Sites: a shrine to hold, a cache to open, an aid station, a champion holding its
// ground, scattered a way off so there's a reason to go out and not just circle.

const H = WARPATH.horde;
const S = WARPATH.sites;

/** Points of the compass, for the warning. */
const DIRS = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];
const dirOf = (a: number) => DIRS[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8];

export function banner(run: WarpathRun, text: string, tone: 'warn' | 'good', secs = 3): void {
  run.banner = { text, t: secs, tone };
}

/** Announce a horde, then land it `warn` seconds later. */
export function hordeStep(run: WarpathRun): void {
  if (!run.enemyKinds.length) return;
  run.nextHorde ??= H.from;
  if (!run.horde && run.t >= run.nextHorde) {
    const kind = rand(run) < 0.5 ? 'ring' : 'column';
    const a = run.face + (rand(run) - 0.5) * 2;
    const warn = has(run, 'warning') ? T.warnSecs : H.warn;
    run.horde = { at: run.t + warn, kind, a };
    banner(run, kind === 'ring' ? 'A horde closes in from every side!' : `A horde charges from the ${dirOf(a)}!`, 'warn', warn + 1);
    return;
  }
  if (run.landing) return landStep(run, run.landing);
  if (!run.horde || run.t < run.horde.at) return;
  const h = run.horde;
  run.horde = undefined;
  run.nextHorde = run.t + H.min + rand(run) * (H.max - H.min);
  let live = 0;
  for (const e of run.enemies) if (e.hp > 0) live++;
  const n = Math.min(Math.round(Math.max(H.least, Math.round(spawnRate(run) * H.secs)) * (has(run, 'warning') ? T.warnSize : 1)), WARPATH.spawn.maxField + H.over - live);
  if (n <= 0) return;
  const ek = pickKind(run);
  run.landing = { kind: h.kind, a: h.a, n, done: 0, ek, share: eliteShare(run) };
  run.log.push(`${clock(run.t)} A horde of ${n} ${run.enemyKinds[ek].name} (${h.kind === 'ring' ? 'all round' : `from the ${dirOf(h.a)}`}).`);
  landStep(run, run.landing);
}

/** Land the next `batch` of a horde round where the hero is now. */
function landStep(run: WarpathRun, h: HordeLanding): void {
  const { n, ek: kind, share } = h;
  const size = run.enemyKinds[kind].size;
  const end = Math.min(n, h.done + H.batch);
  for (let i = h.done; i < end; i++) {
    let x: number;
    let y: number;
    if (h.kind === 'ring') {
      // Evenly round the hero, two deep.
      const a = (i / n) * Math.PI * 2 * 2 + (i % 2) * 0.05;
      const r = H.ringR + (i % 2) * size * 1.4;
      x = run.hx + Math.cos(a) * r;
      y = run.hy + Math.sin(a) * r;
    } else {
      // A column: a wide front from one side, several ranks deep.
      const front = Math.ceil(Math.sqrt(n * 3));
      const across = ((i % front) - (front - 1) / 2) * size * 1.2;
      const rank = Math.floor(i / front) * size * 1.3;
      const cx = run.hx + Math.cos(h.a) * (WARPATH.spawn.ring + rank);
      const cy = run.hy + Math.sin(h.a) * (WARPATH.spawn.ring + rank);
      x = cx - Math.sin(h.a) * across;
      y = cy + Math.cos(h.a) * across;
    }
    const p = { x, y };
    unblock(run.seed, p, size / 2);
    spawnEnemy(run, kind, p.x, p.y, undefined, rand(run) < share);
  }
  h.done = end;
  if (h.done >= n) run.landing = undefined;
}

/** What each site is called, for banners and the log. */
export const SITE_NAMES: Record<SiteKind, string> = { shrine: 'Shrine', cache: 'Supply cache', well: 'Aid station', champion: 'Champion' };

/** The hardest kind the book fields (not a hero), for a champion. */
function champKind(run: WarpathRun): number {
  let best = -1;
  run.enemyKinds.forEach((k, i) => {
    if (k.hero) return;
    if (best < 0 || k.hp * k.points > run.enemyKinds[best].hp * run.enemyKinds[best].points) best = i;
  });
  return best < 0 ? 0 : best;
}

/** Sites turn up a way off; walking onto one (or holding a shrine) sets it off. A champion's site ends when it falls. */
export function siteStep(run: WarpathRun, dt: number): void {
  run.sites ??= [];
  run.nextSite ??= S.first;
  if (run.t >= run.nextSite) {
    const carto = has(run, 'cartographer');
    run.nextSite = run.t + (carto ? T.cartoEvery : S.every);
    if (run.sites.length < (carto ? T.cartoLive : S.live) && run.enemyKinds.length) {
      const r = rand(run);
      const kind: SiteKind = r < 0.3 ? 'shrine' : r < 0.6 ? 'cache' : r < 0.8 ? 'champion' : 'well';
      const a = rand(run) * Math.PI * 2;
      const d = S.near + rand(run) * (S.far - S.near);
      const p = { x: run.hx + Math.cos(a) * d, y: run.hy + Math.sin(a) * d };
      unblock(run.seed, p, S.radius);
      const site = { id: run.nextId++, kind, x: p.x, y: p.y, held: 0 };
      run.sites.push(site);
      if (kind === 'champion') {
        const e = spawnEnemy(run, champKind(run), p.x, p.y, undefined, true);
        e.hp = e.maxHp = e.maxHp * S.champHp;
        e.size *= 1.5;
        e.guard = site.id;
        e.champ = site.id;
      }
    }
  }
  for (const s of run.sites) {
    const d2 = (run.hx - s.x) ** 2 + (run.hy - s.y) ** 2;
    if (d2 > S.lose ** 2) {
      s.held = -1;
      if (s.kind === 'champion') run.enemies = run.enemies.filter((e) => e.champ !== s.id || e.guard === undefined);
      continue;
    }
    const on = d2 < S.radius ** 2;
    if (s.kind === 'shrine') {
      s.held = on ? s.held + dt : Math.max(0, s.held - dt * 0.5);
      if (s.held >= holdOf('shrine', run)) {
        const pilgrim = has(run, 'pilgrim');
        const secs = pilgrim ? T.pilgrimSecs : S.hymnSecs;
        run.hymnUntil = run.t + secs;
        banner(run, `Battle Hymn: the force fires ${Math.round((pilgrim ? T.pilgrimHymn : S.hymn) * 100)}% faster for ${secs}s`, 'good');
        run.log.push(`${clock(run.t)} A shrine taken: Battle Hymn.`);
        run.fx.push({ kind: 'spell', x: s.x, y: s.y, n: S.radius * 2, t: 0.8 });
        s.held = -1;
      }
    } else if (s.kind === 'cache') {
      // Stepping on springs the ambush; holding it open pays out. The ambush grows with the run: elites from the
      // current mix, + a share of HP a minute (to ambushHp), and the book's toughest kind only once the top tier is in.
      if (on && !s.sprung) {
        s.sprung = true;
        banner(run, 'Ambush! Hold the cache open', 'warn');
        run.log.push(`${clock(run.t)} A supply cache: an ambush springs.`);
        const mins = run.t / 60;
        const kind = run.t >= WARPATH.spawn.shiftEvery * 2 ? champKind(run) : pickKind(run);
        const hpMul = Math.min(S.ambushHp, 1 + S.ambushHpPerMin * mins);
        for (let i = 0; i < S.ambush; i++) {
          const a = (i / S.ambush) * Math.PI * 2;
          const p = { x: s.x + Math.cos(a) * 10, y: s.y + Math.sin(a) * 10 };
          unblock(run.seed, p, 1);
          const e = spawnEnemy(run, kind, p.x, p.y, undefined, true);
          e.hp = e.maxHp = e.maxHp * hpMul;
        }
      }
      s.held = on ? s.held + dt : Math.max(0, s.held - dt * 0.5);
      if (s.held >= holdOf('cache', run)) {
        const n = has(run, 'plunder') ? T.plunder : 1;
        run.queued += n;
        banner(run, n > 1 ? `Supply cache: ${n} free level-ups` : 'Supply cache: a free level-up', 'good');
        run.log.push(`${clock(run.t)} A supply cache opened.`);
        s.held = -1;
      }
    } else if (s.kind === 'well') {
      s.held = on ? s.held + dt : Math.max(0, s.held - dt * 0.5);
      if (s.held < holdOf('well', run)) continue;
      const before = run.hp;
      run.hp = Math.min(run.maxHp, run.hp + run.maxHp * S.heal);
      if (run.fx.length < 700) run.fx.push({ kind: 'heal', x: run.hx, y: run.hy - 2, n: run.hp - before, t: 0.8 });
      banner(run, 'Aid station: the hero is patched up', 'good');
      s.held = -1;
    } else if (s.kind === 'champion' && !run.enemies.some((e) => e.champ === s.id && e.hp > 0)) s.held = -1;
  }
  run.sites = run.sites.filter((s) => s.held >= 0);
}

/** Is the Battle Hymn on? */
export const hymn = (run: WarpathRun) => (run.hymnUntil ?? 0) > run.t;
