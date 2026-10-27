import { useMemo, useState } from 'react';
import { useStore } from '../model/store';
import { uid } from '../model/factory';
import type { Campaign, Force } from '../model/types';
import { emptyNexusPick, type NexusPick } from '../rules/nexus';
import { claimableRounds, resolveRoundIncome, roundIncomeItems } from '../rules/rounds';
import { depositNearest, depositText, rewardOrigin } from '../rules/production';
import NexusBox from './NexusBox';
import { Modal, confirmAction, toast } from './ui';
import { localDate } from '../model/date';

/**
 * Claiming this force's unclaimed round income with `picks` (an empty set for a one-tap claim): the preview, and
 * `commit` to bank it. Anomaly Materials go to the faction's bank nearest the force.
 */
export function useRoundClaim(force: Force, c: Campaign, picks: Record<string, NexusPick> = NO_PICKS) {
  const { state, update, updateForce } = useStore();
  const n = force.nexus!;
  const rounds = useMemo(() => claimableRounds(c, n, state.forces), [c, n, state.forces]);
  const items = useMemo(() => rounds.flatMap((r) => roundIncomeItems(c, n.factionId, r)), [c, n.factionId, rounds]);
  const date = localDate();
  const preview = useMemo(() => {
    let k = 0;
    return resolveRoundIncome(structuredClone(force), c, rounds, items, picks, date, () => `p${k++}`);
  }, [force, c, rounds, items, picks, date]);
  const commit = () => {
    updateForce(force.id, (d) => void resolveRoundIncome(d, c, rounds, items, picks, date, uid));
    let banked = '';
    if (preview.materials)
      update((s) => {
        const cc = s.campaign;
        if (!cc) return;
        banked = depositText(preview.materials, depositNearest(cc, n.factionId, preview.materials, rewardOrigin(cc, force)));
        cc.updatedAt = new Date().toISOString();
      });
    toast(banked ? `${preview.lines[0]} ${banked}.` : preview.lines[0]);
  };
  return { rounds, items, preview, commit };
}
const NO_PICKS: Record<string, NexusPick> = {};

/** Collect the sector income of every ended round this force's faction hasn't claimed yet (on any of its detachments). */
export default function RoundIncome({ force, c, onClose }: { force: Force; c: Campaign; onClose: () => void }) {
  const [picks, setPicks] = useState<Record<string, NexusPick>>({});
  const { rounds, items, preview, commit } = useRoundClaim(force, c, picks);
  const units = force.units.filter((u) => u.status !== 'removed');
  const setPick = (key: string, p: Partial<NexusPick>) => setPicks({ ...picks, [key]: { ...(picks[key] ?? emptyNexusPick()), ...p } });

  const claim = () => {
    if (preview.warnings.length && !confirmAction(`${preview.warnings.join('\n')}\n\nClaim anyway? Anything unresolved is lost.`)) return;
    commit();
    onClose();
  };

  return (
    <Modal title="Round income" onClose={onClose} wide
      footer={<><span className="muted small grow">{preview.lines[0]}</span><button onClick={onClose}>Cancel</button><button className="primary" disabled={!rounds.length} onClick={claim}>Claim</button></>}>
      {!rounds.length ? <p className="muted">Nothing to claim: no round has ended since your last claim.</p> : (
        <>
          <p className="muted small">
            What your sectors paid at the end of {rounds.length === 1 ? `round ${rounds[0].round}` : `rounds ${rounds[0].round}–${rounds[rounds.length - 1].round}`}.
            Claiming also ends the Nexus tables your last claim unlocked.
          </p>
          {items.length === 0 && <p className="muted">Your sectors produced nothing those rounds.</p>}
          {items.map((item) => (
            <NexusBox key={item.key} item={item} units={units} fighters={units} pick={picks[item.key] ?? emptyNexusPick()} setPick={(p) => setPick(item.key, p)} />
          ))}
          {preview.warnings.length > 0 && <ul className="issues">{preview.warnings.map((w, i) => <li key={i} className="warn">{w}</li>)}</ul>}
        </>
      )}
    </Modal>
  );
}

/** One tap for every unclaimed round. When a Nexus table still wants a roll or a choice, it opens the full claim instead. */
export function ClaimAll({ force, c, onPick }: { force: Force; c: Campaign; onPick: () => void }) {
  const { preview, commit } = useRoundClaim(force, c);
  const asks = preview.warnings.length;
  return (
    <button className="primary" onClick={() => (asks ? onPick() : commit())}
      data-tip={asks ? `${asks} Nexus roll${asks === 1 ? '' : 's'} or choice${asks === 1 ? '' : 's'} to make first: this opens them` : preview.lines[0]}>
      Claim all
    </button>
  );
}
