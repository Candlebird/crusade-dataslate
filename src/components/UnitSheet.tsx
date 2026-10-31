import { useState } from 'react';
import { useStore } from '../model/store';
import { useCloud } from '../cloud/CloudSync';
import { uid } from '../model/factory';
import type { Unit, UnitStatus, Weapon } from '../model/types';
import {
  CATEGORIES,
  CATEGORY_HINT,
  MAX_NORMAL_TRAITS,
  MAX_SCARS,
  MAX_UNIQUE_TRAITS,
  MAX_WEAPON_TRAITS,
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
  forceTotals,
  detectCategory,
  dropWeaponTrait,
  giveWeaponTrait,
  levelForXp,
  pendingLevels,
  relicCost,
  relicSlots,
  relicHolders,
  relicTaken,
  relicTierAllowed,
  ruleRating,
  upgradesUsed,
  validateUnit,
  xpShown,
} from '../rules/engine';
import { nexusAccess, unitsUsed } from '../rules/nexus';
import { unitName } from '../rules/battle';
import { quirkInfo } from '../rules/sortie';
import { pickTitle } from '../rules/training/titles';
import { UnitRecord } from './training/UnitRecord';
import { unitBookUrl } from '../armyforge/book';
import { go, href } from '../route';
import { EmblemButton } from './Emblem';
import { FORCE_LAYERS, SHAPE_IDS, portraitInForce, randomTop, unitPortrait } from '../model/emblem';
import { ForceImage } from './ForceView';
import TablePicker, { type PickEntry, type PickGroup, type Picked } from './TablePicker';
import { traitMark } from './marks';
import { Issues, Panel, Stepper, TextArea, TextField, XpBar, toast } from './ui';
import { EditModeButton, EditModeNotice, Fixed, useEditMode } from './editMode';
import { localDate } from '../model/date';
import { scarText, statusNote, traitDesc, weaponTraitDesc, xpNextText } from '../model/unitSheet';
import { Icon } from './Icon';
import { WornTag } from './Tags';
import { carryProblem, equipRelic, stowRelic, vaultOf } from '../rules/relicVault';

type Picker =
  | { kind: 'trait' }
  /** `of` traits make up this weapon upgrade (2 for infantry); `n` is the one being picked now. */
  | { kind: 'weaponTrait'; weaponId: string; n: number; of: number; free?: boolean }
  | { kind: 'scar' }
  | { kind: 'relic' };

const TIERS: RelicTier[] = ['Common', 'Rare', 'Legendary'];

const UNIQUE_NOTE = 'Roll on Unique tables only when a reward, relic or Nexus effect says so. A normal level-up uses the normal tables.';

function traitTablesFor(cat: Category): string[] {
  return cat === 'Infantry' ? ['Infantry (Utility)', 'Infantry (Aggressive)'] : [cat];
}

