import { TRAINING } from '../../rules/downtimeData';
import {
  buyLevel, defaultUpgradeCost, defaultUpgradeProblem, hasMoved, levelCost, levelProblem, upgradeDefault,
  type DefaultTower, type TrainingRun, type UnitTower,
} from '../../rules/training';
import { Icon } from '../Icon';
import { act } from './act';

/** A Scout move (to an open spot) or an Ambush swap (with another piece), picked on the map. */
export type MoveRule = 'scout' | 'ambush';

export interface PieceActionsProps {
  run: TrainingRun;
  piece: UnitTower | DefaultTower;
  onChange: () => void;
  /** Start a Scout move or Ambush swap: the shell then waits for a tap on the map. */
  onMove?: (rule: MoveRule) => void;
}

const L = TRAINING.levels;
const U = TRAINING.defaults.upgrade;
export const LEVEL_TEXT = `Each level: +1 Tough (longer holds), +${L.dmg} damage a hit (+${L.meleeDmg} in melee), ${Math.round(L.rate * 100)}% faster, +${L.range} cell of range.`;
const UPGRADE_FX = `+${Math.round(U.dmg * 100)}% damage and +${U.reach} cell of reach`;
const UPGRADE_TEXT = `Once, between waves: ${UPGRADE_FX}.`;

/** The buttons on a piece's card: a unit's level up and its Scout / Ambush move, or a defence's one upgrade. */
export function PieceActions({ run, piece, onChange, onMove }: PieceActionsProps) {
  if (run.phase === 'over') return null;
  if (piece.kind === 'default') {
    if (piece.upgraded) return <div className="training-info-actions muted"><Icon name="g:upgrade" /> Upgraded: {UPGRADE_FX}</div>;
    const why = defaultUpgradeProblem(run, piece.id);
    return (
      <div className="training-info-actions">
        <button disabled={!!why} data-tip={why ?? UPGRADE_TEXT} onClick={() => act(() => upgradeDefault(run, piece.id), onChange)}>
          <Icon name="g:upgrade" /> Upgrade · <Icon name="g:two-coins" /> {defaultUpgradeCost(piece)}
        </button>
        <span className="training-info-fx muted">{why ?? UPGRADE_TEXT}</span>
      </div>
    );
  }
  const capped = piece.up >= piece.cap;
  const why = levelProblem(run, piece.id);
  const moveWhy = run.phase !== 'build' ? 'Units move between waves.' : hasMoved(run, piece.id) ? `${piece.name} has already moved this build phase.` : null;
  const move = (rule: MoveRule, label: string, tip: string) => (
    <button disabled={!!moveWhy || !onMove} data-tip={moveWhy ?? tip} onClick={() => onMove?.(rule)}>{label}</button>
  );
  return (
    <div className="training-info-actions">
      {capped ? <span className="muted">Max level ({piece.cap})</span> : (
        <button className={why ? '' : 'primary'} disabled={!!why} data-tip={why ?? LEVEL_TEXT} onClick={() => act(() => buyLevel(run, piece.id), onChange)}>
          <Icon name="g:upgrade" /> Level up · <Icon name="g:two-coins" /> {levelCost(piece)}
        </button>
      )}
      {piece.scout && move('scout', 'Scout move', 'Scout: move it to any open spot, once a build phase. The route must stay open.')}
      {piece.ambush && move('ambush', 'Ambush swap', 'Ambush: swap places with another defence, Shard or rubble, once a build phase. The route must stay open.')}
      {!capped && <span className="training-info-fx muted">{why ?? LEVEL_TEXT}</span>}
    </div>
  );
}
