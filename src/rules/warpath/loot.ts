import { rand } from '../training/rng';
import { BOSS_TRICKS, DOCTRINES, SPECS, STRATAGEMS, TROPHIES, WARPATH } from './data';
import { mods } from './mods';
import { drillUp, gainXp } from './levels';
import { has } from './meta';
import type { Enemy, PickupKind, WarpathRun } from './types';

// What falls when an enemy does, and picking it up: Shard XP, rations, recall beacons and a boss's supply drop.

const P = WARPATH.pickups;

export function drop(run: WarpathRun, kind: PickupKind, x: number, y: number, xp = 0): void {
  run.pickups.push({ id: run.nextId++, kind, x, y, xp, life: kind === 'gem' ? P.gemLife : 600 });
}

/** XP a model's Shard is worth: 1, 2 or 4 by tier. */
const gemXp = (tier: number) => 2 ** tier;

/** A boss's name: its Nexus lord's if it has one, and the trick it goes by. */
export function bossName(run: WarpathRun, e: Enemy): string {
  const base = (e.boss === 'lord' && e.lord ? run.lords[e.lord.i]?.name : undefined) ?? run.enemyKinds[e.kind].name;
  const trick = e.lord?.trick;
  return trick ? `${base} ${BOSS_TRICKS.names[trick]}` : base;
}

/** An enemy fell: the tally, its Shard, and for a boss a supply drop, the score and the log. A kill by a squad with a
 *  Leech rule mends the hero. */
export function killed(run: WarpathRun, e: Enemy, si: number): void {
  run.kills += 1;
  const k = run.enemyKinds[e.kind];
  const s = run.squads[si];
  if (run.fx.length < 700) run.fx.push({ kind: 'pop', x: e.x, y: e.y, n: k.size, t: 0.4, crit: !!e.elite });
  const leech = s?.skills.find((x) => x.kind === 'leech');
  if (leech && leech.kind === 'leech') run.hp = Math.min(run.maxHp, run.hp + leech.n);
  // Blood Tithe: the hero's kills mend it; Blood Frenzy: anyone's, for a share.
  const tithe = (run.doctrines.bloodTithe ?? 0) * DOCTRINES.bloodTithe.heal * (si === 0 ? 1 : run.stratagems?.bloodFrenzy ? STRATAGEMS.bloodFrenzy.share : 0);
  if (tithe > 0 && run.hp > 0) run.hp = Math.min(run.maxHp, run.hp + tithe);
  // Bloodbath: a kill closes this squad's wounds, and every so often a model stands back up.
  if (s?.spec === 'bloodbath' && s.alive > 0) {
    s.wounds = 0;
    if (s.alive < s.size && s.kills % SPECS.bloodbath.every === 0) s.alive += 1;
  }
  // Killing Spree: the streak grows, or starts again if it went cold.
  if (run.doctrines.killingSpree) {
    const S = DOCTRINES.killingSpree;
    run.spree = Math.min(S.stacks, (run.t - (run.spreeT ?? 0) <= S.secs ? run.spree ?? 0 : 0) + 1);
    run.spreeT = run.t;
  }
  if (e.champ !== undefined) {
    // A champion bursts into a ring of rich Shards.
    const n = 8;
    for (let i = 0; i < n; i++) drop(run, 'gem', e.x + Math.cos((i / n) * Math.PI * 2) * 1.5, e.y + Math.sin((i / n) * Math.PI * 2) * 1.5, WARPATH.sites.champXp / n);
    run.fx.push({ kind: 'boom', x: e.x, y: e.y, n: e.size * 1.5, t: 0.8 });
    run.log.push(`${clock(run.t)} A champion (${k.name}) slain by ${s?.name ?? 'the field'}.`);
    // Champion Hunter: its head is worth a level-up.
    if (has(run, 'hunter')) {
      run.queued += 1;
      run.banner = { text: 'Champion slain: a free level-up', t: 3, tone: 'good' };
    }
    return;
  }
  if (!e.boss) {
    const xp = gemXp(k.tier) * (e.elite ? WARPATH.elite.xp * (run.trophies?.warHorn ? TROPHIES.warHorn.xp : 1) : 1);
    // Bodies past the merge count fold their Shard into the nearest one, so the field never fills with gems.
    if (run.pickups.length > WARPATH.xp.gemMerge) {
      const near = run.pickups.find((p) => p.kind === 'gem' && Math.abs(p.x - e.x) < 6 && Math.abs(p.y - e.y) < 6);
      if (near) { near.xp += xp; return; }
    }
    drop(run, 'gem', e.x, e.y, xp);
    return;
  }
  drop(run, 'supply', e.x, e.y);
  // It comes to the hero: nobody should have to wade into the crowd for what a boss fight won.
  const spoils = run.pickups[run.pickups.length - 1];
  spoils.pulled = true;
  if (e.lord?.trick) spoils.trophy = BOSS_TRICKS.trophy[e.lord.trick];
  run.fx.push({ kind: 'boom', x: e.x, y: e.y, n: e.size * 2, t: 0.9 });
  run.fx.push({ kind: 'fall', x: e.x, y: e.y, n: e.size, t: 1.4, hurt: e.boss === 'lord' });
  const name = bossName(run, e);
  if (e.boss === 'lord') {
    run.lordKills += 1;
    if (e.lord && run.lords[e.lord.i]) run.lords[e.lord.i].slain = true;
  } else run.captains += 1;
  run.score += e.boss === 'lord' ? WARPATH.score.lord : WARPATH.score.boss;
  if (run.lordKills + run.captains === 2 && run.musterAtSecond === undefined) run.musterAtSecond = run.points;
  // The build feats count bosses slain by the force as it stands.
  if (run.squads.every((x) => x.kind === 'hero' || x.kind === 'foot')) run.pure = (run.pure ?? 0) + 1;
  if (run.squads.length === 1) run.lone = (run.lone ?? 0) + 1;
  if (run.squads.length <= 2) run.single = (run.single ?? 0) + 1;
  run.log.push(`${clock(run.t)} ${name} slain by ${s?.name ?? 'the field'}.`);
  // Field Promotion: the unit that felled it steps up.
  if (s && has(run, 'promotion') && s.level < s.maxLevel) {
    drillUp(run, s);
    run.banner = { text: `Field Promotion: ${s.name} to level ${s.level}`, t: 3, tone: 'good' };
  }
}