export default function UnitSheet({ forceId, unitId }: { forceId: string; unitId: string }) {
  const { state, updateUnit, updateForce } = useStore();
  const [picker, setPicker] = useState<Picker | null>(null);
  const [newRule, setNewRule] = useState('');
  const f = state.forces.find((x) => x.id === forceId);
  const u = f?.units.find((x) => x.id === unitId);
  const { edit } = useEditMode(f);
  const cloud = useCloud();
  const theirs = !!f && !!cloud.email && !!f.owner && f.owner !== cloud.email;
  if (!f || !u) return <div className="panel empty">Unit not found. <a href={href.forces()}>Back to forces</a></div>;

  const set = (fn: (d: Unit) => void) => updateUnit(f.id, u.id, fn);
  const s = state.settings;
  const bookUrl = unitBookUrl(u, state.books);
  const issues = validateUnit(u);
  const earned = levelForXp(u.xp);
  const used = upgradesUsed(u);
  const pending = pendingLevels(u);
  const canRelic = (u.category === 'Hero' || !!u.heroicRise) && u.relics.length < relicSlots(u.xp);
  const rp = forceTotals(f, s).rp;
  // A Sortie or Training-feat relic the force has won and nobody carries yet: this unit can take it without RP.
  const wonRelics = RELICS.filter((r) => (r.sortie && f.sortie?.relics?.includes(r.sortie)) || (r.training && f.trainingRelics?.includes(r.name)));
  const freeRelicDue = canRelic && wonRelics.length > 0 && (() => {
    const held = relicHolders(state.forces, state.campaign);
    return wonRelics.some((r) => !relicTaken(held, r.name) && relicTierAllowed(r.tier, u.xp));
  })();
  const normalCount = u.upgrades.filter((x) => !x.unique).length;
  const uniqueCount = u.upgrades.filter((x) => x.unique).length;

  const setRules = (rules: string[]) =>
    set((d) => {
      d.rules = rules;
      d.tough = ruleRating(rules, 'Tough') ?? d.tough;
      if (!d.categoryOverridden) d.category = detectCategory({ rules, size: d.size, tough: d.tough, name: d.unitType });
    });

  const access = nexusAccess(f, u.category);

  const addWeaponTrait = (weaponId: string) => setPicker({ kind: 'weaponTrait', weaponId, n: 1, of: u.category === 'Infantry' ? 2 : 1 });

  /** What the unit or weapon already has, so rolls reroll duplicates. */
  const pickerOwned = (): string[] => {
    if (picker?.kind === 'trait') return u.upgrades.map((x) => x.name);
    if (picker?.kind === 'weaponTrait') return u.weapons.find((x) => x.id === picker.weaponId)?.traits.map((x) => x.name) ?? [];
    return [];
  };

  const pickerGroups = (): PickGroup[] => {
    if (!picker) return [];
    if (picker.kind === 'trait') {
      const groups: PickGroup[] = traitTablesFor(u.category).map((k) => ({
        key: `normal:${k}`, label: k, entries: TRAIT_TABLES[k] ?? [], rollable: true,
      }));
      groups.push({ key: 'unique', label: 'Unique', entries: UNIQUE_TRAIT_TABLES[u.category] ?? [], rollable: true, restricted: UNIQUE_NOTE });
      const locked = access === null ? `${u.category} Nexus table locked. Unlock it in Nexus Wars or earn a trait token.` : undefined;
      groups.push({
        key: 'nexus',
        label: access === 'token' ? 'Nexus (uses a token)' : 'Nexus',
        entries: (NEXUS_TRAITS[u.category] ?? []).map((t) => ({ name: t.name, desc: t.desc, disabled: locked })),
        rollable: !locked,
      });
      return groups;
    }
    if (picker.kind === 'weaponTrait') {
      const w = u.weapons.find((x) => x.id === picker.weaponId);
      const kind = w && w.range > 0 ? 'Ranged' : 'Melee';
      return [
        { key: 'normal', label: `${kind} traits`, entries: WEAPON_TRAIT_TABLES[kind], rollable: true },
        { key: 'unique', label: `Unique ${kind.toLowerCase()}`, entries: UNIQUE_WEAPON_TRAIT_TABLES[kind], rollable: true, restricted: UNIQUE_NOTE },
      ];
    }
    if (picker.kind === 'scar') return [{ key: 'scar', label: 'Battle scars', entries: SCAR_TABLE, rollable: true }];
    const held = relicHolders(state.forces, state.campaign);
    const earned = f.sortie?.relics ?? [];
    const won = f.trainingRelics ?? [];
    const relicGroup = (key: string, label: string, list: typeof RELICS): PickGroup => ({
      key,
      label,
      entries: list.map((r) => ({
        name: r.name,
        desc: [r.sortie || r.training ? 'Free' : `${relicCost(r.tier)} RP`, r.profile, r.desc, r.note].filter(Boolean).join(' · '),
        disabled: relicTaken(held, r.name) ?? (relicTierAllowed(r.tier, u.xp) ? undefined : `${r.tier} relics need ${RELIC_TIER_MIN_XP[r.tier]}+ XP`),
        meta: r,
      })),
    });
    return [
      ...TIERS.map((t) => relicGroup(t, t, RELICS.filter((r) => r.tier === t && !r.nexus && !r.training))),
      relicGroup('nexus', 'Nexus', RELICS.filter((r) => r.nexus)),
      ...(earned.length ? [relicGroup('sortie', 'Sortie (free)', RELICS.filter((r) => r.sortie && earned.includes(r.sortie)))] : []),
      ...(won.length ? [relicGroup('training', 'Training feats (free)', RELICS.filter((r) => r.training && won.includes(r.name)))] : []),
    ];
  };

  /** Relics are bought with RP at their tier's requisition price, unless taken free (e.g. as a reward). */
  const relicCheck = (e: PickEntry | null, free: boolean): string | null => {
    const meta = e?.meta as (typeof RELICS)[number] | undefined;
    if (!e || free || meta?.sortie || meta?.training) return null;
    const cost = relicCost((e.meta as (typeof RELICS)[number] | undefined)?.tier ?? 'Common');
    return cost > rp ? `Needs ${cost} RP (the force has ${rp}).` : null;
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
      // The trait goes on one copy of the weapon (split off from the stack), and an infantry upgrade's second trait follows it.
      const copy = uid();
      set((d) => void giveWeaponTrait(d, picker.weaponId, { id: uid(), name: p.name, unique: p.group === 'unique', free: p.free || undefined }, () => copy));
      const weaponId = (u.weapons.find((x) => x.id === picker.weaponId)?.count ?? 1) > 1 ? copy : picker.weaponId;
      // An infantry weapon upgrade is two traits: keep the picker open for the second.
      if (picker.n < picker.of) return setPicker({ ...picker, weaponId, n: picker.n + 1, free: p.free });
    } else if (picker.kind === 'scar') {
      const result = applyScar(structuredClone(u), { id: uid(), name: p.name });
      set((d) => void applyScar(d, { id: uid(), name: p.name, desc: SCAR_TABLE.find((x) => x.name === p.name)?.desc }));
      if (result === 'comatose') toast(`${u.name || u.unitType} is comatose and sits out next game.`);
      if (result === 'removed') toast(`4th scar: ${u.name || u.unitType} is removed from the army.`, 'error');
    } else {
      const def = p.meta as (typeof RELICS)[number] | undefined;
      const tier = def?.tier ?? 'Common';
      const cost = p.free || def?.sortie || def?.training ? 0 : relicCost(tier);
      updateForce(f.id, (fd) => {
        fd.units.find((x) => x.id === u.id)?.relics.push({ id: uid(), name: p.name, tier, profile: def?.profile, note: def?.note });
        if (cost) fd.ledger.push({ id: uid(), date: localDate(), label: `${tier} Relic — ${unitName(u)}: ${p.name}`, rp: -cost, supply: 0 });
      });
      if (cost) toast(`${unitName(u)} gains ${p.name} for ${cost} RP.`);
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
          <h1 className="with-emblem">
            <EmblemButton emblem={u.portrait && unitPortrait(u, f)} fallback={portraitInForce(u, f)} readOnly={theirs} title="Portrait"
              fixedLayers={FORCE_LAYERS} roll={() => portraitInForce(u, f, randomTop(portraitInForce(u, f).slice(0, FORCE_LAYERS), Math.random, SHAPE_IDS))}
              onChange={(e) => set((d) => void (d.portrait = e))}>
              <p className="muted small" style={{ margin: 0 }}>
                Stands for the unit in Training and on a Sortie. Background and middle come from the force's emblem.
                {theirs ? ` Only ${f.owner} can change it.` : ' Pick the top layer here.'}
              </p>
            </EmblemButton>
            {u.name || u.unitType || 'Unnamed unit'}</h1>
          <div className="muted">
            {u.name && u.unitType}
            {u.name && u.bookName && ' · '}
            {u.bookName}
            {bookUrl && <> · <a href={bookUrl} target="_blank" rel="noreferrer">View on Army Forge <Icon name="l:external-link" /></a></>}
          </div>
        </div>
        <div className="row">
          {edit && (u.heroicRise || u.category !== 'Hero') && (
            <label className="row small muted" data-tip="Requisition: may carry a relic like a Hero">
              <input type="checkbox" checked={!!u.heroicRise} onChange={(e) => set((d) => void (d.heroicRise = e.target.checked || undefined))} />
              Heroic Rise
            </label>
          )}
          {edit ? (
            <label className="row small muted">
              Status
              <select value={u.status} onChange={(e) => set((d) => void (d.status = e.target.value as UnitStatus))}>
                <option value="active">Active</option>
                <option value="comatose">Comatose (sits out)</option>
                <option value="removed">Fallen / removed</option>
              </select>
            </label>
          ) : (
            <>
              {u.heroicRise && <span className="tag gold">Heroic Rise</span>}
              {u.status === 'comatose' && <span className="tag cyan">Comatose</span>}
              {u.status === 'removed' && <span className="tag red">Fallen</span>}
              {u.status === 'active' && unitsUsed(f, state.campaign).includes(u.id) && <WornTag />}
            </>
          )}
          <EditModeButton f={f} />
        </div>
      </div>

      <EditModeNotice f={f} />

      {statusNote(u) && (
        <div className={`panel notice unit-status ${u.status}`}>
          <b>{statusNote(u)}</b>
        </div>
      )}

      {theirs && (
        <div className="panel notice">
          <b>{f.owner}</b>'s unit. You can view it, but only they can change it{pending > 0 && ` (it has ${pending} upgrade${pending > 1 ? 's' : ''} to pick)`}.
        </div>
      )}

      {pending > 0 && !theirs && (
        <div className="panel notice">
          <div className="panel-title">
            <h3><Icon name="g:upgrade" /> Level {earned} reached — {pending} upgrade{pending > 1 ? 's' : ''} to pick</h3>
          </div>
          <p className="muted small" style={{ marginTop: 0 }}>Each level buys one trait, weapon trait or relic (a hero's first relic doesn't need one).</p>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <button className="primary" onClick={() => setPicker({ kind: 'trait' })}>Roll a trait</button>
            {u.weapons.length > 0 && (
              <>
              <b className="muted small">OR</b>
              <select value="" onChange={(e) => e.target.value && addWeaponTrait(e.target.value)} aria-label="Add a weapon trait">
                <option value="">Weapon trait for…</option>
                {u.weapons.map((w) => {
                  // A stack of copies always has room: the upgrade splits off a fresh copy.
                  const full = w.count === 1 && w.traits.length >= MAX_WEAPON_TRAITS;
                  return (
                    <option key={w.id} value={w.id} disabled={full} title={full ? 'This weapon has the max upgrades' : undefined}>
                      {w.name} ({Math.min(w.traits.length, MAX_WEAPON_TRAITS)}/{MAX_WEAPON_TRAITS}){full && ' - max upgrades'}
                    </option>
                  );
                })}
              </select>
              </>
            )}
            {canRelic && (
              <>
                <b className="muted small">OR</b>
                <button onClick={() => setPicker({ kind: 'relic' })}>
                  {freeRelicDue && rp < relicCost('Common') ? 'Pick your free relic' : `Buy a relic (from ${relicCost('Common')} RP)`}
                </button>
                <span className="muted small">{rp} RP available</span>
              </>
            )}
          </div>
        </div>
      )}

      <div className="cols-main">
        <div>
          {/* XP */}
          <Panel
            id="unit.xp"
            title="Experience"
            extra={
              <span className="row">
                <span className="muted small" data-tip="Each level buys one trait, weapon trait or relic (a hero's first relic doesn't need one)">{used} of {earned} upgrade{earned === 1 ? '' : 's'} used</span>
                {pending > 0 && <span className="tag gold">{pending} to pick</span>}
              </span>
            }
          >
            <XpBar xp={u.xp} />
            <p className="small muted" style={{ marginBottom: 0 }}>
              {xpNextText(u.xp)}
              {!edit && <> {u.battles} battle{u.battles === 1 ? '' : 's'} · {u.kills} kill{u.kills === 1 ? '' : 's'}.</>}
            </p>
            {edit && <div className="row" style={{ marginTop: '0.75rem' }}>
              <Stepper value={xpShown(u.xp)} min={0} onChange={(n) => set((d) => void (d.xp = n + d.xp - xpShown(d.xp)))} />
              {[1, 2, 3, 5].map((n) => (
                <button key={n} onClick={() => set((d) => void (d.xp += n))}>+{n}</button>
              ))}
              <span className="spacer" />
              <label className="field">Battles<Stepper value={u.battles} min={0} onChange={(n) => set((d) => void (d.battles = n))} /></label>
              <label className="field">Kills<Stepper value={u.kills} min={0} onChange={(n) => set((d) => void (d.kills = n))} /></label>
            </div>}
          </Panel>

          {/* Traits */}
          <Panel
            id="unit.traits"
            title="Traits"
            extra={
              <div className="row">
                <span className="muted small">{normalCount}/{MAX_NORMAL_TRAITS} normal · {uniqueCount}/{MAX_UNIQUE_TRAITS} unique</span>
                {edit && <button className="primary" onClick={() => setPicker({ kind: 'trait' })}>+ Trait</button>}
              </div>
            }
          >
            {u.upgrades.length === 0 && <p className="muted small">No traits yet.</p>}
            {u.upgrades.map((up, i) => !edit ? (
              <div key={up.id} className="list-item">
                <div className="grow">
                  <b>{traitMark(up)} {up.name}</b>
                  {traitDesc(up.name) && <div className="muted small">{traitDesc(up.name)}</div>}
                </div>
                {up.nexus && <span className="tag cyan">Nexus</span>}
                {up.unique && !up.nexus && <span className="tag gold">Unique</span>}
                {up.free && <span className="tag">Free</span>}
              </div>
            ) : (
              <div key={up.id} className="list-item">
                <div className="grow">
                  <TextField className="wide" value={up.name} onCommit={(v) => set((d) => void (d.upgrades[i].name = v))} />
                  {traitDesc(up.name) && <div className="muted small" style={{ marginTop: 2 }}>{traitDesc(up.name)}</div>}
                </div>
                {up.nexus && <span className="tag cyan">Nexus</span>}
                <label className="row small" data-tip="Unique traits are worth more BP and have their own limit">
                  <input type="checkbox" checked={up.unique} onChange={(e) => set((d) => void (d.upgrades[i].unique = e.target.checked))} />Unique
                </label>
                <label className="row small" data-tip="Free traits don't use a level">
                  <input type="checkbox" checked={!!up.free} onChange={(e) => set((d) => void (d.upgrades[i].free = e.target.checked || undefined))} />Free
                </label>
                <button className="ghost icon" aria-label="Remove trait" onClick={() => set((d) => void d.upgrades.splice(i, 1))}><Icon name="l:x" /></button>
              </div>
            ))}
          </Panel>

          {/* Profile */}
          <Panel id="unit.profile" title="Profile">
            <div className="fields">
              <label className="field span-2">Crusade name{theirs ? <Fixed>{u.name || '—'}</Fixed> : <TextField value={u.name} placeholder="Give it a name, e.g. The Iron Fang" onCommit={(v) => set((d) => void (d.name = v))} />}</label>
              {!edit && (
                <>
                  <label className="field span-2">Datasheet<Fixed>{u.unitType}</Fixed></label>
                  <label className="field">Models<Fixed>{u.size}</Fixed></label>
                  <label className="field">Quality<Fixed>{u.quality}+</Fixed></label>
                  <label className="field">Defense<Fixed>{u.defense}+</Fixed></label>
                  <label className="field">Tough<Fixed>{u.tough}</Fixed></label>
                  <label className="field">Points<Fixed>{u.points}</Fixed></label>
                  <label className="field span-2">Upgrade category<Fixed>{u.category}</Fixed></label>
                </>
              )}
              {edit && <>
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
              </>}
            </div>
            <div style={{ marginTop: '0.75rem' }}>
              <div className="cat" style={{ marginBottom: 4 }}>Special rules</div>
              {!u.rules.length && !edit && <span className="muted small">None.</span>}
              {u.rules.map((r, i) => (
                <span key={r + i} className="tag">
                  {r}
                  {edit && <button aria-label={`Remove ${r}`} onClick={() => setRules(u.rules.filter((_, j) => j !== i))}><Icon name="l:x" /></button>}
                </span>
              ))}
              {edit && <form
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
              </form>}
            </div>
          </Panel>

          {/* Weapons */}
          <Panel
            id="unit.weapons"
            title="Weapons"
            extra={edit && (
              <button onClick={() => set((d) => void d.weapons.push({ id: uid(), name: 'New weapon', count: 1, range: 0, attacks: 1, rules: [], traits: [] }))}>
                + Weapon
              </button>
            )}
          >
            {u.weapons.length === 0 && <p className="muted small">No weapons.</p>}
            {u.weapons.map((w, i) => !edit ? <FixedWeapon key={w.id} w={w} /> : (
              <WeaponRow
                key={w.id}
                w={w}
                infantry={u.category === 'Infantry'}
                onChange={(fn) => set((d) => fn(d.weapons[i]))}
                onRemove={() => set((d) => void d.weapons.splice(i, 1))}
                onAddTrait={() => addWeaponTrait(w.id)}
                onRemoveTrait={(traitId) => set((d) => dropWeaponTrait(d, w.id, traitId))}
              />
            ))}
          </Panel>

          {/* Relics & scars */}
          <div className="cols-2">
            <Panel
              id="unit.relics"
              title="Relics"
              h={3}
              extra={
                <div className="row">
                  <span className="muted small">{u.relics.length}/{relicSlots(u.xp)} slots</span>
                  {edit && <button onClick={() => setPicker({ kind: 'relic' })}>+ Relic</button>}
                </div>
              }
            >
              {u.relics.length === 0 && <p className="muted small">None.</p>}
              {!theirs && vaultOf(f).length > 0 && (
                <label className="row small">
                  From the vault
                  <select value="" onChange={(e) => e.target.value && updateForce(f.id, (d) => void equipRelic(d, u.id, e.target.value))}>
                    <option value="">Take a relic…</option>
                    {vaultOf(f).map((r) => {
                      const why = carryProblem(u, r);
                      return <option key={r.id} value={r.id} disabled={!!why} title={why}>{r.name} ({r.tier}){why ? ` - ${why}` : ''}</option>;
                    })}
                  </select>
                </label>
              )}
              {u.relics.map((r, i) => (
                <div key={r.id} className="list-item">
                  <div className="grow">
                    <b>{r.name}</b>
                    {r.profile && <div className="muted small">{r.profile}</div>}
                  </div>
                  {!theirs && (
                    <button className="ghost small" title="Put it in the force's relic vault, to give to another unit" onClick={() => updateForce(f.id, (d) => void stowRelic(d, u.id, r.id))}>
                      To vault
                    </button>
                  )}
                  {edit ? (
                    <>
                      <select value={r.tier} onChange={(e) => set((d) => void (d.relics[i].tier = e.target.value as RelicTier))}>
                        {TIERS.map((t) => <option key={t}>{t}</option>)}
                      </select>
                      <button className="ghost icon" aria-label="Remove relic" onClick={() => set((d) => void d.relics.splice(i, 1))}><Icon name="l:x" /></button>
                    </>
                  ) : <span className="tag gold">{r.tier}</span>}
                </div>
              ))}
            </Panel>
            <Panel id="unit.scars" title="Battle scars" h={3} extra={edit && <button className="danger" onClick={() => setPicker({ kind: 'scar' })}>+ Scar</button>}>
              {u.scars.length === 0 ? <p className="muted small">Unblemished.</p> : (
                <p className="small" style={{ marginTop: 0, color: u.scars.length >= MAX_SCARS ? 'var(--warn)' : undefined }}>{scarText(u)}</p>
              )}
              {u.scars.map((sc, i) => (
                <div key={sc.id} className="list-item">
                  <div className="grow">
                    <b style={{ color: '#e08a80' }}>{sc.name}</b>
                    {sc.desc && <div className="muted small">{sc.desc}</div>}
                  </div>
                  {edit && <button className="ghost icon" aria-label="Remove scar" onClick={() => set((d) => void d.scars.splice(i, 1))}><Icon name="l:x" /></button>}
                </div>
              ))}
            </Panel>
            <UnitRecord f={f} u={u} onPick={theirs ? undefined : (id) => set((d) => pickTitle(d, id))} />
            {u.quirks?.length ? (
              <Panel id="unit.quirks" title="Sortie quirks" h={3}>
                <p className="muted small" style={{ marginTop: 0 }}>Picked up on Sorties. They apply on Sorties and in Training; morale quirks only on Sorties.</p>
                {u.quirks.map((id, i) => {
                  const q = quirkInfo(id);
                  return q ? (
                    <div key={id} className="list-item">
                      <div className="grow">
                        <b style={{ color: q.good ? 'var(--green)' : '#e08a80' }}>{q.name}</b>
                        <div className="muted small">{q.text}</div>
                      </div>
                      {edit && <button className="ghost icon" aria-label="Remove quirk" onClick={() => set((d) => void d.quirks?.splice(i, 1))}><Icon name="l:x" /></button>}
                    </div>
                  ) : null;
                })}
              </Panel>
            ) : null}
          </div>
        </div>

        {/* Sidebar */}
        <div>
          <div className="panel">
            <ForceImage image={u.image} readOnly={theirs} onChange={(img) => set((d) => void (d.image = img))} />
            <div className="stats">
              <div className="stat"><b>{battlePoints(u, s)}</b><span>Battle points</span></div>
              <div className="stat"><b>{earned}</b><span>Level</span></div>
              <div className="stat"><b>{u.points}</b><span>Points</span></div>
            </div>
            <label className="field" style={{ marginTop: '0.75rem' }} data-tip="e.g. +1 for Heroic Rise">
              BP adjustment
              {edit ? <Stepper value={u.bpAdjust} onChange={(n) => set((d) => void (d.bpAdjust = n))} /> : <Fixed>{u.bpAdjust > 0 ? `+${u.bpAdjust}` : u.bpAdjust}</Fixed>}
            </label>
          </div>
          <Panel id="unit.validation" title="Validation" h={3}>
            <Issues issues={issues} />
          </Panel>
          {theirs ? u.notes && (
            <Panel id="unit.notes" title="Notes" h={3}>
              <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{u.notes}</p>
            </Panel>
          ) : (
            <Panel id="unit.notes" title="Notes" h={3}>
              <TextArea rows={6} value={u.notes} placeholder="Background, honours, grudges…" onCommit={(v) => set((d) => void (d.notes = v))} />
            </Panel>
          )}
          {edit && <div className="panel">
            <button
              className="danger"
              onClick={() => {
                if (!window.confirm(`Delete ${u.name || u.unitType} for good? To record a death, set status to Fallen instead.`)) return;
                updateForce(f.id, (d) => void (d.units = d.units.filter((x) => x.id !== u.id)));
                go(href.force(f.id));
              }}
            >
              Delete unit
            </button>
          </div>}
        </div>
      </div>

      {picker && (
        <TablePicker
          title={{ trait: 'Choose a trait', weaponTrait: picker.kind === 'weaponTrait' && picker.of > 1 ? `Choose weapon trait ${picker.n} of ${picker.of}` : 'Choose a weapon trait', scar: 'Battle scar', relic: 'Choose a relic' }[picker.kind]}
          groups={pickerGroups()}
          allowFree={picker.kind !== 'scar'}
          freeLabel={picker.kind === 'relic' ? 'Free (no RP, e.g. a reward)' : undefined}
          check={picker.kind === 'relic' ? relicCheck : undefined}
          owned={pickerOwned()}
          key={picker.kind === 'weaponTrait' ? `${picker.weaponId}:${picker.n}` : picker.kind}
          defaultFree={picker.kind === 'weaponTrait' && !!picker.free}
          intro={picker.kind === 'weaponTrait' && picker.of > 1 && (
            <p className="small">
              <b>Trait {picker.n} of {picker.of}.</b> <span className="muted">An infantry weapon upgrade gives {picker.of} traits. Rolls skip ones the weapon has.</span>
            </p>
          )}
          onPick={onPick}
          onClose={() => setPicker(null)}
        />
      )}
    </>
  );
}

