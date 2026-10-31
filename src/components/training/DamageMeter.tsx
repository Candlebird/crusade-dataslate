import { useEffect, useRef, useState } from 'react';
import { checkWaves, hasChecks, isColossusWave, type TrainingRun } from '../../rules/training';

/** The Weekly Siege's damage meter, top right of the board while a damage check's colossus is on the field: the damage
 *  dealt to it this check, a pulse at every 1,000 and a burst at every 10,000. */
export function DamageMeter({ run }: { run: TrainingRun }) {
  const live = !!run.siege && hasChecks(run.siege) && run.phase === 'wave' && isColossusWave(run, run.wave) && !!run.checks?.length;
  const dmg = live ? Math.round(run.checks![run.checks!.length - 1]) : 0;
  const n = run.checks?.length ?? 0;
  const thousands = Math.floor(dmg / 1000);
  const tens = Math.floor(dmg / 10_000);
  // Each new 1,000 / 10,000 bumps a key, so its animation plays again from the start.
  const [pulse, setPulse] = useState(0);
  const [burst, setBurst] = useState(0);
  const seen = useRef({ n, thousands, tens });
  useEffect(() => {
    const s = seen.current;
    if (s.n !== n) { seen.current = { n, thousands, tens }; setBurst(0); setPulse(0); return; }
    if (tens > s.tens) setBurst((b) => b + 1);
    else if (thousands > s.thousands) setPulse((p) => p + 1);
    seen.current = { n, thousands, tens };
  }, [n, thousands, tens]);
  if (!live) return null;
  const waves = checkWaves(run.siege);
  return (
    <div key={`m${burst}`} className="training-damage" role="status" aria-live="off" data-tip={`Damage to the colossus at damage check ${n} of ${waves.length} (wave ${run.wave})`}>
      <div className="training-damage-label">Damage check {n}/{waves.length}</div>
      <div key={`p${pulse}`} className={`training-damage-value${pulse ? ' pulse' : ''}`}>{dmg.toLocaleString()}</div>
      {burst > 0 && (
        <div className="training-damage-burst" aria-hidden>
          <span className="ring" />
          <span className="ring two" />
          <span className="text">{(tens * 10_000).toLocaleString()}!</span>
        </div>
      )}
    </div>
  );
}
