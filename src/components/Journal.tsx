import { useEffect, useState } from 'react';
import { useStore } from '../model/store';
import { uid } from '../model/factory';
import type { Campaign, CrossroadsJournal, Force, JournalRoll } from '../model/types';
import { useCloud } from '../cloud/CloudSync';
import { proxyOf } from '../armyforge/book';
import {
  canReroll, catalystById, checkTarget, chooseComplication, climaxPenalty, complicationById, contextById, dealJournal, journalBlock,
  journalOf, journalStatus, journalUnit, journalsOwed, localOffer, makeOffer, payJournal, pickOption, reframeJournal, rerollCheck,
  rewardById, rollApproach, rollClimax, skillById, successes, tierCap, type JournalCheck,
} from '../rules/journal';
import { journalEndings } from '../rules/journalAi';
import { JOURNAL, JOURNAL_CATALYSTS, JOURNAL_COMPLICATIONS, JOURNAL_CONTEXTS, type JournalSkillId } from '../rules/journalData';
import { factionName } from '../rules/nexus';
import { Panel, TextArea, confirmAction, toast } from './ui';

type SetC = (fn: (c: Campaign) => void) => void;
const today = () => new Date().toISOString().slice(0, 10);
const LETTERS = ['A', 'B', 'C', 'D'];

/**
 * Crossroads Journal: once a round each faction's Warlord lives through a short vignette dealt from the tables. The
 * player makes the choices and rolls the checks, then picks one of four endings (written by Claude through the proxy
 * when it can be reached). `me` is the viewer's faction; the GM (`gm`) deals, frames and can play for anyone. Pays
 * this browser's own forces what their Warlords' endings gave them.
 */
