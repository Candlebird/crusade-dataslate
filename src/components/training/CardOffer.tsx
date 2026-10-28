import type { EmblemLayer } from '../../model/types';
import {
  autoCardIndex, cardText, cardTower, rerollProblem, rerollsLeft, rerollsOf, type CardDraw, type TrainingRun,
} from '../../rules/training';
import { TRAINING } from '../../rules/downtimeData';
import { EmblemBadge } from '../Emblem';

export const TIER_TAG: Record<CardDraw['rarity'], string> = { Common: '', Rare: 'red', Legendary: 'gold' };

/** A card's tag colour, by rarity. */
export const cardTag = (d: CardDraw) => TIER_TAG[d.rarity];

export interface CardOfferProps {
  run: TrainingRun;
  offer: CardDraw[];
  portraits?: Record<string, EmblemLayer[]>;
  /** Auto play: the card it will take is lit and the buttons are off. */
  auto?: boolean;
  /** The card Auto takes (default autoCardIndex: the rarest). */
  autoPick?: number;
  onPick: (i: number) => void;
  /** Hide the offer for a look at the field. */
  onPeek: () => void;
  /** Re-draw the boss cards (the Drill Honours reroll perk); shown only when the run has re-draws. */
  onReroll?: () => void;
}

/** The three cards on offer after a boss falls: they rise up one after another, and glow by rarity. A card names the
 *  tower it goes to (a unit with its emblem, or an emplacement). */
export function CardOffer({ run, offer, portraits, auto, autoPick, onPick, onPeek, onReroll }: CardOfferProps) {
  const best = autoPick ?? autoCardIndex(run);
  const top = offer.some((d) => d.rarity === 'Legendary') ? 'legendary' : offer.some((d) => d.rarity === 'Rare') ? 'rare' : 'common';
  return (
    <div className={`training-cards ${top}`} role="dialog" aria-label="Choose a card">
      <div className="training-cards-title">
        <div className="training-cards-kicker">{run.nemesis?.slain && run.wave === TRAINING.shared.nemesis.wave ? run.nemesis.name : 'The Echo Lord'} falls · wave {run.wave}</div>
        <h2>Choose a boon</h2>
        <div className="training-cards-sub">Take one: it lasts the rest of this run.</div>
      </div>
      <div className="training-cards-row">
        {offer.map((d, i) => {
          const c = cardText(run, d);
          const to = cardTower(run, d);
          const face = to?.kind === 'unit' ? portraits?.[to.unitId] : undefined;
          return (
            <button
              key={`${run.rerolls ?? 0}:${i}`}
              className={`training-card ${d.rarity.toLowerCase()}${auto && i === best ? ' chosen' : ''}`}
              style={{ animationDelay: `${0.15 + i * 0.18}s` }}
              disabled={auto}
              onClick={() => onPick(i)}
            >
              <span className="training-card-shine" aria-hidden />
              <span className={`tag ${cardTag(d)}`}>{d.rarity}</span>
              <span className="training-card-name">{c.name}</span>
              {to && <span className="training-card-unit">{face ? <EmblemBadge emblem={face} size={18} /> : null} {to.name}</span>}
              <span className="training-card-text">{c.text}</span>
            </button>
          );
        })}
      </div>
      {auto ? <div className="muted small">Auto takes the lit card…</div> : (
        <div className="row" style={{ gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="small" onClick={onPeek}>Look at the field first</button>
          {onReroll && rerollsOf(run) > 0 && (
            <button className="small" disabled={!!rerollProblem(run)} data-tip={rerollProblem(run) ?? undefined} onClick={onReroll}>
              Re-draw ({rerollsLeft(run)} left)
            </button>
          )}
        </div>
      )}
    </div>
  );
}