export const clock = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

/** Gems drift to the hero once in reach; rations, beacons and supply drops are picked up on touch. Gems age out. */
export function collect(run: WarpathRun, dt: number): void {
  const m = mods(run);
  const pull = P.pull * m.pull;
  let beacon = false;
  for (const p of run.pickups) {
    p.life -= dt;
    const dx = run.hx - p.x;
    const dy = run.hy - p.y;
    const d = Math.hypot(dx, dy);
    if (p.kind === 'supply' ? p.pulled : p.kind === 'gem' && (p.pulled || d < pull)) {
      p.pulled = true;
      const step = Math.min(d, P.pullSpeed * dt);
      if (d > 1e-6) { p.x += (dx / d) * step; p.y += (dy / d) * step; }
    }
    if (Math.hypot(run.hx - p.x, run.hy - p.y) > P.reach) continue;
    p.life = -1;
    p.pulled = false;
    if (p.kind === 'gem') {
      gainXp(run, p.xp * m.xp);
      if (run.doctrines.volatileShards) run.shardCharge = (run.shardCharge ?? 0) + 1;
      const h = run.squads[0];
      if (run.stratagems?.leyLines && h.rushCd) h.rushCd = Math.max(0, h.rushCd - STRATAGEMS.leyLines.cut);
    }
    else if (p.kind === 'ration') run.hp = Math.min(run.maxHp, run.hp + run.maxHp * P.ration);
    else if (p.kind === 'beacon') beacon = true;
    else if (p.kind === 'supply') {
      run.queued += WARPATH.bosses.drop;
      if (p.trophy) (run.trophyDue ??= []).push(p.trophy);
    }
  }
  if (beacon) for (const p of run.pickups) if (p.kind === 'gem') p.pulled = true;
  run.pickups = run.pickups.filter((p) => p.life > 0 || p.pulled);
  // Recall beacons turn up now and then, a screen away. (Free rations are gone: healing comes from cards, sites and units.)
  if (run.t >= run.nextBeacon) {
    run.nextBeacon = run.t + P.beaconEvery;
    const a = rand(run) * Math.PI * 2;
    drop(run, 'beacon', run.hx + Math.cos(a) * 24, run.hy + Math.sin(a) * 24);
  }
}
