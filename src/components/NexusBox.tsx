import type { Unit } from '../model/types';
import { CATEGORIES, RELICS } from '../rules/data';
import { ANOMALY_TABLE, COMBAT_MANIPULATIONS, NEXUS_CRISIS, NEXUS_ROUNDS, RELIC_TAKEN, ROLL_SIDES, VOID_TABLE, nexusEntry, type NexusItem, type NexusPick } from '../rules/nexus';
import { GUARDIANS } from '../rules/nexusData';
import { relicBearer, relicHolders, relicTaken, rollDie } from '../rules/engine';
import { useStore } from '../model/store';
import { unitName } from '../rules/battle';
import { RelicOption, Stepper } from './ui';

export function UnitSelect({ label, units, value, onChange, empty }: { label: string; units: Unit[]; value: string; onChange: (id: string) => void; empty: string }) {
  return (
    <div className="row" style={{ marginTop: '0.5rem' }}>
      <span className="small">{label}</span>
      {units.length ? (
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">— choose a unit —</option>
          {units.map((u) => <option key={u.id} value={u.id}>{unitName(u)}</option>)}
        </select>
      ) : <span className="muted small">{empty}.</span>}
    </div>
  );
}

/** One Nexus Wars reward or income item: a roll, a choice, or a fixed amount. Used after a match and for round income. */
export default function NexusBox({ item, units, fighters, pick, setPick }: {
  item: NexusItem;
  units: Unit[];
  /** Units that XP can be handed out to. */
  fighters: Unit[];
  pick: NexusPick;
  setPick: (p: Partial<NexusPick>) => void;
}) {
  const sides = ROLL_SIDES[item.kind];
  const table = item.kind === 'anomaly' ? ANOMALY_TABLE : item.kind === 'void' ? VOID_TABLE : null;
  const e = nexusEntry(item, pick);
  const given = Object.values(pick.alloc).reduce((n, x) => n + x, 0);
  const { state } = useStore();
  const held = relicHolders(state.forces, state.campaign);
  const wantsRelic = (item.kind === 'relicRoll' && pick.roll === 6) || item.kind === 'relic' || !!e?.nexusRelic;
  const relics = item.kind === 'relicRoll'
    ? RELICS.filter((r) => r.tier === 'Common' && !r.nexus && !r.sortie)
    : item.kind === 'relic'
      ? RELICS.filter((r) => (item.relic ? r.name === item.relic : r.tier === NEXUS_CRISIS.mvpTier && !r.sortie))
      : RELICS.filter((r) => r.nexus && r.tier !== 'Legendary');

  let fixed = '';
  if (item.kind === 'us' || item.kind === 'matchBonus') fixed = `+${item.us} Umbra Shard${item.us === 1 ? '' : 's'}`;
  if (item.kind === 'supply') fixed = `+${item.supply} Supply`;

  return (
    <div className="reward">
      <div className="reward-head">
        <h4>{item.source}</h4>
        <span className="spacer" />
        {item.kind === 'matchBonus' && <span className="muted small">up to {NEXUS_ROUNDS.matchBonusMax} per round for the faction</span>}
        {fixed && <span className="tag green">{fixed}</span>}
        {sides && (
          <>
            {item.kind === 'shardRoll' && <span className="muted small">{NEXUS_ROUNDS.shardMineRoll}+ = 1 shard</span>}
            {item.kind === 'relicRoll' && <span className="muted small">6 = Common relic</span>}
            <button onClick={() => setPick({ roll: rollDie(sides) })}>🎲 Roll D{sides}</button>
            <select value={pick.roll ?? ''} onChange={(ev) => setPick({ roll: Number(ev.target.value) || null })}>
              <option value="">— result —</option>
              {Array.from({ length: sides }, (_, i) => <option key={i} value={i + 1}>{i + 1}{table ? `. ${table[i].text}` : ''}</option>)}
            </select>
          </>
        )}
      </div>
      {e && <div style={{ marginTop: '0.35rem' }}><b className="cat">{e.text}</b></div>}

      {item.kind === 'research' && (
        <div className="row" style={{ marginTop: '0.5rem' }}>
          <span className="small">Unlock until your next round income</span>
          <select value={pick.choice} onChange={(ev) => setPick({ choice: ev.target.value })}>
            <option value="">— choose a table —</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      )}

      {item.kind === 'manipulation' && (
        <div className="row" style={{ marginTop: '0.5rem' }}>
          <span className="small">Free manipulation</span>
          <select value={pick.choice} onChange={(ev) => setPick({ choice: ev.target.value })}>
            <option value="">Decide later</option>
            {COMBAT_MANIPULATIONS.map((m) => <option key={m.name} value={m.name}>{m.name} — {m.desc}</option>)}
          </select>
        </div>
      )}

      {e?.xp && (
        <>
          <div className="small" style={{ marginTop: '0.35rem' }}>
            Distribute {e.xp} XP · <span className={given > e.xp ? 'tag red' : given === e.xp ? 'tag green' : 'tag gold'}>{e.xp - given} left</span>
          </div>
          <div className="alloc">
            {fighters.map((u) => (
              <label key={u.id}>
                <span>{unitName(u)}</span>
                <Stepper value={pick.alloc[u.id] ?? 0} min={0} onChange={(n) => setPick({ alloc: { ...pick.alloc, [u.id]: n } })} />
              </label>
            ))}
          </div>
        </>
      )}

      {e?.removeScar && (
        <div className="row" style={{ marginTop: '0.5rem' }}>
          <span className="small">Remove</span>
          <select value={pick.target} onChange={(ev) => setPick({ target: ev.target.value })}>
            <option value="">— choose a scar —</option>
            {units.flatMap((u) => u.scars.map((s) => <option key={`${u.id}:${s.id}`} value={`${u.id}:${s.id}`}>{unitName(u)} — {s.name}</option>))}
          </select>
        </div>
      )}

      {(e?.free || wantsRelic) && (
        <div className="row" style={{ marginTop: '0.5rem' }}>
          {wantsRelic && (
            <select value={item.relic ?? pick.choice} disabled={!!item.relic} onChange={(ev) => setPick({ choice: ev.target.value })}>
              <option value="">— choose a relic —</option>
              {relics.map((r) => <RelicOption key={r.name} name={r.name} label={`${r.name} (${r.tier})`} taken={relicTaken(held, r.name)} />)}
            </select>
          )}
          <UnitSelect label={e?.free ? `${e.free} for` : 'for'} units={units} value={pick.target} onChange={(target) => setPick({ target })} empty="No units" />
        </div>
      )}
      {item.kind === 'relicSteal' && (
        <>
          <label className="row small" style={{ marginTop: '0.5rem' }}>
            <input type="checkbox" checked={pick.choice === RELIC_TAKEN} onChange={(ev) => setPick({ choice: ev.target.checked ? RELIC_TAKEN : '', target: '' })} />
            A Hero (or Heroic Rise unit) slew the guardian and rolled {GUARDIANS.stealRoll}+ to take {item.relic}
          </label>
          {pick.choice === RELIC_TAKEN && (
            <UnitSelect label="Taken by" units={units.filter(relicBearer)} value={pick.target} onChange={(target) => setPick({ target })} empty="No Heroes" />
          )}
        </>
      )}
      {e?.nexusRelic && <p className="muted small" style={{ margin: '0.35rem 0 0' }}>Common Nexus relic — take a Rare one only if no Common one is available.</p>}
    </div>
  );
}
