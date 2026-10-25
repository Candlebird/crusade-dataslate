import { useEffect, useState } from 'react';
import { useStore } from '../model/store';
import { uid } from '../model/factory';
import type { Campaign, CrossroadsJournal, Force, JournalRoll } from '../model/types';
import { useCloud } from '../cloud/CloudSync';
import { proxyOf } from '../armyforge/book';
import {
  activeMarks, canReroll, catalystById, checksDone, checkTarget, chooseComplication, climaxPenalty, complicationById, contextById, dealJournal, dropMark, journalBlock,
  journalOf, journalStatus, journalText, journalUnit, journalsOwed, localOffer, makeOffer, payJournal, pickOption, recentRewards, reframeJournal, rerollCheck,
  rewardById, rollApproach, rollClimax, rollTwist, skillById, successes, threadBeat, tierCap, twistById, type JournalCheck,
} from '../rules/journal';
import { journalEndings } from '../rules/journalAi';
import { JOURNAL, JOURNAL_CATALYSTS, JOURNAL_COMPLICATIONS, JOURNAL_CONTEXTS, type JournalSkillId } from '../rules/journalData';
import { currentRound, factionName } from '../rules/nexus';
import { Panel, TextArea, confirmAction, toast } from './ui';
import { localDate } from '../model/date';
import { Icon } from './Icon';