/** A weapon's profile and traits, read-only. */
function FixedWeapon({ w }: { w: Weapon }) {
  return (
    <div className="weapon">
      <div className="weapon-head">
        <b>{w.count > 1 ? `${w.count}× ` : ''}{w.name}</b>
        <span className="muted small">{w.range ? `${w.range}"` : 'Melee'} · A{w.attacks}{w.rules.length ? ` · ${w.rules.join(', ')}` : ''}</span>
      </div>
      {w.traits.length > 0 && (
        <div className="row" style={{ marginTop: 6 }}>
          {w.traits.map((t) => (
            <span key={t.id} className={`tag ${t.unique ? 'gold' : 'green'}`} data-tip={weaponTraitDesc(t.name) ?? (t.free ? 'Free' : undefined)}>
              {traitMark(t)} {t.name}{t.free && ' (free)'}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function WeaponRow({ w, infantry, onChange, onRemove, onAddTrait, onRemoveTrait }: {
  w: Weapon;
  infantry: boolean;
  onChange: (fn: (w: Weapon) => void) => void;
  onRemove: () => void;
  onAddTrait: () => void;
  onRemoveTrait: (traitId: string) => void;
}) {
  return (
    <div className="weapon">
      <div className="weapon-head">
        <input type="number" min={0} value={w.count} data-tip="Count" aria-label="Count" style={{ width: '3.5rem' }} onChange={(e) => onChange((x) => void (x.count = Number(e.target.value) || 0))} />
        <span className="muted">×</span>
        <TextField className="name" value={w.name} onCommit={(v) => onChange((x) => void (x.name = v))} />
        <label className="row small muted">
          Range
          <input type="number" min={0} step={6} value={w.range} data-tip='0 = melee' style={{ width: '4rem' }} onChange={(e) => onChange((x) => void (x.range = Number(e.target.value) || 0))} />
        </label>
        <label className="row small muted">
          A
          <TextField value={String(w.attacks)} onCommit={(v) => onChange((x) => void (x.attacks = /^\d+$/.test(v) ? Number(v) : v))} className="" />
        </label>
        <button className="ghost icon" aria-label="Remove weapon" onClick={onRemove}><Icon name="l:x" /></button>
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
        {w.traits.map((t) => (
          <span key={t.id} className={`tag ${t.unique ? 'gold' : 'green'}`} data-tip={t.free ? 'Free' : undefined}>
            {traitMark(t)} {t.name}{t.free && ' (free)'}
            <button aria-label={`Remove ${t.name}`} onClick={() => onRemoveTrait(t.id)}><Icon name="l:x" /></button>
          </span>
        ))}
        <button className="ghost small" onClick={onAddTrait}>+ Trait</button>
        {infantry && <span className="muted small">Infantry: one weapon upgrade = 2 traits</span>}
      </div>
    </div>
  );
}
