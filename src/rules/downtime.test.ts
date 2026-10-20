import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type Campaign } from '../model/types';
import { newForce, newUnit } from '../model/factory';
import { applyExpedition, checkOdds, declinePatrol, rollPatrolEnemy, chooseOption, currentEncounter, headHome, pressOn, scaledReward, squadBonus, startExpedition } from './downtime';
import { EXPEDITION, EXPEDITION_SITES, SOLO_PATROL } from './downtimeData';
import { emptyUnitBattle, participationXp, resolveBattle, rewardRows, type BattleInput } from './battle';
import { STANDARD_MISSION } from './missions';
import { patrolBattle, wizardPrefill } from './tracker';
import { PARTICIPATION_XP } from './data';
import { markUnitsUsed, unitsUsed } from './nexus';

// A rand that returns the given values in turn, then the last one forever.
const seq = (...xs: number[]) => {
  let i = 0;
  return () => xs[Math.min(i++, xs.length - 1)];
};
const roll = (n: number) => (n - 1) / 6 + 0.01; // rand value giving a D6 of n

const hulk = (rand = () => 0.5) => startExpedition('hulk', ['a', 'b', 'c', 'd'], rand);

describe('expeditions', () => {
  it('starts with a squad of three and three encounters from the site', () => {
    const e = hulk();
    expect(e.squad).toEqual(['a', 'b', 'c']);
    expect(e.deck).toHaveLength(EXPEDITION.encounters);
    const ids = EXPEDITION_SITES[0].encounters.map((x) => x.id);
    for (const id of e.deck) expect(ids).toContain(id);
    expect(new Set(e.deck).size).toBe(e.deck.length);
    expect(currentEncounter(e)?.id).toBe(e.deck[0]);
    expect(() => startExpedition('nope', [])).toThrow();
  });

  it('has six encounters a site, each in three variants with a way through', () => {
    for (const site of EXPEDITION_SITES) {
      expect(site.encounters).toHaveLength(6);
      for (const enc of site.encounters) {
        expect(enc.variants).toHaveLength(3);
        for (const v of enc.variants) {
          expect(v.choices.length).toBeGreaterThanOrEqual(2);
          for (const c of v.choices) if (c.check) expect(c.lose).not.toBe('');
        }
      }
    }
  });

  it('draws a variant for each encounter', () => {
    const e = hulk(() => 0.99);
    expect(e.variants).toEqual([2, 2, 2]);
    const enc = EXPEDITION_SITES[0].encounters.find((x) => x.id === e.deck[0])!;
    expect(currentEncounter(e)?.title).toBe(enc.variants[2].title);
    delete e.variants; // an expedition saved before variants meets the first
    expect(currentEncounter(e)?.title).toBe(enc.variants[0].title);
  });

  it('gives bigger and more experienced squads a bonus, up to the cap', () => {
    expect(squadBonus([])).toBe(0);
    expect(squadBonus([newUnit({ xp: 0 })])).toBe(0);
    expect(squadBonus([newUnit({ xp: 0 }), newUnit({ xp: 0 })])).toBe(1);
    expect(squadBonus([newUnit({ xp: 40 })])).toBe(1); // level 3
    expect(squadBonus([newUnit({ xp: 20 }), newUnit({ xp: 20 }), newUnit({ xp: 20 })])).toBe(4); // three level 2s
    expect(squadBonus([newUnit({ xp: 200 }), newUnit({ xp: 200 }), newUnit({ xp: 200 })])).toBe(EXPEDITION.bonusCap);
  });

  it('makes harder checks harder, and the bonus help', () => {
    const tiers = ['safe', 'easy', 'medium', 'hard', 'heroic'] as const;
    for (let i = 1; i < tiers.length; i++) expect(checkOdds(tiers[i], 0)).toBeLessThan(checkOdds(tiers[i - 1], 0));
    for (const t of tiers.slice(1)) expect(checkOdds(t, 3)).toBeGreaterThan(checkOdds(t, 0));
    expect(checkOdds('safe', 0)).toBeCloseTo(5 / 6);
    expect(checkOdds('heroic', 0)).toBeLessThan(0.15);
    expect(checkOdds('heroic', EXPEDITION.bonusCap)).toBeGreaterThan(0.5);
  });

  it('scales XP and Supply with depth, not RP or shards', () => {
    expect(scaledReward({ xp: 1, supply: 25, rp: 1, us: 1 }, 0)).toEqual({ xp: 1, supply: 25, rp: 1, us: 1 });
    expect(scaledReward({ xp: 1, supply: 25 }, 1)).toEqual({ xp: 2, supply: 40, rp: 0, us: 0 });
    expect(scaledReward({ xp: 2, supply: 25 }, 2)).toEqual({ xp: 4, supply: 50, rp: 0, us: 0 });
  });

  it('pays a success, adds danger on a fail and more on a fumble', () => {
    // Force a medium check (3D6, 12+) onto the first encounter so the dice are known.
    const withMedium = () => {
      const e = hulk();
      const site = EXPEDITION_SITES[0];
      const enc = site.encounters.find((x) => x.id === e.deck[0])!;
      const v = enc.variants[e.variants![0]];
      const i = v.choices.findIndex((c) => c.check === 'medium');
      return { e, i: i >= 0 ? i : v.choices.findIndex((c) => !!c.check), check: v.choices[i >= 0 ? i : 0].check! };
    };
    const { e, i } = withMedium();
    const win = chooseOption(e, i, 0, () => roll(6))!;
    expect(win.success).toBe(true);
    expect(win.dice!.every((d) => d === 6)).toBe(true);
    expect(e.phase).toBe('crossroads');
    expect(e.danger).toBe(0);
    expect(e.log).toHaveLength(1);
    expect(e.log[0]).toMatch(/rolled 6\+6/);
    expect(chooseOption(e, i)).toBeUndefined(); // not at an encounter now

    const near = withMedium();
    const target = EXPEDITION.checks[near.check].target;
    const dice = EXPEDITION.checks[near.check].dice;
    // All dice show the same face, a little short of the target: a plain fail.
    const face = Math.floor((target - 1) / dice);
    const r = chooseOption(near.e, near.i, target - 1 - face * dice, () => roll(face))!;
    expect(r).toMatchObject({ success: false, fumble: false });
    expect(near.e.danger).toBe(EXPEDITION.failDanger);

    const fumble = withMedium();
    const f = chooseOption(fumble.e, fumble.i, 20, () => roll(1))!; // all 1s fail whatever the bonus
    expect(f).toMatchObject({ success: false, fumble: true });
    expect(fumble.e.danger).toBe(EXPEDITION.fumbleDanger);

    const short = withMedium();
    expect(chooseOption(short.e, short.i, 0, () => roll(2))!.fumble).toBe(true); // missed by a lot
  });

  it('heads home safely, or presses on into an ambush', () => {
    const home = hulk();
    chooseOption(home, 0, 0, () => roll(6));
    headHome(home);
    expect(home.phase).toBe('done');
    expect(home.finished).toBe(false);

    const deep = hulk();
    chooseOption(deep, 0, 0, () => roll(1));
    expect(deep.danger).toBe(EXPEDITION.fumbleDanger);
    // Press-on roll 1 (ambushed), pick the second squad unit, ambush roll 1 (scar), first scar.
    const r = pressOn(deep, seq(roll(1), 0.4, roll(1), 0))!;
    expect(r.ambush).toMatchObject({ unitId: 'b' });
    expect(r.ambush!.scar).toBeDefined();
    expect(deep.stage).toBe(1);
    expect(deep.phase).toBe('encounter');

    const lost = hulk();
    chooseOption(lost, 0, 0, () => roll(1));
    expect(pressOn(lost, seq(roll(1), 0, roll(6)))!.ambush).toEqual({ unitId: 'a' });
    const safe = hulk();
    chooseOption(safe, 0, 0, () => roll(1));
    expect(pressOn(safe, () => roll(6))!.ambush).toBeUndefined();
  });

  it('pays the site bonus for making it all the way', () => {
    const e = hulk();
    for (let i = 0; i < EXPEDITION.encounters; i++) {
      chooseOption(e, 0, 0, () => roll(6));
      if (i < EXPEDITION.encounters - 1) pressOn(e, () => roll(6));
    }
    expect(e.phase).toBe('done');
    expect(e.finished).toBe(true);
    expect(e.haul.us).toBeGreaterThanOrEqual(1);
  });

  it('pays XP, Supply, RP and shards to the force, with its injuries', () => {
    const f = newForce('Test');
    f.units.push(newUnit({ id: 'a', name: 'Alpha', xp: 0 }), newUnit({ id: 'b', name: 'Bravo', xp: 5 }), newUnit({ id: 'x', name: 'Home', xp: 0 }));
    const e = startExpedition('hulk', ['a', 'b']);
    e.haul = { xp: 2, supply: 40, rp: 1, us: 1 };
    e.injuries = [{ unitId: 'a', scar: 'Weakened Armor' }, { unitId: 'b' }];
    e.phase = 'done';
    let n = 0;
    const summary = applyExpedition(f, e, '2026-10-20', () => `id${n++}`);
    expect(f.units.map((u) => u.xp)).toEqual([2, 7, 0]);
    expect(f.units[0].scars.map((s) => s.name)).toEqual(['Weakened Armor']);
    expect(f.units[1].status).toBe('comatose');
    expect(f.umbraShards).toBe(1);
    expect(f.ledger[f.ledger.length - 1]).toMatchObject({ rp: 1, supply: 40, us: 1, date: '2026-10-20' });
    expect(summary).toMatch(/^Expedition — Derelict Space Hulk: \+2 XP each/);
    expect(summary).toMatch(/Bravo: Lost/);
  });
});

