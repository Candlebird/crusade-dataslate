import { describe, expect, it } from 'vitest';
import { newForce, newUnit } from '../model/factory';
import { awardFeats, clawbackFeats, FEATS_VERSION, trainingFeats } from './feats';

// Training feats from what a run did, the feat relics, and the one-time clawback of the old, dearer feats.

let n = 0;
const id = () => `id${n++}`;

describe('training feats from a run', () => {
  it('reads every new feat off the run and the ladder', () => {
    expect(trainingFeats(10, 0, { finalLord: true })).toEqual(['trainLord']);
    expect(trainingFeats(10, 0, { won: true, bosses: 5, endless: 5 })).toEqual(['trainWin', 'trainBosses', 'trainEndless']);
    expect(trainingFeats(10, 0, { bosses: 4, endless: 4 })).toEqual([]);
    expect(trainingFeats(0, 0, { open: 40 })).toEqual(['trainFinal40']);
    expect(trainingFeats(0, 0, { open: 50 })).toEqual(['trainFinal40', 'trainFinal50']);
    expect(trainingFeats(0, 0, { wins: [25, 30, 35, 40, 45] })).toEqual([]);
    expect(trainingFeats(0, 0, { wins: [25, 30, 35, 40, 45, 50] })).toEqual(['trainAllLords']);
    expect(trainingFeats(0, 0, { siege: 5999 })).toEqual([]);
    expect(trainingFeats(0, 0, { siege: 15000 })).toEqual(['siege6', 'siege10', 'siege15']);
    expect(trainingFeats(0, 0, { siege: 25000 })).toEqual(['siege6', 'siege10', 'siege15', 'siege20', 'siege25']);
  });

  it('a relic feat gives the force its relic, once', () => {
    const f = newForce();
    awardFeats(f, ['trainFinal50', 'siege25'], [], '2026-10-24', id);
    expect(f.trainingRelics).toEqual(['Crown of the Last Lord', 'Colossus Splinter']);
    expect(f.ledger.reduce((s, l) => s + l.rp, 0)).toBe(3);
    expect(awardFeats(f, ['trainFinal50'], [], '2026-10-24', id)).toEqual([]);
    expect(f.trainingRelics).toHaveLength(2);
  });
});

describe('clawing back the old feat pay', () => {
  const old = () => {
    const f = newForce();
    f.units.push(newUnit({ name: 'A' }));
    f.feats = { train20: '2026-10-01', train25: '2026-10-01', trainLord: '2026-10-02' };
    f.ledger.push(
      { id: 'a', date: '2026-10-01', label: 'Feat — Iron Line: Clear 20 waves in one training run.', rp: 3, supply: 0 },
      { id: 'b', date: '2026-10-01', label: 'Feat — Unbroken: Clear 25 waves in one training run.', rp: 3, supply: 100 },
      { id: 'c', date: '2026-10-02', label: 'Feat — Lordfall: Slay an Echo Lord in a training run.', rp: 3, supply: 0 },
    );
    return f;
  };

  it('takes the difference back once, even into the red, with a ledger line', () => {
    const f = old();
    const line = clawbackFeats(f, '2026-10-24', id);
    expect(line).toContain('Iron Line');
    const last = f.ledger[f.ledger.length - 1];
    expect([last.rp, last.supply]).toEqual([-6, -50]);
    expect(f.featsV).toBe(FEATS_VERSION);
    expect(clawbackFeats(f, '2026-10-25', id)).toBeNull();
    expect(f.ledger).toHaveLength(4);
  });

  it('leaves alone a force that never claimed them, or was paid the new rates', () => {
    const fresh = newForce();
    expect(clawbackFeats(fresh, '2026-10-24', id)).toBeNull();
    expect(fresh.featsV).toBeUndefined();
    const paidNew = newForce();
    awardFeats(paidNew, ['train20'], [], '2026-10-24', id);
    expect(clawbackFeats(paidNew, '2026-10-24', id)).toBeNull();
    expect(paidNew.ledger).toHaveLength(1);
  });
});
