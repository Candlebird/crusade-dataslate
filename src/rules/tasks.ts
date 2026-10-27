import type { Campaign, Force, Sector, SectorGarrison, Unit, UnitTaskKind } from '../model/types';
import { unitName } from './battle';
import { GARRISON, MENTORING, PROJECT_DIE, PROJECTS, RECON, SORTIE, type ProjectDef } from './downtimeData';
import { levelForXp } from './engine';
import { explore, rememberedBy, visibleTo } from './fog';
import { hexDistance, isPlaced, type Rand } from './hexmap';
import { currentRound, markUnitsUsed, unitsUsed } from './nexus';
import { isReinforced, produces } from './production';

// Unit tasks (Nexus Wars downtime): one unit, one task, for the whole round. Mentoring, a Project, Recon, Garrison or a
// Shard Sortie.
// Each takes effect when it's set; the unit is busy for the rest of the round and fights in no battle, the round's main
// Battle included. The numbers are in downtimeData.ts.

export const TASK_NAMES: Record<UnitTaskKind, string> = { mentor: 'Mentoring', project: 'Project', recon: 'Recon', garrison: 'Garrison', sortie: 'Sortie' };

/** The units of this force on a task this round, and what each is doing. */
export function tasksOf(f: Force, c: Campaign | undefined): Record<string, UnitTaskKind> {
  const t = f.nexus?.tasks;
  return c && t && t.round === currentRound(c) ? t.units : {};
}

/** Units on a task this round (they also count as used: in a battle they're Battle-Worn). */
export const unitsBusy = (f: Force, c: Campaign | undefined) => Object.keys(tasksOf(f, c));

/** Units that can still be set to a task: active, and not in a game, an Expedition or another task this round. */
export function freeUnits(f: Force, c: Campaign): Unit[] {
  const used = new Set(unitsUsed(f, c));
  return f.units.filter((u) => u.status === 'active' && !used.has(u.id));
}

/** Throws unless the unit can still be set to a task this round. */
function free(f: Force, c: Campaign, u: Unit) {
  if (!freeUnits(f, c).some((x) => x.id === u.id)) throw new Error(`${unitName(u)} is busy or already fought this round.`);
}

function setBusy(f: Force, c: Campaign, ids: string[], task: UnitTaskKind) {
  if (!f.nexus) return;
  const units = { ...tasksOf(f, c) };
  for (const id of ids) units[id] = task;
  f.nexus.tasks = { round: currentRound(c), units };
  // Busy units are used, so patrols and Expeditions pass them over too (and recorded games, through unitsBusy).
  markUnitsUsed(f, c, ids);
}

// ── Mentoring ─────────────────────────────────────────────────────────────────

/** What stops a unit mentoring another, or null when it can. */
export function mentorProblem(mentor: Unit | undefined, pupil: Unit | undefined): string | null {
  if (!mentor) return 'Choose a mentor.';
  if (!pupil) return 'Choose a unit to teach.';
  if (mentor.id === pupil.id) return 'A unit can\'t teach itself.';
  if (mentor.category !== pupil.category) return `A mentor teaches its own category (${mentor.category}).`;
  if (levelForXp(mentor.xp) <= levelForXp(pupil.xp)) return 'The mentor must be a higher level than the unit it teaches.';
  return null;
}

/** XP the pupil gains from this mentor. */
export const mentorXp = (mentor: Unit) => levelForXp(mentor.xp) * MENTORING.xpPerLevel;

/** The mentor teaches the pupil: the pupil gains XP now, and both are busy for the round. Returns a one-line summary. */
export function mentor(f: Force, c: Campaign, mentorId: string, pupilId: string, date: string, newId: () => string): string {
  const m = f.units.find((u) => u.id === mentorId);
  const p = f.units.find((u) => u.id === pupilId);
  const why = mentorProblem(m, p);
  if (why) throw new Error(why);
  const xp = mentorXp(m!);
  p!.xp += xp;
  free(f, c, m!);
  free(f, c, p!);
  setBusy(f, c, [m!.id, p!.id], 'mentor');
  const summary = `Mentoring — ${unitName(m!)} (level ${levelForXp(m!.xp)}) taught ${unitName(p!)}: +${xp} XP`;
  f.ledger.push({ id: newId(), date, label: summary, rp: 0, supply: 0 });
  return summary;
}

