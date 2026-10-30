import { useState } from 'react';
import type { Campaign, Force } from '../../model/types';
import { TRAINING } from '../../rules/downtimeData';
import { finalBoss, finaleTrack, newFinale, nexusOf, pickNemesis } from '../../rules/training';
import { xpShown } from '../../rules/engine';
import { Icon } from '../Icon';

/** The force's Final-wave ladder, like the Drill Honours track: the Final its runs meet now and its boss, and each step
 *  with its Victory and the veterancy it asks. */
export function FinaleTrack({ force, c }: { force: Force; c?: Campaign }) {
  const [open, setOpen] = useState(false);
  const t = finaleTrack(force);
  const boss = finalBoss({ nemesis: pickNemesis(force.sortie), nexus: nexusOf(c), finale: newFinale(t.open) });
  const deep = force.finale?.endless ?? 0;
  return (
    <div className="sortie-choice small">
      <button className="ghost small sortie-recap-row" onClick={() => setOpen(!open)}>
        <b>Final wave {t.open}</b>{' '}
        <span className="muted">· led by {boss} · veterancy {xpShown(t.vet)} XP{deep ? ` · Endless best +${deep}` : ''} <Icon name={open ? 'l:chevron-up' : 'l:chevron-down'} /></span>
      </button>
      {open && (
        <div className="sortie-bestiary">
          <p className="muted small" style={{ margin: 0 }}>
            Slay the Final wave's boss with the base standing for a Victory, then bank it or go on into Endless. A Victory
            and the next step's veterancy (every XP the force's units have earned) open the next Final, {TRAINING.finale.step} waves
            on, up to {TRAINING.finale.to}.
          </p>
          {t.steps.map((s) => (
            <div key={s.n} className={`sortie-beast${s.won ? ' lord' : ''}`}>
              <div>
                <b>Win at {s.n}</b> <span aria-label={s.won ? 'won' : 'not won'}>{s.won ? '✓' : '✗'}</span>
                <span className="muted small"> · {s.won ? `won ${force.finale?.wins[String(s.n)] ?? ''}`.trim() : s.open ? 'open' : 'locked'}</span>
              </div>
              <div className="small muted">{s.bar ? `Veterancy ${xpShown(Math.min(t.vet, s.bar))}/${s.bar} XP` : 'Open from the start'}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
