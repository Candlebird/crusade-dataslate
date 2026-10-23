import { useState } from 'react';
import type { Force } from '../model/types';
import { FEATS, rewardText, type Feat } from '../rules/feats';

/** A force's feats for one minigame: what each asks and pays, and which it has earned. */
export function FeatList({ force, where }: { force: Force; where: Feat['where'] }) {
  const [open, setOpen] = useState(false);
  const feats = FEATS.filter((f) => f.where === where);
  const earned = feats.filter((f) => force.feats?.[f.id]).length;
  return (
    <div className="sortie-choice">
      <button className="ghost small sortie-recap-row" onClick={() => setOpen(!open)}>
        <b>Feats</b> <span className="muted">· {earned}/{feats.length} earned · real rewards, once each {open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <ul className="feat-list small">
          {feats.map((f) => {
            const on = force.feats?.[f.id];
            return (
              <li key={f.id} className={on ? 'feat-done' : ''}>
                <span>{on ? '✔' : '○'}</span>
                <span className="grow"><b>{f.name}</b> <span className="muted">· {f.text}</span></span>
                <span className="feat-reward">{on ? `earned ${on}` : rewardText(f.reward)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