export default function JournalPanel({ c, setC, me, gm }: { c: Campaign; setC: SetC; me?: string; gm?: boolean }) {
  const { state, updateForce } = useStore();
  const cloud = useCloud();
  const own = state.forces.filter((f) => f.nexus && (!f.owner || f.owner === cloud.email));

  // The Warlord's share of a picked ending (Umbra Shards, XP, relics, scars, trait tokens) goes to its force here.
  const due = own.flatMap((f) => journalsOwed(c, f).map((j) => ({ f, j })));
  const dueKey = due.map(({ f, j }) => `${f.id}:${j.id}`).join();
  useEffect(() => {
    for (const { f, j } of due) {
      const line = payJournal(j, structuredClone(f), today(), () => '');
      if (!line) continue;
      updateForce(f.id, (fd) => void payJournal(j, fd, today(), uid));
      toast(`${f.name} — ${line}`);
    }
  }, [dueKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const factions = me ? c.factions.filter((f) => f.id === me) : gm ? c.factions : [];
  const current = factions.map((f) => journalOf(c, f.id)).filter((j): j is CrossroadsJournal => !!j);
  const dealable = factions.filter((f) => !journalBlock(c, f.id));
  const waiting = current.filter((j) => journalStatus(j) !== 'done');
  const past = (c.journals ?? []).filter((j) => j.picked != null && !current.includes(j)).slice(-8).reverse();

  const deal = (factionId: string) => {
    let j: CrossroadsJournal | undefined;
    setC((d) => void (j = dealJournal(d, factionId, state.forces, Math.random, uid(), today())));
    toast(j ? `${factionName(c, factionId)}'s Warlord comes to a crossroads.` : journalBlock(c, factionId) ?? 'No journal dealt.', j ? 'ok' : 'error');
  };

  return (
    <Panel id="campaign.journal" title="Crossroads Journal" collapsed={!waiting.length && !dealable.length} lead={(waiting.length > 0 || dealable.length > 0) && (
      <span className="muted small">
        {waiting.length > 0 ? `${waiting.length} journal${waiting.length === 1 ? '' : 's'} in progress.` : 'A new journal is ready to deal.'}
      </span>
    )}>
      <p className="muted small">
        Once a round your Warlord comes to a crossroads, away from the battlefield. Pick how they take it on, answer the
        twist, and roll the checks: each is a D6 against the Warlord's Quality (Defense for Endurance), and special rules
        that suit the skill make it easier. A failed check can be re-rolled once for {JOURNAL.rerollCost} Umbra Shard.
        The more checks pass, the better the endings on offer, but at least one ending always gives nothing, or costs you.
      </p>
      {dealable.map((f) => (
        <div key={f.id} className="row">
          <span>{f.name}'s Warlord, {f.warlord!.name}, has no journal yet this round.</span>
          <button className="primary" onClick={() => deal(f.id)}>Deal the journal</button>
        </div>
      ))}
      {current.map((j) => <JournalCard key={j.id} c={c} setC={setC} j={j} gm={gm} own={own} />)}
      {!factions.length && <p className="muted small">Link a force to a faction to play its Warlord's journal.</p>}
      {factions.length > 0 && !current.length && !dealable.length && (
        <p className="muted small">{factions.map((f) => `${f.name}: ${journalBlock(c, f.id)}`).join('. ')}.</p>
      )}
      {past.length > 0 && (
        <>
          <h3>Earlier journals</h3>
          <ul className="small">
            {past.map((j) => (
              <li key={j.id}>
                Round {j.round}, {factionName(c, j.factionId)}: {j.warlord} — {catalystById(j.catalyst)?.name}. <b>{j.options![j.picked!].title}</b>
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}

function RollLine({ r }: { r: JournalRoll }) {
  const last = r.rolls[r.rolls.length - 1];
  return (
    <span className="small">
      {' '}{skillById(r.skill)?.name} {r.target}+: rolled {r.rolls.length > 1 ? `${r.rolls[0]}, re-rolled ${last}` : last}{' '}
      {r.pass ? <span className="tag green">passed</span> : <span className="tag red">failed</span>}
    </span>
  );
}

function JournalCard({ c, setC, j, gm, own }: { c: Campaign; setC: SetC; j: CrossroadsJournal; gm?: boolean; own: Force[] }) {
  const { state, updateForce } = useStore();
  const [busy, setBusy] = useState(false);
  const [framing, setFraming] = useState(false);
  const u = journalUnit(j, state.forces);
  const force = state.forces.find((f) => f.id === j.forceId);
  const level = c.factions.find((f) => f.id === j.factionId)?.warlord?.level ?? 1;
  const canPlay = !!u && (gm || own.some((f) => f.id === j.forceId));
  const status = journalStatus(j);
  const ctx = contextById(j.context);
  const cat = catalystById(j.catalyst);
  const comp = complicationById(j.complication);
  const approach = cat?.approaches.find((a) => a.id === j.approach?.id);
  const choice = comp?.choices.find((x) => x.id === j.choice?.id);

  const edit = (fn: (x: CrossroadsJournal) => void) => setC((d) => {
    const x = d.journals?.find((y) => y.id === j.id);
    if (x) fn(x);
  });
  const target = (skill: JournalSkillId, penalty = 0) => (u ? checkTarget(u, skill, level, penalty) : 0);

  const reroll = (which: JournalCheck) => {
    if (!force || force.umbraShards < JOURNAL.rerollCost) return toast(`A re-roll costs ${JOURNAL.rerollCost} Umbra Shard.`, 'error');
    let ok = false;
    edit((x) => void (ok = rerollCheck(x, which, Math.random)));
    if (!ok) return;
    updateForce(force.id, (fd) => {
      fd.umbraShards -= JOURNAL.rerollCost;
      fd.ledger.push({ id: uid(), date: today(), label: 'Crossroads Journal: re-roll', rp: 0, supply: 0, us: -JOURNAL.rerollCost });
    });
  };
  const Reroll = ({ which, r }: { which: JournalCheck; r: JournalRoll }) =>
    canPlay && !r.pass && canReroll(j, which)
      ? <button className="small" disabled={!force || force.umbraShards < JOURNAL.rerollCost} onClick={() => reroll(which)}>Re-roll ({JOURNAL.rerollCost} US)</button>
      : null;

  const tally = async () => {
    if (!u) return;
    setBusy(true);
    const { picks, source } = await journalEndings(proxyOf(state.settings), c, j, u, state.forces, Math.random);
    let got: 'claude' | 'tables' | undefined;
    edit((x) => {
      if (makeOffer(x, picks, source, u, state.forces, Math.random, uid)) got = source;
      // Things changed while Claude was writing: the tables pick instead.
      else if (makeOffer(x, localOffer(x, u, state.forces, Math.random).map((rewardId) => ({ rewardId })), 'tables', u, state.forces, Math.random, uid)) got = 'tables';
    });
    setBusy(false);
    if (!got) toast('The endings could not be drawn.', 'error');
    else if (got === 'tables') toast('Claude could not be reached, so the tables chose the endings.');
  };

  const pick = (i: number) => {
    const o = j.options![i];
    if (!confirmAction(`Choose ${LETTERS[i]}: ${o.title}? This can't be undone.`)) return;
    let line: string | undefined;
    setC((d) => void (line = pickOption(d, j.id, i, state.forces, today())));
    if (line) toast(line);
  };

  const discard = () => {
    if (!confirmAction(`Discard ${j.warlord}'s journal? A new one can be dealt this round.`)) return;
    setC((d) => void (d.journals = (d.journals ?? []).filter((x) => x.id !== j.id)));
  };

  return (
    <div className="warlord">
      <h3>
        {j.warlord} <span className="muted small">— {factionName(c, j.factionId)}, round {j.round}</span>
        {gm && status !== 'done' && <button className="ghost small" onClick={discard} title="Discard this journal">✕</button>}
      </h3>
      {!u && <p className="warn small">{force ? `${j.warlord} is no longer in play.` : `Load ${j.warlord}'s force in this browser to play the journal.`}</p>}
      {j.note && <p><i>{j.note}</i></p>}
      <p><b>{ctx?.name}.</b> {ctx?.text}</p>
      <p><b>{cat?.name}.</b> {cat?.text}</p>

      {gm && !j.approach && (framing
        ? <Framing j={j} edit={edit} onDone={() => setFraming(false)} />
        : <button className="small" onClick={() => setFraming(true)}>Frame the scene</button>)}

      {/* The approach. */}
      {!j.approach ? (
        canPlay && cat && (
          <div className="option-section">
            <h4>How do you take it on?</h4>
            {cat.approaches.map((a) => (
              <div key={a.id} className="option">
                <button onClick={() => edit((x) => void rollApproach(x, a.id, u!, level, Math.random))}>{a.label}</button>
                <span className="small">{a.text}</span>
                <span className="cost">{skillById(a.skill)?.name} {target(a.skill)}+</span>
              </div>
            ))}
          </div>
        )
      ) : (
        <p><b>{approach?.label}.</b> <span className="small">{approach?.text}</span><RollLine r={j.approach.roll} /> <Reroll which="approach" r={j.approach.roll} /></p>
      )}

      {/* The complication. */}
      {j.approach && comp && (
        <>
          <p><b>{comp.name}.</b> {comp.text}</p>
          {!j.choice ? (
            canPlay && (
              <div className="option-section">
                <h4>What do you do?</h4>
                {comp.choices.map((ch) => (
                  <div key={ch.id} className="option">
                    <button onClick={() => edit((x) => void chooseComplication(x, ch.id, u!, level, Math.random))}>{ch.label}</button>
                    <span className="small">{ch.text}</span>
                    <span className="cost">{ch.skill ? `${skillById(ch.skill)?.name} ${target(ch.skill)}+ (fail: climax harder)` : 'Safe: no roll'}</span>
                  </div>
                ))}
              </div>
            )
          ) : (
            <p><b>{choice?.label}.</b> <span className="small">{choice?.text}</span>{j.choice.roll && <><RollLine r={j.choice.roll} /> <Reroll which="choice" r={j.choice.roll} /></>}</p>
          )}
        </>
      )}

      {/* The climax. */}
      {j.choice && cat && (
        <>
          <p><b>The climax.</b> {cat.climax.text}</p>
          {!j.climax ? (
            canPlay && (
              <div className="row">
                {cat.climax.skills.map((s) => (
                  <button key={s} onClick={() => edit((x) => void rollClimax(x, s, u!, level, Math.random))}>
                    {skillById(s)?.name} {target(s, climaxPenalty(j))}+
                  </button>
                ))}
                {climaxPenalty(j) > 0 && <span className="muted small">The failed gamble makes it harder: +1 to the target.</span>}
              </div>
            )
          ) : (
            <p><RollLine r={j.climax} /> <Reroll which="climax" r={j.climax} /></p>
          )}
        </>
      )}

      {/* The tally. */}
      {status === 'play' && j.climax && (
        <div className="row">
          <span className="small">{successes(j)} of 3 checks passed: endings up to tier {tierCap(j)}.</span>
          {canPlay && <button className="primary" disabled={busy} onClick={tally}>{busy ? 'The story turns…' : 'See how it ends'}</button>}
        </div>
      )}

      {/* The endings. */}
      {j.options && (
        <div className="option-section">
          <h4>{status === 'done' ? 'How it ended' : 'How does it end?'} <span className="muted small">({j.source === 'claude' ? 'written by Claude' : 'from the tables'})</span></h4>
          {j.options.map((o, i) => {
            if (status === 'done' && i !== j.picked) return null;
            const r = rewardById(o.rewardId);
            return (
              <div key={i} className="option" style={{ alignItems: 'flex-start' }}>
                {status === 'offer' && canPlay
                  ? <button className={r && r.tier > 0 ? 'primary' : undefined} onClick={() => pick(i)}>{LETTERS[i]}</button>
                  : <b>{LETTERS[i]}</b>}
                <div>
                  <b>{o.title}.</b> <span className="small">{o.text}</span>
                  <div className="muted small">
                    {r?.desc}
                    {o.relic && <> Relic: <b>{o.relic.name}</b> ({o.relic.tier}).</>}
                    {o.scar && <> Scar: <b>{o.scar.name}</b>.</>}
                  </div>
                </div>
              </div>
            );
          })}
          {status === 'offer' && !canPlay && <p className="muted small">Waiting for {factionName(c, j.factionId)} to choose.</p>}
        </div>
      )}
    </div>
  );
}

/** GM: swap the scene's pieces and add a line of framing, before the first roll. */
function Framing({ j, edit, onDone }: { j: CrossroadsJournal; edit: (fn: (x: CrossroadsJournal) => void) => void; onDone: () => void }) {
  const set = (next: Parameters<typeof reframeJournal>[1]) => edit((x) => void reframeJournal(x, next));
  return (
    <div className="option-section">
      <div className="row">
        <select value={j.context} onChange={(e) => set({ context: e.target.value })} aria-label="Context">
          {JOURNAL_CONTEXTS.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
        <select value={j.catalyst} onChange={(e) => set({ catalyst: e.target.value })} aria-label="Catalyst">
          {JOURNAL_CATALYSTS.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
        <select value={j.complication} onChange={(e) => set({ complication: e.target.value })} aria-label="Complication">
          {JOURNAL_COMPLICATIONS.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      </div>
      <TextArea value={j.note ?? ''} rows={2} placeholder="A line of your own to set the scene (the twist stays hidden until the first roll)" onCommit={(note) => set({ note })} />
      <button className="small" onClick={onDone}>Done</button>
    </div>
  );
}

