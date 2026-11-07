import { buildOf, clock, type WarpathRun } from '../../rules/warpath';
import { Icon } from '../Icon';
import { RoleBadge } from './RoleBadge';

// The run's build, open from the pause menu, the level-up cards or the B key: pairs first, then doctrines, units and
// the tree's big rules. The run stands still while it is up.

const STATUS = { active: 'Active', ready: 'Ready: watch the cards', building: 'Building' } as const;

/** The run's doctrine slots, filled and empty, shown above the level-up cards. */
export function DoctrineSlots({ run }: { run: WarpathRun }) {
  const b = buildOf(run);
  const empty = Math.max(0, b.slots - b.doctrines.length);
  return (
    <ul className="warpath-slots" aria-label={`${b.doctrines.length} of ${b.slots} doctrine slots filled`}>
      {b.doctrines.map((d) => (
        <li key={d.name} title={`${d.name}: level ${d.level}/${b.maxLevel}`}>
          <Icon name={d.icon} />
          <span className="warpath-slot-name">{d.name}</span>
          <span className="warpath-slot-pips" role="img" aria-label={`Level ${d.level} of ${b.maxLevel}`}>
            {Array.from({ length: b.maxLevel }, (_, i) => <i key={i} className={i < d.level ? 'on' : ''} />)}
          </span>
        </li>
      ))}
      {Array.from({ length: empty }, (_, i) => <li key={i} className="empty" title="Empty doctrine slot" />)}
    </ul>
  );
}

export function WarpathBuild({ run, onClose }: { run: WarpathRun; onClose: () => void }) {
  const b = buildOf(run);
  const taken = b.pairs.filter((p) => p.status === 'active').length;
  return (
    <div className="warpath-build" role="dialog" aria-label="Your build">
      <div className="warpath-build-pane">
        <h2>Your build</h2>
        <p className="muted small">{b.doctrines.length}/{b.slots} doctrines · {taken} {taken === 1 ? 'stratagem' : 'stratagems'}</p>
        {b.next && (
          <section>
            <h3>Next boss</h3>
            <p><b>{b.next.lord ? 'Echo Lord' : 'Captain'} {b.next.name}</b> <span className="warpath-build-tag">{clock(b.next.at)}</span></p>
            <p className="small muted">{b.next.text} {b.next.held ? `You hold its trophy, ${b.next.trophy}.` : `Fell it to win ${b.next.trophy}.`}</p>
          </section>
        )}
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
        {b.trophies.length > 0 && (
          <section>
            <h3>Trophies</h3>
            <ul>
              {b.trophies.map((t) => (
                <li key={t.name}><Icon name={t.icon} /><div><b>{t.name}</b><p>{t.text}</p></div></li>
              ))}
            </ul>
          </section>
        )}
        <section>
          <h3>Force</h3>
          <ul>
            {b.units.map((u) => (
              <li key={u.id} className="warpath-build-unit">
                <RoleBadge role={u.role} bare />
                <div>
                  <b>{u.name}</b> <span className="warpath-build-tag">Level {u.level}/{u.max}</span>
                  {u.spec && <p><b>{u.spec.name}:</b> {u.spec.text}</p>}
                </div>
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
