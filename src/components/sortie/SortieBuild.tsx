import { useEffect } from 'react';
import { SORTIE_SPECS } from '../../rules/downtimeData';
import type { SortieRun } from '../../rules/sortie';
import { buildOf, PAIR_STATUS } from '../../rules/sortieBuild';
import { TIER_TAG } from '../training/CardOffer';

const KIND = { boon: 'Boon', stratagem: 'Stratagem', trophy: 'Trophy' } as const;

/** The Sortie build panel: each unit's numbers with its boons on, the boons, stratagems and what the party knows of the
 *  lord. Everything is written out, so it reads the same on a phone. Opens with B or the Build button. */
export function SortieBuild({ run, onClose }: { run: SortieRun; onClose: () => void }) {
  const b = buildOf(run);
  useEffect(() => {
    // Escape and B close the panel, not the whole Sortie.
    const on = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' && e.key.toLowerCase() !== 'b') return;
      e.stopImmediatePropagation();
      e.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', on, true);
    return () => window.removeEventListener('keydown', on, true);
  }, [onClose]);
  return (
    <div className="sortie-build" role="dialog" aria-modal="true" aria-label="Build">
      <div className="sortie-build-pane">
        <h2>Build</h2>
        <p className="muted small">Numbers with every boon and speciality on. {b.rerolls ? `${b.rerolls} reroll${b.rerolls === 1 ? '' : 's'} left.` : 'No rerolls left.'}</p>

        <h3>Units</h3>
        <ul>
          {b.units.map((u, i) => (
            <li key={i} className="sortie-build-unit">
              <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                <b>{u.name}</b>
                <span className="sortie-chip">{u.slot}</span>
                <span className="sortie-chip">{u.up}/{u.models} models · {u.hp}/{u.max} wounds</span>
              </div>
              <div className="sortie-build-stats small">
                <span>Shoot <b>{u.shoot}+</b></span>
                <span>Melee <b>{u.melee}+</b></span>
                <span>Defense <b>{u.defense}+</b></span>
                <span>Initiative <b>{u.init >= 0 ? `+${u.init}` : u.init}</b></span>
              </div>
              {u.guns.map((g) => (
                <div key={`${g.name}${g.melee}`} className="small">
                  <b>{g.name}</b> <span className="muted">{g.melee ? 'melee' : 'shooting'}, {g.reach}</span> · {+g.attacks.toFixed(1)} attacks{g.ap ? `, AP(${g.ap})` : ''}
                  {g.tags.map((t) => <span key={t} className="sortie-chip">{t}</span>)}
                </div>
              ))}
              {u.skills.length > 0 && (
                <div className="small">
                  {u.skills.map((s) => <span key={s.name} className="sortie-chip">{s.name}: every {s.cd} round{s.cd === 1 ? '' : 's'}{s.wait ? `, ready in ${s.wait}` : ''}</span>)}
                </div>
              )}
              {u.spec ? (
                <div className="small"><b className="sortie-gold">{u.spec.name}</b> <span className="muted">{u.spec.text}</span></div>
              ) : u.choices.length > 0 && (
                <div className="small muted">{u.due ? 'Speciality ready: pick it on the map.' : `Speciality after 2 fights won standing: ${u.choices.map((c) => SORTIE_SPECS[c].name).join(' or ')}.`}</div>
              )}
              {u.boons.map((t) => <div key={t} className="small muted">{t}</div>)}
            </li>
          ))}
        </ul>

        <h3>Stratagems</h3>
        {!b.pairs.length && <p className="small muted">None building. Hold both boons of a pair and its stratagem comes in your next offer, once.</p>}
        <ul>
          {b.pairs.map((p) => (
            <li key={p.id} className={`sortie-build-pair ${p.status}`}>
              <div>
                <b>{p.name}</b> <span className="sortie-chip">{PAIR_STATUS[p.status]}</span>
                <div className="small">{p.needs.map((n) => <span key={n.name} className={`sortie-chip${n.held ? ' held' : ''}`}>{n.held ? '✓' : '○'} {n.name}</span>)}</div>
                <p className="small">{p.text}</p>
                {p.lock && <p className="small muted">Unlock: {p.lock}.</p>}
              </div>
            </li>
          ))}
        </ul>

        <h3>Boons</h3>
        {!b.boons.length && <p className="small muted">None yet.</p>}
        <ul>
          {b.boons.map((x) => (
            <li key={x.id}>
              <div>
                <b className={x.curse ? 'sortie-cursed' : undefined}>{x.label}</b>{' '}
                {!x.curse && <span className={`tag ${TIER_TAG[x.tier]}`}>{x.tier}</span>}
                {x.kind !== 'boon' && <span className="sortie-chip">{KIND[x.kind]}</span>}
                {x.curse && <span className="sortie-chip">Cursed</span>}
                <p className="small">{x.text}</p>
              </div>
            </li>
          ))}
        </ul>

        <h3>The lord</h3>
        <ul>
          <li>
            <div>
              <b>{b.lord.name}</b>
              <p className="small">Signature: <b>{b.lord.sig}</b>. {b.lord.text}</p>
              <p className="small muted">Omens read {b.lord.omens.length}/{b.lord.need}{b.lord.weaker ? `: the signature is ${b.lord.weaker}% weaker` : ''}.</p>
              {b.lord.omens.map((o, i) => <p key={i} className="small sortie-scene">{o}</p>)}
            </div>
          </li>
        </ul>
      </div>
      <button className="primary" onClick={onClose}>Back</button>
    </div>
  );
}