// ── Projects ──────────────────────────────────────────────────────────────────

export const projectById = (id: string | undefined): ProjectDef | undefined => PROJECTS.find((p) => p.id === id);

/** The faction's worlds: the sectors it holds that produce (planets and its home). Projects and garrisons go there. */
export const worldsOf = (c: Campaign, factionId: string) => c.sectors.filter((s) => s.owner === factionId && produces(s));

/** The Project under way on a world, if its holder still holds it (a world that changed hands loses it). */
export const activeProject = (s: Sector) => (s.project && s.project.factionId === s.owner ? s.project : undefined);

/** What stops the faction working on this project on this world, or null when it can. */
export function projectProblem(s: Sector | undefined, projectId: string, factionId: string): string | null {
  const def = projectById(projectId);
  if (!s) return 'Choose a world.';
  if (!def) return 'Choose a project.';
  if (s.owner !== factionId || !produces(s)) return 'Projects are worked on your own worlds.';
  const on = activeProject(s);
  if (on && on.id !== projectId) return `${s.name} already has a project (${projectById(on.id)?.name}). One project per world.`;
  if (def.needsUnfortified && isReinforced(s)) return `${s.name} is already Reinforced.`;
  return null;
}

/** What a finished project gives, in words. */
export function projectRewardText(def: ProjectDef): string {
  const r = def.reward;
  if (r.reinforce) return 'the world is Reinforced';
  if (r.materials) return `+${r.materials} Materials`;
  if (r.research) return `+${r.research} Research`;
  if (r.relic) return `a free ${r.relic} relic`;
  return 'nothing';
}

/**
 * A unit works on a world's Project for the round: it adds a D3 of progress (starting the project if there isn't one),
 * and the project pays out when it reaches its goal. Mutates the campaign and the force. Returns a one-line summary.
 */
export function workProject(
  c: Campaign, f: Force, unitId: string, sectorId: string, projectId: string, date: string, newId: () => string, rand: Rand = Math.random,
): string {
  const factionId = f.nexus?.factionId ?? '';
  const s = c.sectors.find((x) => x.id === sectorId);
  const u = f.units.find((x) => x.id === unitId);
  const why = !u ? 'Choose a unit.' : projectProblem(s, projectId, factionId);
  if (why) throw new Error(why);
  free(f, c, u!);
  const def = projectById(projectId)!;
  const round = currentRound(c);
  const p = activeProject(s!) ?? { id: def.id, factionId, progress: 0, log: [] };
  const roll = 1 + Math.floor(rand() * PROJECT_DIE);
  p.progress += roll;
  p.log = [...p.log, `Round ${round}: ${unitName(u!)} +${roll}`];
  s!.project = p;
  setBusy(f, c, [u!.id], 'project');
  let summary = `Project — ${def.name} on ${s!.name}: ${unitName(u!)} rolled ${roll} (${Math.min(p.progress, def.goal)}/${def.goal})`;
  if (p.progress >= def.goal) {
    delete s!.project;
    const r = def.reward;
    if (r.reinforce) s!.reinforced = true;
    if (r.materials) s!.bank = (s!.bank ?? 0) + r.materials;
    const faction = c.factions.find((x) => x.id === factionId);
    if (r.research && faction) faction.research = (faction.research ?? 0) + r.research;
    if (r.relic && f.nexus) f.nexus.forged = [...(f.nexus.forged ?? []), r.relic];
    summary += `. Finished: ${projectRewardText(def)}${r.relic ? ' (take it in the Requisition shop)' : ''}`;
  }
  f.ledger.push({ id: newId(), date, label: summary, rp: 0, supply: 0 });
  return summary;
}

// ── Recon ─────────────────────────────────────────────────────────────────────

/** Where the faction's Recon can reach: placed sectors within range of one of its sectors or detachments. */
/** The faction's own placed sectors, and those its detachments stand on. */
function homeHexes(c: Campaign, factionId: string) {
  return [
    ...c.sectors.filter((s) => s.owner === factionId),
    ...Object.values(c.positions ?? {}).filter((p) => p.factionId === factionId).map((p) => c.sectors.find((s) => s.id === p.sectorId)),
  ].filter((s): s is Sector & { q: number; r: number } => !!s && isPlaced(s));
}

