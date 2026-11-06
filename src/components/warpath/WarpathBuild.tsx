import { buildOf, type WarpathRun } from '../../rules/warpath';
import { Icon } from '../Icon';
import { RoleBadge } from './RoleBadge';

// The run's build, open from the pause menu, the level-up cards or the B key: pairs first, then doctrines, units and
// the tree's big rules. The run stands still while it is up.

const STATUS = { active: 'Active', ready: 'Ready: watch the cards', building: 'Building' } as const;

export function WarpathBuild({ run, onClose }: { run: WarpathRun; onClose: () => void }) {
  const b = buildOf(run);
  const taken = b.pairs.filter((p) => p.status === 'active').length;
  return (
    <div className="warpath-build" role="dialog" aria-label="Your build">
      <div className="warpath-build-pane">
        <h2>Your build</h2>
        <p className="muted small">{b.doctrines.length}/{b.slots} doctrines · {taken} {taken === 1 ? 'stratagem' : 'stratagems'}</p>
        <section>
          <h3>Synergies</h3>
          {b.pairs.length === 0 && <p className="muted small">Take a doctrine to start a pair. Two paired doctrines at level {b.pairLevel} open a stratagem.</p>}
          <ul>
            {b.pairs.map((p) => (
              <li key={p.name} className={`warpath-build-pair ${p.status}`}>
                <Icon name={p.icon} />
                <div>
                  <b>{p.name}</b> <span className="warpath-build-tag">{STATUS[p.status]}</span>
                  <p>{p.text}</p>
                  {p.status !== 'active' && <p className="small muted">{p.needs.map((n) => `${n.name} ${n.level}/${b.pairLevel}`).join(' + ')}</p>}
                </div>
              </li>
            ))}
          </ul>
        </section>
        {b.doctrines.length > 0 && (
          <section>
            <h3>Doctrines</h3>
            <ul>
              {b.doctrines.map((d) => (
                <li key={d.name}>
                  <Icon name={d.icon} />
                  <div><b>{d.name}</b> <span className="warpath-build-tag">Level {d.level}/{b.maxLevel}</span><p>{d.text}</p></div>
                </li>
              ))}
            </ul>
            <p className="small muted">Numbers are per level unless the text says otherwise.</p>
          </section>
        )}
        <section>
          <h3>Force</h3>
          <ul>
            {b.units.map((u) => (
              <li key={u.id} className="warpath-build-unit">
                <RoleBadge role={u.role} bare />
                <div><b>{u.name}</b> <span className="warpath-build-tag">Level {u.level}/{u.max}</span></div>
              </li>
            ))}
          </ul>
        </section>
        {b.tree.length > 0 && (
          <section>
            <h3>From your tree</h3>
            <ul>
              {b.tree.map((t) => (
                <li key={t.name}><Icon name={t.icon} /><div><b>{t.name}</b><p>{t.text}</p></div></li>
              ))}
            </ul>
          </section>
        )}
      </div>
      <button className="primary" onClick={onClose}><Icon name="l:arrow-left" /> Back</button>
    </div>
  );
}
