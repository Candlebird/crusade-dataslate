import { Fragment, useState } from 'react';
import type { Force } from '../model/types';
import { FEATS, rewardText, type Feat } from '../rules/feats';
import { Icon } from './Icon';

/** A force's feats for one minigame: what each asks and pays, and which it has earned. */
export function FeatList({ force, where }: { force: Force; where: Feat['where'] }) {
  const [open, setOpen] = useState(false);
  const feats = FEATS.filter((f) => f.where === where);
  const earned = feats.filter((f) => force.feats?.[f.id]).length;
  return (
    <div className="sortie-choice">
      <button className="ghost small sortie-recap-row" onClick={() => setOpen(!open)}>
        <b>Feats</b> <span className="muted">· {earned}/{feats.length} earned · real rewards, once each <Icon name={open ? 'l:chevron-up' : 'l:chevron-down'} /></span>
      </button>
      {open && (
        <ul className="feat-list small">
          {feats.map((f, i) => {
            const on = force.feats?.[f.id];
            // The hard feats come last, under their own heading.
            const head = f.hard && !feats[i - 1]?.hard;
            return (
              <Fragment key={f.id}>
                {head && <li className="muted" style={{ marginTop: '0.5rem' }}><b>Hard feats</b></li>}
                <li className={on ? 'feat-done' : ''}>
                <span><Icon name={on ? 'l:circle-check' : 'l:circle'} /></span>
                <span className="grow"><b>{f.name}</b> <span className="muted">· {f.text}</span></span>
                <span className="feat-reward">{on ? `earned ${on}` : rewardText(f.reward)}</span>
                </li>
              </Fragment>
            );
          })}
        </ul>
      )}
    </div>
  );
}
