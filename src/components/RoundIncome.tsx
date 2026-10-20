import { useMemo, useState } from 'react';
import { useStore } from '../model/store';
import { uid } from '../model/factory';
import type { Campaign, Force } from '../model/types';
import { emptyNexusPick, type NexusPick } from '../rules/nexus';
import { claimableRounds, resolveRoundIncome, roundIncomeItems } from '../rules/rounds';
import NexusBox from './NexusBox';
import { Modal, confirmAction, toast } from './ui';

/** Collect the sector income of every ended round this force hasn't claimed yet. */
export default function RoundIncome({ force, c, onClose }: { force: Force; c: Campaign; onClose: () => void }) {
  const { updateForce } = useStore();
  const [picks, setPicks] = useState<Record<string, NexusPick>>({});
  const n = force.nexus!;
  const rounds = useMemo(() => claimableRounds(c, n), [c, n]);
  const items = useMemo(() => rounds.flatMap((r) => roundIncomeItems(c, n.factionId, r)), [c, n.factionId, rounds]);
  const date = new Date().toISOString().slice(0, 10);
  const preview = useMemo(() => {
    let k = 0;
    return resolveRoundIncome(structuredClone(force), c, rounds, items, picks, date, () => `p${k++}`);
  }, [force, c, rounds, items, picks, date]);
  const units = force.units.filter((u) => u.status !== 'removed');
  const setPick = (key: string, p: Partial<NexusPick>) => setPicks({ ...picks, [key]: { ...(picks[key] ?? emptyNexusPick()), ...p } });

  const claim = () => {
    if (preview.warnings.length && !confirmAction(`${preview.warnings.join('\n')}\n\nClaim anyway? Anything unresolved is lost.`)) return;
    updateForce(force.id, (d) => void resolveRoundIncome(d, c, rounds, items, picks, date, uid));
    toast(preview.lines[0]);
    onClose();
  };

  return (
    <Modal title="Round income" onClose={onClose} wide
      footer={<><span className="muted small grow">{preview.lines[0]}</span><button onClick={onClose}>Cancel</button><button className="primary" disabled={!rounds.length} onClick={claim}>Claim</button></>}>
      {!rounds.length ? <p className="muted">Nothing to claim: the GM hasn't ended a round since your last claim.</p> : (
        <>
          <p className="muted small">
            What your sectors paid at the end of {rounds.length === 1 ? `round ${rounds[0].round}` : `rounds ${rounds[0].round}–${rounds[rounds.length - 1].round}`}.
            Claiming also ends the Nexus tables you unlocked with your last claim.
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
