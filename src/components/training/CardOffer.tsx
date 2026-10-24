import type { EmblemLayer } from '../../model/types';
import { autoCardIndex, cardText, unitTowers, type CardDraw, type TrainingRun } from '../../rules/training';
import { EmblemBadge } from '../Emblem';

export const TIER_TAG: Record<CardDraw['rarity'], string> = { Common: '', Rare: 'red', Legendary: 'gold' };

export interface CardOfferProps {
  run: TrainingRun;
  offer: CardDraw[];
  portraits?: Record<string, EmblemLayer[]>;
  /** Auto play: the card it will take is lit and the buttons are off. */
  auto?: boolean;
  onPick: (i: number) => void;
  /** Hide the offer for a look at the field. */
  onPeek: () => void;
}

/** The cards on offer after a boss falls: they rise up one after another, and glow by rarity. */
export function CardOffer({ run, offer, portraits, auto, onPick, onPeek }: CardOfferProps) {
  const best = autoCardIndex(run);
  const top = offer.some((d) => d.rarity === 'Legendary') ? 'legendary' : offer.some((d) => d.rarity === 'Rare') ? 'rare' : 'common';
  const units = unitTowers(run);
  return (
    <div className={`training-cards ${top}`} role="dialog" aria-label="Choose a card">
      <div className="training-cards-title">
        <div className="training-cards-kicker">The Echo Lord falls · wave {run.wave}</div>
        <h2>Choose a boon</h2>
      </div>
      <div className="training-cards-row">
        {offer.map((d, i) => {
          const c = cardText(run, d);
          const unit = units.find((t) => t.unitId === d.unitId);
          const face = unit && portraits?.[unit.unitId];
          return (
            <button
              key={i}
              className={`training-card ${d.rarity.toLowerCase()}${auto && i === best ? ' chosen' : ''}`}
              style={{ animationDelay: `${0.15 + i * 0.18}s` }}
              disabled={auto}
              onClick={() => onPick(i)}
            >
              <span className="training-card-shine" aria-hidden />
              <span className={`tag ${TIER_TAG[d.rarity]}`}>{d.rarity}</span>
              <span className="training-card-name">{c.name}</span>
              {unit && <span className="training-card-unit">{face ? <EmblemBadge emblem={face} size={18} /> : null} {unit.name}</span>}
              <span className="training-card-text">{c.text}</span>
            </button>
          );
        })}
      </div>
      {auto ? <div className="muted small">Auto takes the rarest card…</div> : <button className="small" onClick={onPeek}>Look at the field first</button>}
    </div>
  );
}