export function reconTargets(c: Campaign, factionId: string): Sector[] {
  const from = homeHexes(c, factionId);
  return c.sectors.filter((s) => isPlaced(s) && from.some((h) => hexDistance(h, s) <= RECON.range));
}

/** The sectors a Recon of this target sees. */
export function reconArea(c: Campaign, target: Sector): Sector[] {
  return isPlaced(target) ? c.sectors.filter((s) => isPlaced(s) && hexDistance(s, target) <= RECON.radius) : [target];
}

/** A unit scouts a sector and the hexes around it: its faction sees them this round and the next. Returns a summary. */
export function scout(c: Campaign, f: Force, unitId: string, sectorId: string, date: string, newId: () => string): string {
  const factionId = f.nexus?.factionId ?? '';
  const faction = c.factions.find((x) => x.id === factionId);
  const u = f.units.find((x) => x.id === unitId);
  const target = reconTargets(c, factionId).find((s) => s.id === sectorId);
  if (!faction || !u) throw new Error('Choose a unit.');
  free(f, c, u);
  if (!target) throw new Error(`Recon reaches sectors up to ${RECON.range} hexes from your sectors and detachments.`);
  const round = currentRound(c);
  const area = reconArea(c, target);
  faction.recon = [...(faction.recon ?? []).filter((r) => r.round > round - RECON.rounds), { round, sectorIds: area.map((s) => s.id) }];
  // Seen once, they stay on the faction's map afterwards (names and types only).
  explore(c);
  setBusy(f, c, [u.id], 'recon');
  const summary = `Recon — ${unitName(u)} scouted ${target.name}: ${area.length} sector${area.length === 1 ? '' : 's'} in sight until round ${round + RECON.rounds - 1} ends`;
  f.ledger.push({ id: newId(), date, label: summary, rp: 0, supply: 0 });
  return summary;
}

/**
 * A won Shard run scouts on the way home: the nearest sector the faction can't see (one it has never seen first) comes
 * into sight with the hexes around it, as a Recon would. Returns a summary bit, or '' if there was nothing to scout.
 */
export function sortieScout(c: Campaign, f: Force): string {
  const factionId = f.nexus?.factionId ?? '';
  const faction = c.factions.find((x) => x.id === factionId);
  const from = homeHexes(c, factionId);
  if (!faction || !from.length) return '';
  const visible = visibleTo(c, factionId);
  const remembered = rememberedBy(c, factionId, visible);
  const near = (s: Sector & { q: number; r: number }) => Math.min(...from.map((h) => hexDistance(h, s)));
  const target = c.sectors
    .filter((s): s is Sector & { q: number; r: number } => isPlaced(s) && !visible.has(s.id))
    .sort((a, b) => Number(remembered.has(a.id)) - Number(remembered.has(b.id)) || near(a) - near(b))[0];
  if (!target) return '';
  const round = currentRound(c);
  const area = reconArea(c, target);
  faction.recon = [...(faction.recon ?? []).filter((r) => r.round > round - RECON.rounds), { round, sectorIds: area.map((s) => s.id) }];
  explore(c);
  return `scouted ${target.name} on the way back (${area.length} sector${area.length === 1 ? '' : 's'} in sight until round ${round + RECON.rounds - 1} ends)`;
}

// ── Garrison ──────────────────────────────────────────────────────────────────

/** The garrison standing on a sector this round, if there is one. */
export const garrisonNow = (c: Campaign, s: Sector): SectorGarrison | undefined =>
  s.garrisons?.find((g) => g.round === currentRound(c) && g.factionId === s.owner);

export const garrisonPoints = (g: SectorGarrison) => g.units.reduce((n, u) => n + u.points, 0);