describe('solo patrols', () => {
  function setup() {
    const f = newForce('Test');
    const a = newUnit({ id: 'a', name: 'Alpha', xp: 0 });
    const c = newUnit({ id: 'c', name: 'Charlie', status: 'comatose' });
    f.units.push(a, c);
    const input: BattleInput = {
      date: '2026-10-20', opponent: 'Void Echoes', result: 'win', vsAi: true, agendas: [], myBp: 10, oppBp: 10, notes: '',
      table: '', agendaRp: 1, units: { a: { ...emptyUnitBattle(a), killXp: 2, marked: true }, c: emptyUnitBattle(c) }, rewards: {}, patrol: true,
    };
    return { f, input };
  }

  it('pays participation and kill XP only: no RP, reward rolls or Marked', () => {
    const { f, input } = setup();
    expect(rewardRows(input)).toEqual([]);
    expect(participationXp(input)).toBe(PARTICIPATION_XP);
    let n = 0;
    const out = resolveBattle(f, input, () => `id${n++}`);
    expect(f.units[0].xp).toBe(PARTICIPATION_XP + 2);
    expect(out.rp).toBe(0);
    expect(f.ledger[0].label).toMatch(/^Solo patrol vs/);
    expect(f.units[1].status).toBe('comatose'); // a patrol doesn't count as the battle a comatose unit sits out
    expect(f.battleLog![0].patrol).toBe(true);
  });

  it('starts a 1 v AI battle with only the chosen units', () => {
    const f = newForce('Test');
    f.units.push(newUnit({ id: 'a', name: 'Alpha' }), newUnit({ id: 'b', name: 'Bravo' }), newUnit({ id: 'c', name: 'Charlie', status: 'comatose' }));
    const b = patrolBattle(STANDARD_MISSION, 'p', '2026-10-20', f, ['a', 'c'], DEFAULT_SETTINGS);
    expect(b.patrol).toBe(true);
    const me = b.sides.find((s) => !s.ai)!;
    expect(me.forceId).toBe(f.id);
    expect(me.units.map((u) => u.name)).toEqual(['Alpha']);
    expect(b.sides.some((s) => s.ai)).toBe(true);
    const { input } = setup();
    expect(wizardPrefill(b, me.id, { ...input, patrol: false }, f).patrol).toBe(true);
  });
});