type SetC = (fn: (c: Campaign) => void) => void;
const today = () => localDate();
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
    <Panel id="campaign.journal" title="Crossroads Journal" lead={(waiting.length > 0 || dealable.length > 0) && (
      <span className="muted small">
        {waiting.length > 0 ? `${waiting.length} journal${waiting.length === 1 ? '' : 's'} in progress.` : 'A new journal is ready to deal.'}
      </span>
    )}>
      <p className="muted small">
        Once a round your Warlord comes to a crossroads off the battlefield. Pick an approach, answer the complication
        and roll the checks: each is a D6 against the Warlord's Quality (Defense for Endurance), easier with fitting special rules.
        Re-roll a failed check once for {JOURNAL.rerollCost} Umbra Shards. More passes mean better endings, but at least one
        ending always gives nothing or costs you. Sometimes a twist adds a check, a rival Warlord appears, or an earlier
        journal's story thread returns.
      </p>
      {dealable.map((f) => (
        <div key={f.id} className="row">
          <span>{f.name}'s Warlord, {f.warlord!.name}, has no journal yet this round.</span>
          <button className="primary" onClick={() => deal(f.id)}>Deal the journal</button>
        </div>
      ))}
      {current.map((j) => <JournalCard key={j.id} c={c} setC={setC} j={j} gm={gm} own={own} />)}
      {factions.map((f) => <Marks key={f.id} c={c} setC={setC} factionId={f.id} canDrop={gm || me === f.id} />)}
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
  const twist = twistById(j.twist?.id);
  const beat = threadBeat(j);
  const say = (text: string | undefined) => (text ? journalText(j, text) : text);

  const edit = (fn: (x: CrossroadsJournal) => void) => setC((d) => {
    const x = d.journals?.find((y) => y.id === j.id);
    if (x) fn(x);
  });
  const target = (skill: JournalSkillId, penalty = 0) => (u ? checkTarget(u, skill, level, penalty) : 0);

  const reroll = (which: JournalCheck) => {
    if (!force || force.umbraShards < JOURNAL.rerollCost) return toast(`A re-roll costs ${JOURNAL.rerollCost} Umbra Shards.`, 'error');
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
      else if (makeOffer(x, localOffer(x, u, state.forces, Math.random, recentRewards(c, x.factionId)).map((rewardId) => ({ rewardId })), 'tables', u, state.forces, Math.random, uid)) got = 'tables';
    });
    setBusy(false);
    if (!got) toast('The endings could not be drawn.', 'error');
    else if (got === 'tables') toast('Claude was unreachable; the tables chose the endings.');
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
        {gm && status !== 'done' && <button className="ghost small" onClick={discard} data-tip="Discard this journal" aria-label="Discard this journal"><Icon name="l:x" /></button>}
      </h3>
      {!u && <p className="warn small">{force ? `${j.warlord} is no longer in play.` : `Load ${j.warlord}'s force in this browser to play the journal.`}</p>}
      {j.note && <p><i>{j.note}</i></p>}
      <p><b>{ctx?.name}.</b> {ctx?.text}</p>
      <p><b>{cat?.name}.</b> {cat?.text}</p>
      {beat && <p className="thread"><b>{beat.name}</b> <span className="muted small">({beat.step + 1} of {beat.of})</span> <i>{beat.text}</i></p>}

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
          <p><b>{say(comp.name)}.</b> {say(comp.text)}</p>
          {!j.choice ? (
            canPlay && (
              <div className="option-section">
                <h4>What do you do?</h4>
                {comp.choices.map((ch) => (
                  <div key={ch.id} className="option">
                    <button onClick={() => edit((x) => void chooseComplication(x, ch.id, u!, level, Math.random))}>{say(ch.label)}</button>
                    <span className="small">{say(ch.text)}</span>
                    <span className="cost">{ch.skill ? `${skillById(ch.skill)?.name} ${target(ch.skill)}+ (fail: climax harder)` : 'Safe: no roll'}</span>
                  </div>
                ))}
              </div>
            )
          ) : (
            <p><b>{say(choice?.label)}.</b> <span className="small">{say(choice?.text)}</span>{j.choice.roll && <><RollLine r={j.choice.roll} /> <Reroll which="choice" r={j.choice.roll} /></>}</p>
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

      {/* The twist: one more check, now and then. */}
      {j.climax && j.twist && twist && (
        <>
          <p><b>A twist: {twist.name}.</b> {say(twist.text)}</p>
          {!j.twist.roll ? (
            canPlay && (
              <div className="row">
                {twist.skills.map((s) => (
                  <button key={s} onClick={() => edit((x) => void rollTwist(x, s, u!, level, Math.random))}>{skillById(s)?.name} {target(s)}+</button>
                ))}
                <span className="muted small">Fail and one more ending gives nothing.</span>
              </div>
            )
          ) : (
            <p><RollLine r={j.twist.roll} /> <Reroll which="twist" r={j.twist.roll} /></p>
          )}
        </>
      )}

      {/* The tally. */}
      {status === 'play' && checksDone(j) && (
        <div className="row">
          <span className="small">{successes(j)} of {j.twist ? 4 : 3} checks passed: endings up to tier {tierCap(j)}.</span>
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
                    {r?.desc !== o.text && r?.desc}
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
          {JOURNAL_COMPLICATIONS.filter((x) => !x.rival || j.rival || x.id === j.complication).map((x) => <option key={x.id} value={x.id}>{journalText(j, x.name)}</option>)}
        </select>
      </div>
      <TextArea value={j.note ?? ''} rows={2} placeholder="Your own line to set the scene (the twist stays hidden until the first roll)" onCommit={(note) => set({ note })} />
      <button className="small" onClick={onDone}>Done</button>
    </div>
  );
}

/** The marks Crossroads Journal endings left on a faction's Warlord, with a button to strike one off once it's used. */
function Marks({ c, setC, factionId, canDrop }: { c: Campaign; setC: SetC; factionId: string; canDrop?: boolean }) {
  const marks = activeMarks(c, factionId, currentRound(c));
  if (!marks.length) return null;
  const where = (m: (typeof marks)[number]) =>
    m.kind === 'quirk' ? 'for good' : m.kind === 'sector' ? `${c.sectors.find((x) => x.id === m.sectorId)?.name ?? 'a sector'}, until round ${m.until}` : `next ${m.kind}, until round ${m.until}`;
  return (
    <div className="option-section">
      <h4>{factionName(c, factionId)}'s marks</h4>
      {marks.map((m) => (
        <div key={m.id} className="option">
          <span className={`tag ${m.good ? 'green' : 'red'}`}>{m.kind}</span>
          <span className="small"><b>{m.name}.</b> {m.text} <span className="muted">({where(m)})</span></span>
          {canDrop && m.kind !== 'quirk' && (
            <button className="ghost small" data-tip="Strike it off once it's used" onClick={() => setC((d) => void dropMark(d, factionId, m.id))}>Used</button>
          )}
        </div>
      ))}
    </div>
  );
}