/** A unit stands guard on one of its faction's worlds through the round. Returns a one-line summary. */
export function garrison(c: Campaign, f: Force, unitId: string, sectorId: string, date: string, newId: () => string): string {
  const factionId = f.nexus?.factionId ?? '';
  const s = c.sectors.find((x) => x.id === sectorId);
  const u = f.units.find((x) => x.id === unitId);
  if (!u) throw new Error('Choose a unit.');
  free(f, c, u);
  if (!s || s.owner !== factionId || !produces(s)) throw new Error('Garrison one of your own worlds.');
  const round = currentRound(c);
  const g = garrisonNow(c, s) ?? { round, factionId, units: [] };
  g.units = [...g.units.filter((x) => x.unitId !== u.id), { forceId: f.id, unitId: u.id, name: unitName(u), points: u.points }];
  s.garrisons = [...(s.garrisons ?? []).filter((x) => x !== g && x.round > round - GARRISON.keepRounds && x.round !== round), g];
  setBusy(f, c, [u.id], 'garrison');
  const summary = `Garrison — ${unitName(u)} stands guard on ${s.name} (${garrisonPoints(g)} pts there this round)`;
  f.ledger.push({ id: newId(), date, label: summary, rp: 0, supply: 0 });
  return summary;
}

const paidKey = (s: Sector, g: SectorGarrison) => `${s.id}@${g.round}`;

/** Garrisons a raid came against whose XP this force hasn't taken yet. */
export function garrisonClaims(c: Campaign, f: Force): { sector: Sector; garrison: SectorGarrison; units: Unit[] }[] {
  const paid = new Set(f.nexus?.garrisonsPaid ?? []);
  const out: { sector: Sector; garrison: SectorGarrison; units: Unit[] }[] = [];
  for (const s of c.sectors)
    for (const g of s.garrisons ?? []) {
      if (!g.raid || paid.has(paidKey(s, g))) continue;
      const ids = new Set(g.units.filter((x) => x.forceId === f.id).map((x) => x.unitId));
      const units = f.units.filter((u) => ids.has(u.id) && u.status !== 'removed');
      if (units.length) out.push({ sector: s, garrison: g, units });
    }
  return out;
}

/** Take the XP every garrison a raid came against earned this force's units. Returns a summary, or '' when there was none. */
export function claimGarrisons(c: Campaign, f: Force, date: string, newId: () => string): string {
  if (!f.nexus) return '';
  const lines: string[] = [];
  for (const { sector, garrison: g, units } of garrisonClaims(c, f)) {
    for (const u of units) u.xp += GARRISON.raidXp;
    f.nexus.garrisonsPaid = [...(f.nexus.garrisonsPaid ?? []), paidKey(sector, g)];
    const line = `Garrison — ${sector.name} ${g.raid!.repelled ? 'threw back' : 'stood against'} ${g.raid!.band}: +${GARRISON.raidXp} XP to ${units.map(unitName).join(', ')}`;
    f.ledger.push({ id: newId(), date, label: line, rp: 0, supply: 0 });
    lines.push(line);
  }
  return lines.join('; ');
}

// ── Sortie ────────────────────────────────────────────────────────────────────

/** What stops three units setting out together on a Sortie, or null when they can: three different active units, at most one Fortification. */
export function partyProblem(units: (Unit | undefined)[]): string | null {
  if (units.length !== 3 || units.some((u) => !u)) return 'Choose three units.';
  if (new Set(units.map((u) => u!.id)).size !== 3) return 'Choose three different units.';
  const unfit = units.find((u) => u!.status !== 'active');
  if (unfit) return `${unitName(unfit)} isn't fit to go.`;
  if (units.filter((u) => u!.category === 'Fortification').length > 1) return 'Only one Fortification can hold the back.';
  return null;
}

/** What stops a party setting out on a Shard Sortie, or null when it can. */
export function sortieProblem(f: Force, c: Campaign | undefined, units: (Unit | undefined)[]): string | null {
  const why = partyProblem(units);
  if (why) return why;
  if (f.umbraShards < SORTIE.cost) return `A Shard Sortie costs ${SORTIE.cost} Umbra Shards.`;
  const busy = c && units.find((u) => !freeUnits(f, c).some((x) => x.id === u!.id));
  if (busy) return `${unitName(busy)} is busy or already fought this round.`;
  return null;
}

/** Pay the Umbra Shards for a Shard Sortie; in a Nexus campaign all three units are busy for the round. */
export function startSortie(f: Force, c: Campaign | undefined, unitIds: string[]) {
  const units = unitIds.map((id) => f.units.find((x) => x.id === id));
  const why = sortieProblem(f, c, units);
  if (why) throw new Error(why);
  f.umbraShards -= SORTIE.cost;
  if (c) setBusy(f, c, unitIds, 'sortie');
}
