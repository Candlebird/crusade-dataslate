import { useEffect } from 'react';
import { useCloud } from '../cloud/CloudSync';
import { localDate } from '../model/date';
import { uid } from '../model/factory';
import { useStore } from '../model/store';
import type { Bounty, BountyKind, BountyReward, Campaign, Force } from '../model/types';
import {
  bountiesOwed, bountyHit, bountyText, claimBounties, claimBounty, fillBoard, payBounty, regenerate, retarget, rewardText, rewardWorth,
  setDifficulty, targets,
} from '../rules/bounties';
import type { RelicTier } from '../rules/data';
import { factionColor, factionName } from '../rules/nexus';
import { BOUNTY, BOUNTY_KINDS } from '../rules/nexusData';
import { Panel, toast } from './ui';

type SetC = (fn: (c: Campaign) => void) => void;

const STARS = ['', '★', '★★', '★★★'];
const TIERS: RelicTier[] = ['Common', 'Rare', 'Legendary'];
const REWARD_KINDS: Record<BountyReward['kind'], string> = {
  materials: 'Materials', research: 'Research', blueprints: 'Blueprints', cores: 'Building Expansions', archives: 'Archive unlocks',
  shards: 'Umbra Shards', traitToken: 'Trait tokens', relic: 'Relic',
};

/**
 * Pays bounties out on their own, wherever the campaign page is open: the GM's browser claims bounties the log has earned
 * (and pays the faction's share), and each player's browser gives its own forces their share.
 */
