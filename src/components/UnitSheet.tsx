import { useState } from 'react';
import { useStore } from '../model/store';
import { uid } from '../model/factory';
import type { Unit, UnitStatus, Weapon } from '../model/types';
import {
  CATEGORIES,
  CATEGORY_HINT,
  MAX_NORMAL_TRAITS,
  MAX_UNIQUE_TRAITS,
  NEXUS_TRAITS,
  RELICS,
  RELIC_TIER_MIN_XP,
  SCAR_TABLE,
  TRAIT_TABLES,
  UNIQUE_TRAIT_TABLES,
  UNIQUE_WEAPON_TRAIT_TABLES,
  WEAPON_TRAIT_TABLES,
  type Category,
  type RelicTier,
} from '../rules/data';
import {
  applyScar,
  battlePoints,
  detectCategory,
  levelForXp,
  relicSlots,
  relicTierAllowed,
  ruleRating,
  upgradesUsed,
  validateUnit,
} from '../rules/engine';
import { nexusAccess } from '../rules/nexus';
import { unitBookUrl } from '../armyforge/book';
import { go, href } from '../route';
import { ForceImage } from './ForceView';
import TablePicker, { type PickGroup, type Picked } from './TablePicker';
import { traitMark } from './marks';
import { Issues, Stepper, TextArea, TextField, XpBar, toast } from './ui';

type Picker =
  | { kind: 'trait' }
  | { kind: 'weaponTrait'; weaponId: string }
  | { kind: 'scar' }
  | { kind: 'relic' };

const TIERS: RelicTier[] = ['Common', 'Rare', 'Legendary'];

function traitTablesFor(cat: Category): string[] {
  return cat === 'Infantry' ? ['Infantry (Utility)', 'Infantry (Aggressive)'] : [cat];
}

