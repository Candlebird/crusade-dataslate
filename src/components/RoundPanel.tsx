import { nowIso } from '../model/factory';
import { useStore } from '../model/store';
import type { Campaign } from '../model/types';
import { ECHOES, NEXUS_ROUNDS, currentRound, factionColor } from '../rules/nexus';
import { endRound, inGrace, leaders, nextThreat, roundEndText, sectorCounts, spreadsAt, threatOf, underdogBonus, type RoundEnd } from '../rules/rounds';
import { confirmAction, toast } from './ui';

/** End the current round on a copy of the campaign (the spread is random, so it's rolled once, here) and store the result. */
export function useEndRound() {
  const { update } = useStore();
  return (c: Campaign): RoundEnd => {
    const next = structuredClone(c);
    const r = endRound(next);
    next.updatedAt = nowIso();
    update((d) => void (d.campaign = next));
    toast(roundEndText(next, r));
    return r;
  };
}

/** The campaign round: the Void Echoes' threat, who's ahead, and the GM's End round button. */
export default function RoundPanel({ c }: { c: Campaign }) {
  const end = useEndRound();
  const round = currentRound(c);
  const threat = threatOf(c);
  const coming = nextThreat(c);
  const counts = sectorCounts(c);
  const ahead = new Set(leaders(c));
  const behind = underdogBonus(c);
  const grace = inGrace(c);

  const endNow = () => {
    const spreads = spreadsAt(coming);
    if (!confirmAction(`End round ${round}? Every faction's sector income for the round is fixed now (players claim it on their force page), `
      + `the ${ECHOES.name}' threat goes to ${coming} and they spread ${spreads} sector${spreads === 1 ? '' : 's'}${grace ? ' (into unclaimed space only)' : ''}.`)) return;
    end(c);
  };

  return (
    <div className="panel">
      <div className="panel-title">
        <h2>Round {round}</h2>
        <button className="primary" onClick={endNow} title="When everyone has played what they're going to play this round">End round…</button>
      </div>
      <div className="row small" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
        <span className="tag red" title={`Up ${NEXUS_ROUNDS.threatPerRound} each round, down ${NEXUS_ROUNDS.threatPerWin} per win against them (${NEXUS_ROUNDS.threatPerVoidspawnWin} at a Voidspawn)`}>
          ☣ {ECHOES.name} threat {threat}/{NEXUS_ROUNDS.threatMax}
        </span>
        <span className="muted">If the round ended now: threat {coming}, spreading {spreadsAt(coming)} sector{spreadsAt(coming) === 1 ? '' : 's'}{ahead.size ? ', most likely into the leader\'s space' : ''}.</span>
      </div>
      {grace && (
        <p className="small" style={{ margin: '0.5rem 0 0' }}>
          <span className="tag gold">Opening rounds</span> Until round {NEXUS_ROUNDS.graceRounds + 1}: no home-sector challenges, and the {ECHOES.name} only spread into unclaimed sectors.
        </p>
      )}
      {c.factions.length > 0 && (
        <div className="row small" style={{ flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
          <span className="muted">Sectors held, not counting homes:</span>
          {c.factions.map((f) => (
            <span key={f.id} className="tag" style={{ borderColor: factionColor(c, f.id) }}>
              {f.name}: {counts[f.id] ?? 0} sector{counts[f.id] === 1 ? '' : 's'}
              {ahead.has(f.id) && ' · leading'}
              {(behind[f.id] ?? 0) > 0 && ` · catch-up +${behind[f.id]} US`}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