export function useBountyPayouts(c: Campaign | undefined, gm: boolean) {
  const { state, update, updateForce } = useStore();
  const cloud = useCloud();

  const hits = gm && c ? (c.bounties ?? []).filter((b) => bountyHit(c, b, state.battleHistory, state.forces)) : [];
  const hitKey = hits.map((b) => b.id).join();
  useEffect(() => {
    if (!hitKey) return;
    let lines: string[] = [];
    update((d) => {
      if (!d.campaign) return;
      lines = claimBounties(d.campaign, d.battleHistory ?? [], d.forces, localDate());
      if (lines.length) d.campaign.updatedAt = new Date().toISOString();
    });
    for (const l of lines) toast(`🎯 ${l}`);
  }, [hitKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const own = state.forces.filter((f) => f.nexus && (!f.owner || f.owner === cloud.email));
  const due = c ? own.flatMap((f) => bountiesOwed(c, f).map((b) => ({ f, b }))) : [];
  const dueKey = due.map(({ f, b }) => `${f.id}:${b.id}`).join();
  useEffect(() => {
    if (!c) return;
    for (const { f, b } of due) {
      const line = payBountyPreview(c, b, f);
      if (!line) continue;
      updateForce(f.id, (fd) => void payBounty(c, b, fd, localDate(), uid));
      toast(`${f.name} — ${line}`);
    }
  }, [dueKey]); // eslint-disable-line react-hooks/exhaustive-deps
}

const payBountyPreview = (c: Campaign, b: Bounty, f: Force) => payBounty(c, b, structuredClone(f), localDate(), () => '');

/** The Bounty Board: BOUNTY.slots bounties any faction can claim. The GM (`gm`) posts, edits and regenerates them. */
export default function BountyBoardPanel({ c, setC, gm }: { c: Campaign; setC: SetC; gm: boolean }) {
  const board = c.bounties ?? [];
  const open = board.filter((b) => !b.claimed).length;
  const post = () => {
    let n = 0;
    setC((d) => void (n = fillBoard(d, Math.random, uid).length));
    toast(n ? `${n} bount${n === 1 ? 'y' : 'ies'} posted.` : 'Nothing more to post: the board is full, or there is nothing to aim at.', n ? 'ok' : 'error');
  };
  return (
    <Panel id="campaign.bounties" title="Bounty Board" extra={
      <span className="row">
        <span className="muted small">{open} open of {BOUNTY.slots}</span>
        {gm && board.length < BOUNTY.slots && <button className="primary" onClick={post}>Post bounties</button>}
      </span>
    }>
      <p className="muted small">
        Any faction can claim a bounty. A game in the log claims it as soon as it's recorded; a hold is checked at each round's end.
        The faction's share (Materials, Research, Blueprints, Building Expansions, Archive unlocks) is paid at once; Umbra Shards,
        trait tokens and relics go to the force that won it. Claimed bounties are replaced when the round ends.
      </p>
      {board.length === 0 && <p className="muted">{gm ? 'The board is empty: post some bounties.' : 'The GM hasn\'t posted any bounties yet.'}</p>}
      {board.map((b, i) => <BountyCard key={b.id} c={c} setC={setC} b={b} i={i} gm={gm} />)}
    </Panel>
  );
}

function BountyCard({ c, setC, b, i, gm }: { c: Campaign; setC: SetC; b: Bounty; i: number; gm: boolean }) {
  const { state } = useStore();
  const edit = (fn: (b: Bounty, d: Campaign) => void) => setC((d) => { const x = d.bounties?.[i]; if (x && !x.claimed) fn(x, d); });
  const regen = (kind?: BountyKind) => {
    let ok = false;
    setC((d) => void (ok = regenerate(d, i, Math.random, uid, kind)));
    if (!ok) toast(kind ? `No ${BOUNTY_KINDS.find((k) => k.id === kind)!.name} bounty can be dealt right now.` : 'Nothing else to deal.', 'error');
  };
  const award = (factionId: string) => {
    let line = '';
    setC((d) => { const x = d.bounties?.[i]; if (x && !x.claimed) line = claimBounty(d, x, factionId, state.forces, localDate()); });
    if (line) toast(`🎯 ${line}`);
  };
  const kind = BOUNTY_KINDS.find((k) => k.id === b.kind)!;
  const options = targets(c, b.kind);
  const current = b.bandId ?? b.sectorId ?? b.factionId ?? '';
  const worth = b.rewards.reduce((n, r) => n + rewardWorth(r), 0);
  const claimedBy = b.claimed && c.factions.find((f) => f.id === b.claimed!.factionId);
  const claimedForce = b.claimed?.forceId && state.forces.find((f) => f.id === b.claimed!.forceId);

  return (
    <div className="list-item small bounty" style={{ alignItems: 'flex-start', opacity: b.claimed ? 0.7 : undefined }}>
      <span className="bounty-stars" title={`Difficulty ${b.difficulty}`}>{STARS[b.difficulty] ?? b.difficulty}</span>
      <span className="grow">
        <b>{kind.name}</b> — {bountyText(c, b)}
        <br />
        <span className="muted">Reward: {b.rewards.length ? b.rewards.map(rewardText).join(' and ') : 'nothing'}</span>
        {b.holder && !b.claimed && (
          <div className="muted">
            <span className="swatch" style={{ background: factionColor(c, b.holder.factionId) }} /> {factionName(c, b.holder.factionId)} has held it {b.holder.ends} of {b.rounds ?? 1}.
          </div>
        )}
        {b.claimed && (
          <div>
            <span className="tag">Claimed</span> by <span className="swatch" style={{ background: factionColor(c, b.claimed.factionId) }} /> <b>{claimedBy?.name ?? 'someone'}</b>
            {claimedForce && <> ({claimedForce.name})</>} in round {b.claimed.round}.
          </div>
        )}

        {gm && !b.claimed && (
          <div className="bounty-edit">
            <label>Kind{' '}
              <select value={b.kind} onChange={(e) => regen(e.target.value as BountyKind)}>
                {BOUNTY_KINDS.map((k) => <option key={k.id} value={k.id} disabled={k.id !== b.kind && !targets(c, k.id).length}>{k.name}</option>)}
              </select>
            </label>
            {b.kind !== 'noHero' && (
              <label>Target{' '}
                <select value={current} onChange={(e) => edit((_, d) => retarget(d, i, e.target.value))}>
                  {!options.some((t) => t.key === current) && <option value={current}>(gone)</option>}
                  {options.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
              </label>
            )}
            <label>Difficulty{' '}
              <select value={b.difficulty} onChange={(e) => edit((_, d) => setDifficulty(d, i, Number(e.target.value), Math.random))}>
                {[1, 2, 3].map((n) => <option key={n} value={n}>{STARS[n]}</option>)}
              </select>
            </label>
            {b.kind === 'hold' && (
              <label>Rounds{' '}
                <input type="number" min={1} max={9} value={b.rounds ?? 1} style={{ width: '3.5em' }}
                  onChange={(e) => edit((x) => void (x.rounds = Math.max(1, Number(e.target.value) || 1)))} />
              </label>
            )}
            <div className="bounty-rewards">
              {b.rewards.map((r, ri) => (
                <span key={ri} className="row" style={{ gap: '0.25rem' }}>
                  <select value={r.kind} onChange={(e) => edit((x) => {
                    const k = e.target.value as BountyReward['kind'];
                    x.rewards[ri] = k === 'relic' ? { kind: 'relic', tier: 'Common' } : { kind: k, n: BOUNTY.rewards.find((s) => s.kind === k)!.step };
                  })}>
                    {Object.entries(REWARD_KINDS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                  </select>
                  {r.kind === 'relic'
                    ? <select value={r.tier} onChange={(e) => edit((x) => void (x.rewards[ri] = { kind: 'relic', tier: e.target.value as RelicTier }))}>
                        {TIERS.map((t) => <option key={t}>{t}</option>)}
                      </select>
                    : <input type="number" min={1} value={r.n} style={{ width: '4.5em' }}
                        onChange={(e) => edit((x) => { const y = x.rewards[ri]; if (y.kind !== 'relic') y.n = Math.max(1, Number(e.target.value) || 1); })} />}
                  <button className="ghost icon" title="Remove this reward" onClick={() => edit((x) => void x.rewards.splice(ri, 1))}>✕</button>
                </span>
              ))}
              <button className="ghost small" onClick={() => edit((x) => void x.rewards.push({ kind: 'shards', n: 1 }))}>+ Reward</button>
              <span className="muted" title="What the rewards are worth, in Umbra Shards, against the difficulty's budget">
                worth ~{Math.round(worth * 10) / 10} / {BOUNTY.budget[b.difficulty]}
              </span>
            </div>
            <div className="row" style={{ gap: '0.35rem' }}>
              <button onClick={() => edit((x, d) => setDifficulty(d, i, x.difficulty, Math.random))}>Reroll rewards</button>
              <button onClick={() => regen()}>Regenerate</button>
              <select value="" onChange={(e) => e.target.value && award(e.target.value)} title="Hand the bounty to a faction yourself">
                <option value="">Award to…</option>
                {c.factions.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
          </div>
        )}
      </span>
      {gm && b.claimed && <button onClick={() => regen()} title="Replace it now rather than at the round's end">Regenerate</button>}
    </div>
  );
}
