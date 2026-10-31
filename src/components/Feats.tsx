import { Fragment, useState } from 'react';
import { localDate } from '../model/date';
import { useStore } from '../model/store';
import type { Campaign, Force } from '../model/types';
import { offTableKey } from '../rules/downtime';
import { FEATS, featFaction, featHolder, repeatHolder, rewardText, type Feat } from '../rules/feats';
import { Icon } from './Icon';

/**
 * A force's feats for one minigame: what each asks and pays, and which it has earned. In a campaign (`c`) a unique
 * feat counts for the whole faction, and a repeatable one once a round for it.
 */
export function FeatList({ force, where, c }: { force: Force; where: Feat['where']; c?: Campaign }) {
  const { state } = useStore();
  const [open, setOpen] = useState(false);
  const faction = featFaction(force, state.forces, !!c);
  const key = offTableKey(c, localDate());
  const feats = FEATS.filter((f) => f.where === where && !f.repeat);
  const repeats = FEATS.filter((f) => f.where === where && f.repeat);
  const earned = feats.filter((f) => featHolder(faction, f.id)).length;
  const span = c ? 'round' : 'week';
  const who = (f: Force) => (f.id === force.id ? '' : ` by ${f.name}`);
  return (
    <div className="sortie-choice">
      <button className="ghost small sortie-recap-row" onClick={() => setOpen(!open)}>
        <b>Feats</b> <span className="muted">· {earned}/{feats.length} earned · real rewards, once {c ? 'for your faction' : 'each'} <Icon name={open ? 'l:chevron-up' : 'l:chevron-down'} /></span>
      </button>
      {open && (
        <ul className="feat-list small">
          {feats.map((f, i) => {
            const by = featHolder(faction, f.id);
            const on = by?.feats?.[f.id];
            // The hard feats come last, under their own heading.
            const head = f.hard && !feats[i - 1]?.hard;
            return (
              <Fragment key={f.id}>
                {head && <li className="muted" style={{ marginTop: '0.5rem' }}><b>Hard feats</b></li>}
                <li className={on ? 'feat-done' : ''}>
                <span><Icon name={on ? 'l:circle-check' : 'l:circle'} /></span>
                <span className="grow"><b>{f.name}</b> <span className="muted">· {f.text}</span></span>
                <span className="feat-reward">{on ? `earned ${on}${who(by!)}` : rewardText(f.reward)}</span>
                </li>
              </Fragment>
            );
          })}
          {repeats.length > 0 && <li className="muted" style={{ marginTop: '0.5rem' }}><b>Repeatable feats</b> · once a {span}{c ? ' for your faction' : ''}</li>}
          {repeats.map((f) => {
            const by = repeatHolder(faction, f.id, key);
            const times = force.featRepeats?.[f.id]?.n ?? 0;
            return (
              <li key={f.id} className={by ? 'feat-done' : ''}>
                <span><Icon name={by ? 'l:circle-check' : 'l:rotate-ccw'} /></span>
                <span className="grow"><b>{f.name}</b> <span className="muted">· {f.text}{times ? ` · done ${times}×` : ''}</span></span>
                <span className="feat-reward">{by ? `done this ${span}${who(by)}` : rewardText(f.reward)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
