import { useState } from 'react';
import { useStore } from '../model/store';
import { uid } from '../model/factory';
import type { Force, Unit } from '../model/types';
import { RELICS, REQUISITIONS, SCAR_TABLE, type Requisition } from '../rules/data';
import { applyScar, forceTotals, hasRule, relicHolders, relicSlots, relicTaken, relicTierAllowed, rollDice, rollDie, xpShown } from '../rules/engine';
import { NEEDS_UNIT, RELIC_TIER, requisitionEligible, requisitionProblem } from '../rules/requisition';
import { unitName } from '../rules/battle';
import { isRunaway, supplyRpCost } from '../rules/runaway';
import { Modal, RelicOption, toast } from './ui';
import { localDate } from '../model/date';
import { Icon } from './Icon';

export default function RequisitionShop({ force, onClose }: { force: Force; onClose: () => void }) {
  const { state, updateForce } = useStore();
  const s = state.settings;
  const rp = forceTotals(force, s).rp;
  const [sel, setSel] = useState<Requisition | null>(null);
  const [unitId, setUnitId] = useState('');
  const [choice, setChoice] = useState('');
  const [note, setNote] = useState('');
  const [result, setResult] = useState<string | null>(null);

  const held = relicHolders(state.forces, state.campaign);
  const units = force.units.filter((u) => u.status !== 'removed');
  const unit = units.find((u) => u.id === unitId);
  const tier = sel ? RELIC_TIER[sel.name] : undefined;
  // A relic forged by a finished Project is free: it uses up one credit of its tier instead of RP.
  const forged = force.nexus?.forged ?? [];
  const credits = (t: string | undefined) => forged.filter((x) => x === t).length;
  const free = !!tier && credits(tier) > 0;
  // A faction far ahead pays more RP for Supply (rules/runaway.ts).
  const priceOf = (r: Requisition) => (r.name === 'Increase Supply' ? supplyRpCost(state.campaign, force.nexus?.factionId, r.cost) : r.cost);
  const dearer = isRunaway(state.campaign, force.nexus?.factionId);
  const cost = free ? 0 : sel ? priceOf(sel) : 0;

  const pick = (r: Requisition) => {
    setSel(r);
    setUnitId('');
    setChoice('');
    setNote('');
    setResult(null);
  };

  const eligible: Unit[] = !sel ? [] : units.filter((u) => requisitionEligible(sel.name, u));

  const why = requisitionProblem(sel && { ...sel, cost }, rp, unit, choice, held);

  let warning: string | null = null;
  if (unit && sel?.name === 'Heroic Rise' && (unit.category !== 'Infantry' || unit.tough > 1)) warning = 'Heroic Rise is for Tough(1) infantry.';
  if (unit && tier) {
    if (!relicTierAllowed(tier, unit.xp)) warning = `${unitName(unit)} normally lacks the XP for a ${tier} relic.`;
    else if (unit.relics.length >= relicSlots(unit.xp)) warning = `${unitName(unit)} has no free relic slot (${unit.relics.length}/${relicSlots(unit.xp)}).`;
  }

  const buy = () => {
    if (!sel || why) return;
    const today = localDate();
    let label = sel.name + (unit ? ` — ${unitName(unit)}` : '') + (note ? ` (${note})` : '');
    let supply = 0;
    let outcome = `${sel.name} purchased.`;
    let mutate: ((u: Unit) => void) | null = null;

    switch (sel.name) {
      case 'Increase Supply':
        supply = s.supplyPerRp;
        outcome = `Supply Limit +${supply}.`;
        break;
      case 'Remove a Scar': {
        const scar = unit!.scars.find((x) => x.id === choice);
        label = `Remove a Scar — ${unitName(unit!)}: ${scar?.name}`;
        mutate = (u) => void (u.scars = u.scars.filter((x) => x.id !== choice));
        outcome = `${scar?.name} removed from ${unitName(unit!)}.`;
        break;
      }
      case 'Off Duty Training': {
        const dice = rollDice(6, 3);
        const base = dice.reduce((a, b) => a + b, 0);
        const d6 = rollDie();
        const scar = d6 === 1 ? SCAR_TABLE[rollDie(SCAR_TABLE.length) - 1] : null;
        const bonus = d6 === 6 ? 3 : d6 === 1 ? 0 : 1;
        mutate = (u) => {
          u.xp += base + bonus;
          if (scar) applyScar(u, { id: uid(), name: scar.name, desc: scar.desc });
        };
        outcome = `6D3 = ${dice.join('+')} = ${base} XP; D6 = ${d6}: ${scar ? `battle scar — ${scar.name}` : `+${bonus} XP`}. ${unitName(unit!)} gains ${base + bonus} XP.`;
        label += `: +${base + bonus} XP${scar ? `, ${scar.name}` : ''}`;
        break;
      }
      case 'Elite Reinforcements':
        mutate = (u) => void (u.xp = Math.max(u.xp, 10));
        outcome = `${unitName(unit!)} starts at ${xpShown(Math.max(unit!.xp, 10))} XP.`;
        break;
      case 'Heroic Rise':
        mutate = (u) => {
          u.heroicRise = true;
          u.bpAdjust += 1;
          u.tough = 3;
          u.rules = [...u.rules.filter((r) => !hasRule([r], 'Tough')), 'Tough(3)'];
        };
        outcome = `${unitName(unit!)} rises: Tough(3), a relic slot, +1 BP.`;
        break;
      default:
        if (tier) {
          const def = RELICS.find((r) => r.name === choice);
          mutate = (u) => void u.relics.push({ id: uid(), name: choice, tier, profile: def?.profile, note: def?.note });
          label = `${sel.name} — ${unitName(unit!)}: ${choice}`;
          outcome = `${unitName(unit!)} gains ${choice}.`;
        }
    }

    updateForce(force.id, (d) => {
      d.ledger.push({ id: uid(), date: today, label: free ? `${label} (forged: free)` : label, rp: -cost, supply });
      if (free && d.nexus?.forged) d.nexus.forged.splice(d.nexus.forged.findIndex((x) => x === tier), 1);
      const u = d.units.find((x) => x.id === unitId);
      if (u && mutate) mutate(u);
    });
    setResult(outcome);
    setChoice('');
    toast(outcome);
  };

  return (
    <Modal title={`Requisition — ${rp} RP available`} onClose={onClose} wide
      footer={<><span className="muted small grow">{why ?? warning}</span><button onClick={onClose}>Close</button><button className="primary" disabled={!!why} onClick={buy}>{free ? 'Pick your free relic' : `Buy${sel ? ` (${cost} RP)` : ''}`}</button></>}>
      <div className="cols-2">
        <div>
          {REQUISITIONS.map((r) => (
            <div key={r.name} className={`shop-item${sel === r ? ' selected' : ''}${priceOf(r) > rp && !credits(RELIC_TIER[r.name]) ? ' disabled' : ''}`} onClick={() => pick(r)}>
              <span className="cost">{credits(RELIC_TIER[r.name]) ? `${credits(RELIC_TIER[r.name])} forged` : `${priceOf(r)} RP`}</span>
              <div className="grow">
                <b>{r.name}</b>
                <div className="muted small">{r.name === 'Increase Supply' ? `+${s.supplyPerRp} Supply Limit.${dearer ? ' Your faction is far ahead, so it costs more.' : ''}` : r.desc}</div>
              </div>
            </div>
          ))}
        </div>
        <div>
          {!sel && <p className="muted">Choose a requisition.</p>}
          {sel && (
            <div className="fields">
              <h3 className="span-all" style={{ margin: 0 }}>{sel.name}</h3>
              <p className="span-all muted small" style={{ margin: 0 }}>
                {NEEDS_UNIT.has(sel.name) || sel.name === 'Increase Supply'
                  ? 'Applied to the force automatically.'
                  : 'Recorded in the ledger. Make the change on the unit sheet yourself.'}
              </p>
              {sel.name !== 'Increase Supply' && (
                <label className="field span-all">
                  Unit{NEEDS_UNIT.has(sel.name) ? '' : ' (optional)'}
                  <select value={unitId} onChange={(e) => { setUnitId(e.target.value); setChoice(''); }}>
                    <option value="">— choose —</option>
                    {eligible.map((u) => <option key={u.id} value={u.id}>{unitName(u)} ({xpShown(u.xp)} XP)</option>)}
                  </select>
                </label>
              )}
              {sel.name === 'Remove a Scar' && unit && (
                <label className="field span-all">
                  Scar
                  <select value={choice} onChange={(e) => setChoice(e.target.value)}>
                    <option value="">— choose —</option>
                    {unit.scars.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                </label>
              )}
              {tier && (
                <label className="field span-all">
                  {tier} relic
                  <select value={choice} onChange={(e) => setChoice(e.target.value)}>
                    <option value="">— choose —</option>
                    {RELICS.filter((r) => r.tier === tier && !r.nexus && !r.sortie && !r.training).map((r) => <RelicOption key={r.name} name={r.name} taken={relicTaken(held, r.name)} />)}
                  </select>
                </label>
              )}
              {!NEEDS_UNIT.has(sel.name) && sel.name !== 'Increase Supply' && (
                <label className="field span-all">Note<input value={note} placeholder="What changed" onChange={(e) => setNote(e.target.value)} /></label>
              )}
              {result && <div className="span-all panel" style={{ margin: 0 }}><Icon name="l:check" /> {result}</div>}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
