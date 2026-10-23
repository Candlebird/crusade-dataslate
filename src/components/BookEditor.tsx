import { useState } from 'react';
import { splitRules } from '../model/bookEdit';
import type { CatalogUnit } from '../model/types';
import { Modal, confirmAction } from './ui';
import { Icon } from './Icon';

type CatalogWeapon = CatalogUnit['weapons'][number];

const num = (s: string) => (Number.isFinite(Number(s)) ? Number(s) : 0);

/** Edit one datasheet of an army book by hand. Units already built from it keep their own values. */
export function DatasheetEditor({ unit, onSave, onClose }: { unit: CatalogUnit; onSave: (u: CatalogUnit) => void; onClose: () => void }) {
  const [u, setU] = useState<CatalogUnit>(() => structuredClone(unit));
  const [rules, setRules] = useState(unit.rules.join(', '));
  const [weaponRules, setWeaponRules] = useState(() => unit.weapons.map((w) => w.rules.join(', ')));
  const set = (patch: Partial<CatalogUnit>) => setU((x) => ({ ...x, ...patch }));
  const setWeapon = (i: number, patch: Partial<CatalogWeapon>) => set({ weapons: u.weapons.map((w, j) => (j === i ? { ...w, ...patch } : w)) });
  const removeWeapon = (i: number) => {
    set({ weapons: u.weapons.filter((_, j) => j !== i) });
    setWeaponRules((r) => r.filter((_, j) => j !== i));
  };
  const addWeapon = () => {
    set({ weapons: [...u.weapons, { name: 'New weapon', count: u.size, range: 0, attacks: 1, rules: [] }] });
    setWeaponRules((r) => [...r, '']);
  };
  const save = () => {
    onSave({
      ...u,
      name: u.name.trim() || 'Unnamed unit',
      rules: splitRules(rules),
      weapons: u.weapons.map((w, i) => ({ ...w, rules: splitRules(weaponRules[i] ?? '') })),
    });
  };

  return (
    <Modal
      title={`Edit ${unit.name}`}
      onClose={onClose}
      wide
      footer={<><button onClick={onClose}>Cancel</button><button className="primary" onClick={save}>Save datasheet</button></>}
    >
      <div className="row">
        <label className="field grow"><span>Name</span><input value={u.name} onChange={(e) => set({ name: e.target.value })} /></label>
        <label className="field"><span>Points</span><input type="number" min={0} value={u.cost} onChange={(e) => set({ cost: num(e.target.value) })} style={{ width: '6rem' }} /></label>
        <label className="field"><span>Models</span><input type="number" min={1} value={u.size} onChange={(e) => set({ size: num(e.target.value) })} style={{ width: '5rem' }} /></label>
        <label className="field"><span>Quality</span><input type="number" min={2} max={6} value={u.quality} onChange={(e) => set({ quality: num(e.target.value) })} style={{ width: '5rem' }} /></label>
        <label className="field"><span>Defense</span><input type="number" min={2} max={6} value={u.defense} onChange={(e) => set({ defense: num(e.target.value) })} style={{ width: '5rem' }} /></label>
      </div>
      <label className="field">
        <span>Special rules (comma separated)</span>
        <input value={rules} placeholder="Hero, Tough(3), Fearless" onChange={(e) => setRules(e.target.value)} />
      </label>

      <h3>Weapons</h3>
      <div className="table-wrap">
        <table>
          <thead><tr><th className="num">Count</th><th>Name</th><th className="num">Range (0 = melee)</th><th className="num">Attacks</th><th>Rules</th><th /></tr></thead>
          <tbody>
            {u.weapons.map((w, i) => (
              <tr key={i}>
                <td className="num"><input type="number" min={1} value={w.count} onChange={(e) => setWeapon(i, { count: num(e.target.value) })} style={{ width: '4rem' }} /></td>
                <td><input value={w.name} onChange={(e) => setWeapon(i, { name: e.target.value })} /></td>
                <td className="num"><input type="number" min={0} value={w.range} onChange={(e) => setWeapon(i, { range: num(e.target.value) })} style={{ width: '4.5rem' }} /></td>
                <td className="num">
                  <input value={w.attacks} style={{ width: '4.5rem' }}
                    onChange={(e) => setWeapon(i, { attacks: /^\d+$/.test(e.target.value) ? Number(e.target.value) : e.target.value })} />
                </td>
                <td><input value={weaponRules[i] ?? ''} placeholder="AP(1), Rending" onChange={(e) => setWeaponRules((r) => r.map((x, j) => (j === i ? e.target.value : x)))} /></td>
                <td><button className="ghost icon" aria-label={`Remove ${w.name}`} onClick={() => removeWeapon(i)}><Icon name="l:x" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button onClick={addWeapon}>+ Add weapon</button>

      {u.sections.length > 0 && (
        <>
          <h3>Upgrades</h3>
          <p className="muted small">Upgrade options aren't edited here. Remove the ones this unit shouldn't offer.</p>
          {u.sections.map((s) => (
            <div key={s.id} className="list-item small">
              <span className="grow"><b>{s.label}</b> <span className="muted">{s.options.map((o) => `${o.label} (+${o.cost})`).join(' · ')}</span></span>
              <button className="ghost icon" aria-label={`Remove ${s.label}`}
                onClick={() => confirmAction(`Remove the "${s.label}" upgrades from ${u.name}?`) && set({ sections: u.sections.filter((x) => x.id !== s.id) })}><Icon name="l:x" /></button>
            </div>
          ))}
        </>
      )}
    </Modal>
  );
}
