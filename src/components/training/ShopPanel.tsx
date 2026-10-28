import { TRAINING } from '../../rules/downtimeData';
import { buyLuck, buyMend, luckCap, luckCost, luckProblem, mendCost, mendProblem, type TrainingRun } from '../../rules/training';
import { Icon } from '../Icon';
import { act } from './act';

export interface ShopPanelProps {
  run: TrainingRun;
  onChange: () => void;
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

/** Spending credits between waves: luck and mending the base (a unit's levels and a defence's upgrade are on its card). */
export function ShopPanel({ run, onChange }: ShopPanelProps) {
  const luck = luckCost(run);
  const nextOdds = TRAINING.shards.odds[run.luck + 1];
  const mend = mendCost(run);
  const build = run.phase === 'build';
  return (
    <div className="training-shop small">
      <div className="training-panel-title">
        <b>Spend</b> <span className="muted">· {Math.floor(run.credits)} credits{build ? '' : ' · between waves'}</span>
      </div>
      <div className="training-shop-row">
        <Icon name="g:sparkles" />
        <span className="grow" data-tip={nextOdds ? `Next: ${oddsText(nextOdds)}` : undefined}>
          Luck {run.luck}/{luckCap(run)}
          {luckCap(run) < TRAINING.shards.luckCost.length && <span className="muted" data-tip="Drill Honours open more"> (of {TRAINING.shards.luckCost.length})</span>}
          <span className="muted"> · better Shard grades in each draft</span>
          <span className="training-shop-sub muted">Now: {oddsText(TRAINING.shards.odds[run.luck])}</span>
          {nextOdds && <span className="training-shop-sub muted">Next level: {oddsText(nextOdds)}</span>}
          <Why why={build ? luckProblem(run) : null} />
        </span>
        <BuyButton cost={luck} why={luckProblem(run)} label="Luck" onBuy={() => act(() => buyLuck(run), onChange)} />
      </div>
      <div className="training-shop-row">
        <Icon name="g:castle" />
        <span className="grow">
          Mend base <span className="muted">· +{TRAINING.mend.hp} HP ({run.baseHp}/{TRAINING.baseHp})</span>
          <Why why={build ? mendProblem(run) : null} />
        </span>
        <BuyButton cost={mend} why={mendProblem(run)} label="Mend" onBuy={() => act(() => buyMend(run), onChange)} />
      </div>
      <div className="muted">Level up a unit, or upgrade a built defence once, from its card: tap it on the map.</div>
    </div>
  );
}

/** Why a buy is off, shown under its row (a tooltip never shows on a phone). */
function Why({ why }: { why: string | null }) {
  return why ? <span className="training-shop-sub" style={{ color: 'var(--muted-2)' }}>{why}</span> : null;
}

/** A buy button with its cost, disabled with the reason as its tooltip. `cost` null: nothing more to buy. */
function BuyButton({ cost, why, label, onBuy }: { cost: number | null; why: string | null; label: string; onBuy: () => void }) {
  if (cost === null) return <span className="muted">max</span>;
  return (
    <button disabled={!!why} data-tip={why ?? undefined} onClick={onBuy}>
      {label} · <Icon name="g:two-coins" /> {cost}
    </button>
  );
}

/** A luck level's grade odds, e.g. "70% Cracked, 30% Chipped". */
function oddsText(odds: number[]): string {
  return odds.map((p, i) => (p > 0 ? `${pct(p)} ${TRAINING.shards.grades[i]}` : '')).filter(Boolean).join(', ');
}
