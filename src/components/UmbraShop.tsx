import { useState } from 'react';
import { useStore } from '../model/store';
import { uid } from '../model/factory';
import type { Force, Unit } from '../model/types';
import { NEXUS_TRAITS, RELICS, type RelicTier } from '../rules/data';
import { forceTotals, relicCost as relicRp, relicHolders, relicTaken } from '../rules/engine';
import { unitName } from '../rules/battle';
import { COMBAT_MANIPULATIONS, MANIPULATION_PREFIX, NEXUS_RELIC_US, NEXUS_ROUNDS, UMBRA_SHOP, homeOf, ownedSectors, type UmbraBuy } from '../rules/nexus';
import { isReinforced } from '../rules/production';
import { Modal, RelicOption, toast } from './ui';
import { localDate } from '../model/date';
import { Icon } from './Icon';

const TIERS: RelicTier[] = ['Common', 'Rare', 'Legendary'];
const NEEDS_UNIT = new Set<UmbraBuy>(['knowledge', 'revive', 'relic', 'evolution']);

export default function UmbraShop({ force, onClose }: { force: Force; onClose: () => void }) {
  const { state, update } = useStore();
  const c = state.campaign;
  const fid = force.nexus?.factionId;
  const us = force.umbraShards;
  const rp = forceTotals(force, state.settings).rp;
  const [sel, setSel] = useState<UmbraBuy | null>(null);
  const [unitId, setUnitId] = useState('');
  const [choice, setChoice] = useState('');
  const [tier, setTier] = useState<RelicTier>('Common');
  const [result, setResult] = useState<string | null>(null);

  // A Relic Collector home world makes Nexus relics cheaper.
  const collector = !!c && !!fid && homeOf(c, fid)?.benefit === 'relicCollector';
  const relicUs = (t: RelicTier) => Math.max(0, NEXUS_RELIC_US[t] - (collector ? NEXUS_ROUNDS.relicCollectorDiscount : 0));
  // A relic's price is its tier's; the list shows the cheapest.
  const costOf = (x: (typeof UMBRA_SHOP)[number]) => (x.key === 'relic' ? relicUs(x.key === sel ? tier : 'Common') : x.cost);
  const item = UMBRA_SHOP.find((x) => x.key === sel);
  const cost = item ? costOf(item) : 0;
  const held = relicHolders(state.forces, state.campaign);
  const units = force.units.filter((u) => (sel === 'revive' ? u.status === 'comatose' : u.status !== 'removed'));
  const unit = units.find((u) => u.id === unitId);
  const rpCost = sel === 'relic' ? relicRp(tier) : 0;

  const sectorChoices =
    !c || !fid ? [] : sel === 'reinforce' ? ownedSectors(c, fid).filter((s) => !isReinforced(s)) : sel === 'expansion' ? c.sectors.filter((s) => !s.owner && s.type !== 'home') : [];

  const pick = (k: UmbraBuy) => {
    setSel(k);
    setUnitId('');
    setChoice('');
    setResult(null);
  };

  const problem = (): string | null => {
    if (!item) return 'Choose something to buy.';
    if (cost > us) return `Needs ${cost} Umbra Shards (you have ${us}).`;
    if (rpCost > rp) return `Also needs ${rpCost} RP for the relic (you have ${rp}).`;
    if (item.key === 'revive' && !units.length) return 'No unit is comatose.';
    if (NEEDS_UNIT.has(item.key) && !unit) return 'Choose a unit.';
    if ((item.key === 'manipulation' || item.key === 'relic' || item.key === 'evolution') && !choice) return 'Make a choice.';
    if ((item.key === 'reinforce' || item.key === 'expansion') && !choice) return c && fid ? 'Choose a sector.' : 'Link this force to a campaign faction first.';
    // The sector may have been taken, reinforced or deleted since it was picked.
    if ((item.key === 'reinforce' || item.key === 'expansion') && !sectorChoices.some((s) => s.id === choice)) return "That sector isn't available now. Choose another.";
    return null;
  };
  const why = problem();

  const buy = () => {
    if (!item || why) return;
    const today = localDate();
    let label = `Umbra: ${item.name}`;
    let rpDelta = 0;
    let outcome = `${item.name} purchased.`;
    let mutate: ((f: Force, u: Unit | undefined) => void) | null = null;
    let sectorFn: ((d: NonNullable<typeof c>) => void) | null = null;
    const sector = c?.sectors.find((s) => s.id === choice);

    switch (item.key) {
      case 'rp':
        rpDelta = 1;
        outcome = '+1 RP.';
        break;
      case 'knowledge':
        label += ` — ${unitName(unit!)}: +3 XP`;
        mutate = (_f, u) => void (u!.xp += 3);
        outcome = `${unitName(unit!)} gains 3 XP.`;
        break;
      case 'revive':
        label += ` — ${unitName(unit!)}`;
        mutate = (_f, u) => void (u!.status = 'active');
        outcome = `${unitName(unit!)} wakes up and can fight in your next game.`;
        break;
      case 'manipulation':
        label += `: ${choice}`;
        mutate = (f) => void f.nexus?.pending.push(`${MANIPULATION_PREFIX}: ${choice}`);
        outcome = `${choice} is ready for your next match.`;
        break;
      case 'strike':
        mutate = (f) => void f.nexus?.pending.push('Organized Strike (+200 Supply Limit when attacking)');
        outcome = 'Organized Strike ready: +200 Supply Limit for 1 sector attack. Clear it from Pending once used.';
        break;
      case 'reinforce':
        label += `: ${sector?.name}`;
        sectorFn = (d) => {
          const s = d.sectors.find((x) => x.id === choice);
          if (s) s.reinforced = true;
        };
        outcome = `${sector?.name} is reinforced. Tell the GM to update the campaign file.`;
        break;
      case 'expansion':
        label += `: ${sector?.name}`;
        sectorFn = (d) => {
          const s = d.sectors.find((x) => x.id === choice);
          if (s) s.owner = fid;
        };
        outcome = `You take ${sector?.name}. Tell the GM to update the campaign file.`;
        break;
      case 'relic': {
        const def = RELICS.find((r) => r.name === choice);
        rpDelta = -rpCost;
        label += ` — ${unitName(unit!)}: ${choice}`;
        mutate = (_f, u) => void u!.relics.push({ id: uid(), name: choice, tier, profile: def?.profile, note: def?.note });
        outcome = `${unitName(unit!)} gains ${choice}.`;
        break;
      }
      case 'evolution':
        label += ` — ${unitName(unit!)}: ${choice}`;
        mutate = (_f, u) => void u!.upgrades.push({ id: uid(), name: choice, unique: true, nexus: true, free: true });
        outcome = `${unitName(unit!)} evolves: ${choice}.`;
        break;
    }

    update((d) => {
      const f = d.forces.find((x) => x.id === force.id);
      if (!f) return;
      f.umbraShards -= cost;
      f.ledger.push({ id: uid(), date: today, label, rp: rpDelta, supply: 0, us: -cost });
      mutate?.(f, f.units.find((u) => u.id === unitId));
      f.updatedAt = new Date().toISOString();
      if (sectorFn && d.campaign) sectorFn(d.campaign);
    });
    setResult(outcome);
    setChoice('');
    if (item.key === 'revive') setUnitId('');
    toast(outcome);
  };

  return (
    <Modal title={`Umbra Shards — ${us} available`} onClose={onClose} wide
      footer={<><span className="muted small grow">{why}</span><button onClick={onClose}>Close</button><button className="primary" disabled={!!why} onClick={buy}>Buy{item ? ` (${cost} US${rpCost ? ` + ${rpCost} RP` : ''})` : ''}</button></>}>
      <div className="cols-2">
        <div>
          {UMBRA_SHOP.map((x) => (
            <div key={x.key} className={`shop-item${sel === x.key ? ' selected' : ''}${costOf(x) > us ? ' disabled' : ''}`} onClick={() => pick(x.key)}>
              <span className="cost" data-tip={x.key === 'relic' && collector ? 'Relic Collector discount' : undefined}>{costOf(x)}{x.key === 'relic' && x.key !== sel ? '+' : ''} US</span>
              <div className="grow"><b>{x.name}</b><div className="muted small">{x.desc}</div></div>
            </div>
          ))}
        </div>
        <div>
          {!item && <p className="muted">Choose something to buy.</p>}
          {item && (
            <div className="fields">
              <h3 className="span-all" style={{ margin: 0 }}>{item.name}</h3>
              <p className="span-all muted small" style={{ margin: 0 }}>{item.desc}</p>
              {NEEDS_UNIT.has(item.key) && (
                <label className="field span-all">
                  Unit
                  <select value={unitId} onChange={(e) => { setUnitId(e.target.value); if (item.key === 'evolution') setChoice(''); }}>
                    <option value="">— choose —</option>
                    {units.map((u) => <option key={u.id} value={u.id}>{unitName(u)} ({u.xp} XP)</option>)}
                  </select>
                </label>
              )}
              {item.key === 'manipulation' && (
                <label className="field span-all">
                  Manipulation
                  <select value={choice} onChange={(e) => setChoice(e.target.value)}>
                    <option value="">— choose —</option>
                    {COMBAT_MANIPULATIONS.map((m) => <option key={m.name} value={m.name} title={m.desc}>{m.name} — {m.desc}</option>)}
                  </select>
                </label>
              )}
              {item.key === 'relic' && (
                <>
                  <label className="field">
                    Tier
                    <select value={tier} onChange={(e) => { setTier(e.target.value as RelicTier); setChoice(''); }}>
                      {TIERS.map((t) => <option key={t} value={t}>{t} ({relicUs(t)} US + {relicRp(t)} RP)</option>)}
                    </select>
                  </label>
                  <label className="field">
                    Nexus relic
                    <select value={choice} onChange={(e) => setChoice(e.target.value)}>
                      <option value="">— choose —</option>
                      {RELICS.filter((r) => r.nexus && r.tier === tier).map((r) => <RelicOption key={r.name} name={r.name} taken={relicTaken(held, r.name)} />)}
                    </select>
                  </label>
                </>
              )}
              {item.key === 'evolution' && unit && (
                <label className="field span-all">
                  {unit.category} Nexus trait
                  <select value={choice} onChange={(e) => setChoice(e.target.value)}>
                    <option value="">— choose —</option>
                    {(NEXUS_TRAITS[unit.category] ?? []).map((t) => t.name).filter((n) => !unit.upgrades.some((x) => x.name === n)).map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
              )}
              {(item.key === 'reinforce' || item.key === 'expansion') && (
                <label className="field span-all">
                  Sector
                  <select value={choice} onChange={(e) => setChoice(e.target.value)} disabled={!c || !fid}>
                    <option value="">— choose —</option>
                    {sectorChoices.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <span className="muted small">Changes only your copy of the campaign. Tell the GM.</span>
                </label>
              )}
              {result && <div className="span-all panel" style={{ margin: 0 }}><Icon name="l:check" /> {result}</div>}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
