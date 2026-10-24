import type { EmblemLayer } from '../../model/types';
import { TRAINING } from '../../rules/downtimeData';
import {
  buyLevel, buyLuck, buyMend, levelCost, levelProblem, luckCost, luckProblem, mendCost, mendProblem, unitTowers,
  type TrainingRun, type UnitTower,
} from '../../rules/training';
import { EmblemBadge } from '../Emblem';
import { Icon } from '../Icon';
import { act } from './act';

export interface ShopPanelProps {
  run: TrainingRun;
  portraits?: Record<string, EmblemLayer[]>;
  /** The unit piece selected on the map (its row is lit), and picking one here. */
  sel?: number | null;
  onSelect?: (id: number) => void;
  onChange: () => void;
}

const L = TRAINING.levels;
const LEVEL_TEXT = `Each level: +1 Tough (longer holds), +${L.dmg} damage a hit (+${L.meleeDmg} in melee), ${Math.round(L.rate * 100)}% faster, +${L.range} cell of range.`;
const pct = (n: number) => `${Math.round(n * 100)}%`;

/** Spending credits between waves: crafted units' levels (up to each one's cap), luck, and mending the base. */
export function ShopPanel({ run, portraits, sel, onSelect, onChange }: ShopPanelProps) {
  const units = unitTowers(run);
  const luck = luckCost(run);
  const nextOdds = TRAINING.shards.odds[run.luck + 1];
  const mend = mendCost(run);
  const build = run.phase === 'build';
  return (
    <div className="training-shop small">
      <div className="training-panel-title">
        <b>Spend</b> <span className="muted">· {Math.floor(run.credits)} credits{build ? '' : ' · between waves'}</span>
      </div>
      {!units.length && <div className="muted">Craft a unit to level it up.</div>}
      {units.map((t) => (
        <LevelRow key={t.id} run={run} t={t} portrait={portraits?.[t.unitId]} lit={sel === t.id} onSelect={onSelect} onChange={onChange} />
      ))}
      {units.length > 0 && <div className="muted">{LEVEL_TEXT}</div>}
      <div className="training-shop-row">
        <Icon name="g:sparkles" />
        <span className="grow" title={nextOdds ? `Next: ${oddsText(nextOdds)}` : undefined}>
          Luck {run.luck}/{TRAINING.shards.luckCost.length}
          <span className="muted"> · {oddsText(TRAINING.shards.odds[run.luck])}</span>
        </span>
        <BuyButton cost={luck} why={luckProblem(run)} label="Luck" onBuy={() => act(() => buyLuck(run), onChange)} />
      </div>
      <div className="training-shop-row">
        <Icon name="g:castle" />
        <span className="grow">Mend base <span className="muted">· +{TRAINING.mend.hp} HP ({run.baseHp}/{TRAINING.baseHp})</span></span>
        <BuyButton cost={mend} why={mendProblem(run)} label="Mend" onBuy={() => act(() => buyMend(run), onChange)} />
      </div>
    </div>
  );
}

function LevelRow({ run, t, portrait, lit, onSelect, onChange }: {
  run: TrainingRun;
  t: UnitTower;
  portrait?: EmblemLayer[];
  lit: boolean;
  onSelect?: (id: number) => void;
  onChange: () => void;
}) {
  const capped = t.up >= t.cap;
  return (
    <div className={`training-shop-row${lit ? ' lit' : ''}`}>
      <button className="training-shop-unit" onClick={() => onSelect?.(t.id)} title="Show it on the map">
        {portrait ? <EmblemBadge emblem={portrait} size={20} /> : null}
        <span className="grow">{t.name}</span>
      </button>
      <span className="muted" title={`Levels this run, of its cap ${t.cap} (by its points)`}>Lv {t.up}/{t.cap}</span>
      <BuyButton cost={capped ? null : levelCost(t)} why={levelProblem(run, t.id)} label="Level" onBuy={() => act(() => buyLevel(run, t.id), onChange)} />
    </div>
  );
}

/** A buy button with its cost, disabled with the reason as its tooltip. `cost` null: nothing more to buy. */
function BuyButton({ cost, why, label, onBuy }: { cost: number | null; why: string | null; label: string; onBuy: () => void }) {
  if (cost === null) return <span className="muted">max</span>;
  return (
    <button disabled={!!why} title={why ?? undefined} onClick={onBuy}>
      {label} · <Icon name="g:two-coins" /> {cost}
    </button>
  );
}

/** A luck level's grade odds, e.g. "70% Cracked, 30% Chipped". */
function oddsText(odds: number[]): string {
  return odds.map((p, i) => (p > 0 ? `${pct(p)} ${TRAINING.shards.grades[i]}` : '')).filter(Boolean).join(', ');
}