describe('one fight per unit per round', () => {
  it('tracks the units used this round and frees them next round', () => {
    const f = newForce('Test');
    f.nexus = { factionId: 'A', permanentTables: [], tempTables: [], traitTokens: 0, pending: [] };
    const c = { id: 'c', name: 'C', updatedAt: '', round: 2, threat: 0, factions: [], sectors: [], log: [] } as unknown as Campaign;
    expect(unitsUsed(f, c)).toEqual([]);
    markUnitsUsed(f, c, ['a', 'b']);
    markUnitsUsed(f, c, ['b', 'c']);
    expect(unitsUsed(f, c)).toEqual(['a', 'b', 'c']);
    expect(unitsUsed(f, undefined)).toEqual([]);
    c.round = 3;
    expect(unitsUsed(f, c)).toEqual([]);
    markUnitsUsed(f, c, ['d']);
    expect(f.nexus.usedUnits).toEqual({ round: 3, ids: ['d'] });
  });
});

describe('solo patrol sightings', () => {
  it('finds an enemy between the patrol limits, in whole steps', () => {
    expect(rollPatrolEnemy(() => 0)).toBe(SOLO_PATROL.enemyMin);
    expect(rollPatrolEnemy(() => 0.9999)).toBe(SOLO_PATROL.enemyMax);
    for (let i = 0; i < 200; i++) {
      const p = rollPatrolEnemy();
      expect(p).toBeGreaterThanOrEqual(400);
      expect(p).toBeLessThanOrEqual(700);
      expect((p - SOLO_PATROL.enemyMin) % SOLO_PATROL.enemyStep).toBe(0);
    }
  });

  it('turning back gives each patrolling unit pity XP and logs it', () => {
    const f = newForce('Test');
    const a = { ...newUnit(), id: 'a', name: 'Alpha', status: 'active' as const, xp: 2 };
    const b = { ...newUnit(), id: 'b', name: 'Beta', status: 'active' as const, xp: 0 };
    const c = { ...newUnit(), id: 'c', name: 'Gamma', status: 'active' as const, xp: 0 };
    f.units = [a, b, c];
    const summary = declinePatrol(f, ['a', 'b'], 550, '2026-10-20', () => 'x');
    expect(f.units.map((u) => u.xp)).toEqual([2 + SOLO_PATROL.declineXp, SOLO_PATROL.declineXp, 0]);
    expect(summary).toContain('550 pts');
    expect(f.ledger[f.ledger.length - 1]).toMatchObject({ rp: 0, supply: 0, label: summary });
  });
});
