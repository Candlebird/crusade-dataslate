import { useEffect } from 'react';
import type { EmblemLayer } from '../../model/types';
import { buildOf, type BuildTower, type HeldCard } from '../../rules/training/buildView';
import { nextBoss, type NextBoss } from '../../rules/training/nextRound';
import { pickSpec, specProblem } from '../../rules/training/specs';
import type { TrainingRun } from '../../rules/training/types';
import { EmblemBadge } from '../Emblem';
import { RoleBadge } from '../warpath/RoleBadge';
import { act } from './act';

// The build panel (B): every crafted unit and emplacement with the cards it holds and their live numbers, its
// specialisation, relics and auras; stratagems by status; trophies and whole-run cards; card groups Drill still locks;
// and the next boss. Everything is written out (no hover-only text), so it reads the same on a phone.

const RARITY_TAG: Record<string, string> = { Common: '', Rare: 'red', Legendary: 'gold', Trophy: 'gold' };

function CardLine({ c }: { c: HeldCard }) {
  return (
    <div className="training-build-card">
      <span className={`tag ${RARITY_TAG[c.rarity] ?? ''}`}>{c.name}</span> <span className="muted">{c.text}</span>
    </div>
  );
}

/** One tower's build: role and spec (with the pick when it is due), held cards, live numbers, relics and auras. */
export function TowerBuild({ run, t, onChange, compact }: { run: TrainingRun; t: BuildTower; onChange: () => void; compact?: boolean }) {
  return (
    <>
      {(t.role || t.spec || t.specLine) && (
        <div className="row training-build-spec" style={{ gap: 6, flexWrap: 'wrap' }}>
          {t.role && <RoleBadge role={t.role} />}
          {t.spec ? <span><b>{t.spec.name}</b> <span className="muted">· {t.spec.text}</span></span> : <span className="muted">{t.specLine}</span>}
        </div>
      )}
      {t.specChoice && (
        <div className="training-build-choice">
          <span className="small">Specialise (free, for good):</span>
          {t.specChoice.map((s) => (
            <button key={s.id} className="small" disabled={!!specProblem(run, t.id, s.id)} onClick={() => act(() => pickSpec(run, t.id, s.id), onChange)}>
              <b>{s.name}</b> <span className="muted">· {s.text}</span>
            </button>
          ))}
        </div>
      )}
      {t.cards.map((c, i) => <CardLine key={i} c={c} />)}
      {t.live.length > 0 && <div className="training-build-live">{t.live.join(' · ')}</div>}
      {!compact && t.relics.length > 0 && <div className="muted">Relics: {t.relics.join(', ')}</div>}
      {!compact && t.auras.length > 0 && <div className="muted">Auras: {t.auras.join('; ')}</div>}
    </>
  );
}

/** The next boss in one block: wave, name, trick and trophy. */
export function NextBossLine({ b }: { b: NextBoss }) {
  return (
    <div className="training-build-boss">
      <b>Next boss: wave {b.wave}, {b.name}</b>
      {b.trick && <div className="muted">{b.trick}</div>}
      {b.trophy ? <div>Trophy if slain: <span className="tag gold">{b.trophy.name}</span> <span className="muted">{b.trophy.text.replace('{unit}', 'The tower that slays it')}</span></div>
        : <div className="muted">Leaves no trophy.</div>}
    </div>
  );
}

export interface TrainingBuildProps {
  run: TrainingRun;
  portraits?: Record<string, EmblemLayer[]>;
  onClose: () => void;
  onChange: () => void;
}

export function TrainingBuild({ run, portraits, onClose, onChange }: TrainingBuildProps) {
  useEffect(() => {
    // Capture, and stop it there: Escape shuts the panel, not the whole sim behind it.
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); onClose(); } };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, [onClose]);
  const v = buildOf(run);
  const boss = nextBoss(run);
  const order = { active: 0, ready: 1, building: 2 } as const;
  const strats = [...v.strats].sort((a, b) => order[a.status] - order[b.status]);
  return (
    <div className="training-build" role="dialog" aria-label="Build">
      <div className="training-build-panel small">
        <div className="row">
          <b className="grow training-build-title">Build{run.phase === 'wave' ? ' · paused' : ''}</b>
          <button className="small" onClick={onClose}>Close (B)</button>
        </div>
        {boss && <NextBossLine b={boss} />}

        <h4>Defences</h4>
        {v.towers.length === 0 && <div className="muted">Nothing crafted yet.</div>}
        <div className="training-build-towers">
          {v.towers.map((t) => {
            const p = run.pieces.find((x) => x.id === t.id);
            const face = p?.kind === 'unit' ? portraits?.[p.unitId] : undefined;
            return (
              <div key={t.id} className="training-build-tower">
                <div className="row" style={{ gap: 6 }}>
                  {face && <EmblemBadge emblem={face} size={18} />}
                  <b className="grow">{t.name}</b>
                  <span className="muted">{t.kills} kills · {Math.round(t.dealt)} dmg</span>
                </div>
                <TowerBuild run={run} t={t} onChange={onChange} />
              </div>
            );
          })}
        </div>

        <h4>Stratagems</h4>
        <div className="muted">Hold both cards of a pair (on any defences) and the next boss offers its stratagem in place of a card. Once a run each.</div>
        {strats.map(({ strat, status, needs }) => (
          <div key={strat.id} className={`training-build-strat ${status}`}>
            <span className={`tag ${status === 'active' ? 'gold' : status === 'ready' ? 'red' : ''}`}>{status === 'active' ? 'Active' : status === 'ready' ? 'Next boss' : 'Building'}</span>{' '}
            <b>{strat.name}</b>{' '}
            <span className="muted">({needs.map((n) => `${n.name} ${n.held ? `held ${n.held}` : n.locked ? 'locked by Drill' : 'not held'}`).join(' + ')})</span>
            <div className="muted">{strat.text}</div>
          </div>
        ))}

        {v.trophies.length > 0 && <><h4>Trophies</h4>{v.trophies.map((c, i) => <CardLine key={i} c={c} />)}</>}
        {v.runCards.length > 0 && <><h4>Whole-run cards</h4>{v.runCards.map((c, i) => <CardLine key={i} c={c} />)}</>}
        {v.locked.length > 0 && (
          <>
            <h4>Locked by Drill Honours</h4>
            {v.locked.map((g) => <div key={g.name}><b>{g.name}:</b> <span className="muted">{g.cards.join(', ')}</span></div>)}
          </>
        )}
      </div>
    </div>
  );
}