export default function UnitSheet({ forceId, unitId }: { forceId: string; unitId: string }) {
  const { state, updateUnit, updateForce } = useStore();
  const [picker, setPicker] = useState<Picker | null>(null);
  const [newRule, setNewRule] = useState('');
  const f = state.forces.find((x) => x.id === forceId);
  const u = f?.units.find((x) => x.id === unitId);
  if (!f || !u) return <div className="panel empty">Unit not found. <a href={href.forces()}>Back to forces</a></div>;

  const set = (fn: (d: Unit) => void) => updateUnit(f.id, u.id, fn);
  const s = state.settings;
  const bookUrl = unitBookUrl(u, state.books);
  const issues = validateUnit(u);
  const earned = levelForXp(u.xp);
  const used = upgradesUsed(u);
  const normalCount = u.upgrades.filter((x) => !x.unique).length;
  const uniqueCount = u.upgrades.filter((x) => x.unique).length;

  const setRules = (rules: string[]) =>
    set((d) => {
      d.rules = rules;
      d.tough = ruleRating(rules, 'Tough') ?? d.tough;
      if (!d.categoryOverridden) d.category = detectCategory({ rules, size: d.size, tough: d.tough, name: d.unitType });
    });

  const access = nexusAccess(f, u.category);

  const pickerGroups = (): PickGroup[] => {
    if (!picker) return [];
    if (picker.kind === 'trait') {
      const groups: PickGroup[] = traitTablesFor(u.category).map((k) => ({
        key: `normal:${k}`, label: k, entries: TRAIT_TABLES[k] ?? [], rollable: true,
      }));
      groups.push({ key: 'unique', label: 'Unique', entries: UNIQUE_TRAIT_TABLES[u.category] ?? [], rollable: true });
      const locked = access === null ? `The ${u.category} Nexus table is locked — unlock it in Nexus Wars or earn a trait token` : undefined;
      groups.push({
        key: 'nexus',
        label: access === 'token' ? 'Nexus (uses a token)' : 'Nexus',
        entries: (NEXUS_TRAITS[u.category] ?? []).map((t) => ({ name: t.name, desc: t.desc, disabled: locked })),
      });
      return groups;
    }
    if (picker.kind === 'weaponTrait') {
      const w = u.weapons.find((x) => x.id === picker.weaponId);
      const kind = w && w.range > 0 ? 'Ranged' : 'Melee';
      return [
        { key: 'normal', label: `${kind} traits`, entries: WEAPON_TRAIT_TABLES[kind], rollable: true },
        { key: 'unique', label: `Unique ${kind.toLowerCase()}`, entries: UNIQUE_WEAPON_TRAIT_TABLES[kind], rollable: true },
      ];
    }
    if (picker.kind === 'scar') return [{ key: 'scar', label: 'Battle scars', entries: SCAR_TABLE, rollable: true }];
    const relicGroup = (key: string, label: string, list: typeof RELICS): PickGroup => ({
      key,
      label,
      entries: list.map((r) => ({
        name: r.name,
        desc: [r.profile, r.desc, r.note].filter(Boolean).join(' · '),
        disabled: relicTierAllowed(r.tier, u.xp) ? undefined : `${r.tier} relics need ${RELIC_TIER_MIN_XP[r.tier]}+ XP`,
        meta: r,
      })),
    });
    return [
      ...TIERS.map((t) => relicGroup(t, t, RELICS.filter((r) => r.tier === t && !r.nexus))),
      relicGroup('nexus', 'Nexus', RELICS.filter((r) => r.nexus)),
    ];
  };

  const onPick = (p: Picked) => {
    if (!picker) return;
    if (picker.kind === 'trait') {
      const unique = p.group === 'unique' || p.group === 'nexus';
      const token = p.group === 'nexus' && access === 'token';
      updateForce(f.id, (fd) => {
        const d = fd.units.find((x) => x.id === u.id);
        d?.upgrades.push({ id: uid(), name: p.name, unique, nexus: p.group === 'nexus' || undefined, free: p.free || undefined });
        if (token && fd.nexus) fd.nexus.traitTokens -= 1;
      });
      if (token) toast('Used a Nexus trait token.');
    } else if (picker.kind === 'weaponTrait') {
      set((d) => {
        const w = d.weapons.find((x) => x.id === picker.weaponId);
        w?.traits.push({ id: uid(), name: p.name, unique: p.group === 'unique', free: p.free || undefined });
      });
    } else if (picker.kind === 'scar') {
      const result = applyScar(structuredClone(u), { id: uid(), name: p.name });
      set((d) => void applyScar(d, { id: uid(), name: p.name, desc: SCAR_TABLE.find((x) => x.name === p.name)?.desc }));
      if (result === 'comatose') toast(`${u.name || u.unitType} is comatose and sits out the next game.`);
      if (result === 'removed') toast(`A 4th scar — ${u.name || u.unitType} is removed from the army.`, 'error');
    } else {
      const def = p.meta as (typeof RELICS)[number] | undefined;
      set((d) => void d.relics.push({ id: uid(), name: p.name, tier: def?.tier ?? 'Common', profile: def?.profile, note: def?.note }));
    }
    setPicker(null);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumbs">
            <a href={href.forces()}>Forces</a> / <a href={href.force(f.id)}>{f.name}</a> / Unit sheet
          </div>
          <h1>{u.name || u.unitType || 'Unnamed unit'}</h1>
          <div className="muted">
            {u.name && u.unitType}
            {u.name && u.bookName && ' · '}
            {u.bookName}
            {bookUrl && <> · <a href={bookUrl} target="_blank" rel="noreferrer">View on Army Forge ↗</a></>}
          </div>
        </div>
        <div className="row">
          {(u.heroicRise || u.category !== 'Hero') && (
            <label className="row small muted" title="Requisition: may carry a relic like a Hero">
              <input type="checkbox" checked={!!u.heroicRise} onChange={(e) => set((d) => void (d.heroicRise = e.target.checked || undefined))} />
              Heroic Rise
            </label>
          )}
          <select value={u.status} onChange={(e) => set((d) => void (d.status = e.target.value as UnitStatus))}>
            <option value="active">Active</option>
            <option value="comatose">Comatose (sits out)</option>
            <option value="removed">Fallen / removed</option>
          </select>
        </div>
      </div>

      <div className="cols-main">
        <div>
          {/* Profile */}
          <div className="panel">
            <div className="panel-title"><h2>Profile</h2></div>
            <div className="fields">
              <label className="field span-2">Crusade name<TextField value={u.name} onCommit={(v) => set((d) => void (d.name = v))} /></label>
              <label className="field span-2">Datasheet<TextField value={u.unitType} onCommit={(v) => set((d) => void (d.unitType = v))} /></label>
              <label className="field">Models<Stepper value={u.size} min={1} onChange={(n) => set((d) => void (d.size = n))} /></label>
              <label className="field">Quality<Stepper value={u.quality} min={2} onChange={(n) => set((d) => void (d.quality = Math.min(6, n)))} /></label>
              <label className="field">Defense<Stepper value={u.defense} min={2} onChange={(n) => set((d) => void (d.defense = Math.min(6, n)))} /></label>
              <label className="field">Tough<Stepper value={u.tough} min={1} onChange={(n) => set((d) => void (d.tough = n))} /></label>
              <label className="field">Points<Stepper value={u.points} step={5} min={0} onChange={(n) => set((d) => void (d.points = n))} /></label>
              <label className="field span-2">
                Upgrade category
                <div className="row">
                  <select
                    value={u.categoryOverridden ? u.category : 'auto'}
                    onChange={(e) =>
                      set((d) => {
                        if (e.target.value === 'auto') {
                          d.categoryOverridden = false;
                          d.category = detectCategory({ rules: d.rules, size: d.size, tough: d.tough, name: d.unitType });
                        } else {
                          d.categoryOverridden = true;
                          d.category = e.target.value as Category;
                        }
                      })
                    }
                  >
                    <option value="auto">Auto ({detectCategory({ rules: u.rules, size: u.size, tough: u.tough, name: u.unitType })})</option>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <span className="small" style={{ textTransform: 'none', letterSpacing: 0 }}>{CATEGORY_HINT[u.category]}</span>
              </label>
            </div>
            <div style={{ marginTop: '0.75rem' }}>
              <div className="cat" style={{ marginBottom: 4 }}>Special rules</div>
              {u.rules.map((r, i) => (
                <span key={r + i} className="tag">
                  {r}
                  <button aria-label={`Remove ${r}`} onClick={() => setRules(u.rules.filter((_, j) => j !== i))}>✕</button>
                </span>
              ))}
              <form
                className="row"
                style={{ marginTop: 4 }}
                onSubmit={(e) => {
                  e.preventDefault();
                  if (newRule.trim()) setRules([...u.rules, newRule.trim()]);
                  setNewRule('');
                }}
              >
                <input value={newRule} placeholder="Add rule, e.g. Tough(3)" onChange={(e) => setNewRule(e.target.value)} />
                <button type="submit">Add</button>
              </form>
            </div>
          </div>

          {/* XP */}
          <div className="panel">
            <div className="panel-title">
              <h2>Experience</h2>
              <span className="muted small">{used} of {earned} level(s) spent</span>
            </div>
            <XpBar xp={u.xp} />
            <div className="row" style={{ marginTop: '0.75rem' }}>
              <Stepper value={u.xp} min={0} onChange={(n) => set((d) => void (d.xp = n))} />
              {[1, 2, 3, 5].map((n) => (
                <button key={n} onClick={() => set((d) => void (d.xp += n))}>+{n}</button>
              ))}
              <span className="spacer" />
              <label className="field">Battles<Stepper value={u.battles} min={0} onChange={(n) => set((d) => void (d.battles = n))} /></label>
              <label className="field">Kills<Stepper value={u.kills} min={0} onChange={(n) => set((d) => void (d.kills = n))} /></label>
            </div>
          </div>

          {/* Traits */}
          <div className="panel">
            <div className="panel-title">
              <h2>Traits</h2>
              <div className="row">
                <span className="muted small">{normalCount}/{MAX_NORMAL_TRAITS} normal · {uniqueCount}/{MAX_UNIQUE_TRAITS} unique</span>
                <button className="primary" onClick={() => setPicker({ kind: 'trait' })}>+ Trait</button>
              </div>
            </div>
            {u.upgrades.length === 0 && <p className="muted small">No traits yet.</p>}
            {u.upgrades.map((up, i) => (
              <div key={up.id} className="list-item">
                <div className="grow">
                  <TextField className="wide" value={up.name} onCommit={(v) => set((d) => void (d.upgrades[i].name = v))} />
                </div>
                {up.nexus && <span className="tag cyan">Nexus</span>}
                <label className="row small" title="Unique traits are worth more BP and have their own limit">
                  <input type="checkbox" checked={up.unique} onChange={(e) => set((d) => void (d.upgrades[i].unique = e.target.checked))} />Unique
                </label>
                <label className="row small" title="Free traits don't use a level">
                  <input type="checkbox" checked={!!up.free} onChange={(e) => set((d) => void (d.upgrades[i].free = e.target.checked || undefined))} />Free
                </label>
                <button className="ghost icon" aria-label="Remove trait" onClick={() => set((d) => void d.upgrades.splice(i, 1))}>✕</button>
              </div>
            ))}
          </div>

          {/* Weapons */}
          <div className="panel">
            <div className="panel-title">
              <h2>Weapons</h2>
              <button onClick={() => set((d) => void d.weapons.push({ id: uid(), name: 'New weapon', count: 1, range: 0, attacks: 1, rules: [], traits: [] }))}>
                + Weapon
              </button>
            </div>
            {u.weapons.length === 0 && <p className="muted small">No weapons.</p>}
            {u.weapons.map((w, i) => (
              <WeaponRow
                key={w.id}
                w={w}
                infantry={u.category === 'Infantry'}
                onChange={(fn) => set((d) => fn(d.weapons[i]))}
                onRemove={() => set((d) => void d.weapons.splice(i, 1))}
                onAddTrait={() => setPicker({ kind: 'weaponTrait', weaponId: w.id })}
              />
            ))}
          </div>

          {/* Relics & scars */}
          <div className="cols-2">
            <div className="panel">
              <div className="panel-title">
                <h3>Relics</h3>
                <div className="row">
                  <span className="muted small">{u.relics.length}/{relicSlots(u.xp)} slots</span>
                  <button onClick={() => setPicker({ kind: 'relic' })}>+ Relic</button>
                </div>
              </div>
              {u.relics.length === 0 && <p className="muted small">None.</p>}
              {u.relics.map((r, i) => (
                <div key={r.id} className="list-item">
                  <div className="grow">
                    <b>{r.name}</b>
                    {r.profile && <div className="muted small">{r.profile}</div>}
                  </div>
                  <select value={r.tier} onChange={(e) => set((d) => void (d.relics[i].tier = e.target.value as RelicTier))}>
                    {TIERS.map((t) => <option key={t}>{t}</option>)}
                  </select>
                  <button className="ghost icon" aria-label="Remove relic" onClick={() => set((d) => void d.relics.splice(i, 1))}>✕</button>
                </div>
              ))}
            </div>
            <div className="panel">
              <div className="panel-title">
                <h3>Battle scars</h3>
                <button className="danger" onClick={() => setPicker({ kind: 'scar' })}>+ Scar</button>
              </div>
              {u.scars.length === 0 && <p className="muted small">Unblemished.</p>}
              {u.scars.map((sc, i) => (
                <div key={sc.id} className="list-item">
                  <div className="grow">
                    <b style={{ color: '#e08a80' }}>{sc.name}</b>
                    {sc.desc && <div className="muted small">{sc.desc}</div>}
                  </div>
                  <button className="ghost icon" aria-label="Remove scar" onClick={() => set((d) => void d.scars.splice(i, 1))}>✕</button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div>
          <div className="panel">
            <ForceImage image={u.image} onChange={(img) => set((d) => void (d.image = img))} />
            <div className="stats">
              <div className="stat"><b>{battlePoints(u, s)}</b><span>Battle points</span></div>
              <div className="stat"><b>{earned}</b><span>Level</span></div>
              <div className="stat"><b>{u.points}</b><span>Points</span></div>
            </div>
            <label className="field" style={{ marginTop: '0.75rem' }} title="e.g. +1 for Heroic Rise">
              BP adjustment
              <Stepper value={u.bpAdjust} onChange={(n) => set((d) => void (d.bpAdjust = n))} />
            </label>
          </div>
          <div className="panel">
            <div className="panel-title"><h3>Validation</h3></div>
            <Issues issues={issues} />
          </div>
          <div className="panel">
            <div className="panel-title"><h3>Notes</h3></div>
            <TextArea rows={6} value={u.notes} placeholder="Background, honours, grudges…" onCommit={(v) => set((d) => void (d.notes = v))} />
          </div>
          <div className="panel">
            <button
              className="danger"
              onClick={() => {
                if (!window.confirm(`Delete ${u.name || u.unitType} permanently? (To record a death, set status to Fallen instead.)`)) return;
                updateForce(f.id, (d) => void (d.units = d.units.filter((x) => x.id !== u.id)));
                go(href.force(f.id));
              }}
            >
              Delete unit
            </button>
          </div>
        </div>
      </div>

      {picker && (
        <TablePicker
          title={{ trait: 'Choose a trait', weaponTrait: 'Choose a weapon trait', scar: 'Battle scar', relic: 'Choose a relic' }[picker.kind]}
          groups={pickerGroups()}
          allowFree={picker.kind === 'trait' || picker.kind === 'weaponTrait'}
          onPick={onPick}
          onClose={() => setPicker(null)}
        />
      )}
    </>
  );
}

function WeaponRow({ w, infantry, onChange, onRemove, onAddTrait }: {
  w: Weapon;
  infantry: boolean;
  onChange: (fn: (w: Weapon) => void) => void;
  onRemove: () => void;
  onAddTrait: () => void;
}) {
  return (
    <div className="weapon">
      <div className="weapon-head">
        <input type="number" min={0} value={w.count} title="Count" style={{ width: '3.5rem' }} onChange={(e) => onChange((x) => void (x.count = Number(e.target.value) || 0))} />
        <span className="muted">×</span>
        <TextField className="name" value={w.name} onCommit={(v) => onChange((x) => void (x.name = v))} />
        <label className="row small muted">
          Range
          <input type="number" min={0} step={6} value={w.range} title='0 = melee' style={{ width: '4rem' }} onChange={(e) => onChange((x) => void (x.range = Number(e.target.value) || 0))} />
        </label>
        <label className="row small muted">
          A
          <TextField value={String(w.attacks)} onCommit={(v) => onChange((x) => void (x.attacks = /^\d+$/.test(v) ? Number(v) : v))} className="" />
        </label>
        <button className="ghost icon" aria-label="Remove weapon" onClick={onRemove}>✕</button>
      </div>
      <div className="small" style={{ marginTop: 4 }}>
        <span className="muted">{w.range ? `${w.range}"` : 'Melee'} · </span>
        <TextField
          className="wide"
          value={w.rules.join(', ')}
          placeholder="Weapon rules, e.g. AP(1), Rending"
          onCommit={(v) => onChange((x) => void (x.rules = v.split(',').map((r) => r.trim()).filter(Boolean)))}
        />
      </div>
      <div className="row" style={{ marginTop: 6 }}>
        {w.traits.map((t, i) => (
          <span key={t.id} className={`tag ${t.unique ? 'gold' : 'green'}`} title={t.free ? 'Free' : undefined}>
            {traitMark(t)} {t.name}{t.free && ' (free)'}
            <button aria-label={`Remove ${t.name}`} onClick={() => onChange((x) => void x.traits.splice(i, 1))}>✕</button>
          </span>
        ))}
        <button className="ghost small" onClick={onAddTrait}>+ Trait</button>
        {infantry && <span className="muted small">Infantry: one weapon upgrade = 2 traits</span>}
      </div>
    </div>
  );
}
