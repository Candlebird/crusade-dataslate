import { useState } from 'react';
import type { Force } from '../../model/types';
import { TRAINING, type DrillPerk } from '../../rules/downtimeData';
import { DRILL_GOALS, drillGoalText, drillOf, drillProgress, unlockText } from '../../rules/training';
import { Icon } from '../Icon';

/** The force's Drill Honours, like the Sortie boon track: what is open now, and each goal with how far along it is. */
export function DrillTrack({ force }: { force: Force }) {
  const [open, setOpen] = useState(false);
  const d = drillOf(force);
  const rows = DRILL_GOALS.map((g, i) => {
    const have = drillProgress(force, g.goal);
    return { i, g, have, done: have >= g.n, u: unlockText(g.unlock) };
  });
  const done = rows.filter((r) => r.done).length;
  const perks = Object.entries(d.perks).map(([p, n]) => `${unlockText({ perk: p as DrillPerk }).name}${n! > 1 ? ` ×${n}` : ''}`);
  return (
    <div className="sortie-choice small">
      <button className="ghost small sortie-recap-row" onClick={() => setOpen(!open)}>
        <b>Drill Honours</b>{' '}
        <span className="muted">· {done} of {rows.length} earned · luck up to {d.luck}, {d.cards.length} boss cards <Icon name={open ? 'l:chevron-up' : 'l:chevron-down'} /></span>
      </button>
      {open && (
        <div className="sortie-bestiary">
          <p className="muted small" style={{ margin: 0 }}>
            A new force buys luck only up to {TRAINING.drill.luckAtStart} and draws from {TRAINING.drill.cardsAtStart.length} boss cards.
            Each goal reached opens more for every run after. The Weekly Siege opens everything, without perks.
            {perks.length ? ` Perks now: ${perks.join(', ')}.` : ''}
          </p>
          {rows.map(({ i, g, have, done: got, u }) => (
            <div key={i} className={`sortie-beast${got ? ' lord' : ''}`}>
              <div>
                <b>{u.name}</b>
                <span className="muted small"> · {got ? 'earned' : `${drillGoalText(g.goal, g.n)} (${Math.min(have, g.n)}/${g.n})`}</span>
              </div>
              <div className="small">{got ? u.text : <span className="muted">{u.text}</span>}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
