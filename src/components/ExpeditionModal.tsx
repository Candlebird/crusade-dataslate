import { useState } from 'react';
import { useStore } from '../model/store';
import { uid } from '../model/factory';
import type { Campaign, Force } from '../model/types';
import { unitName } from '../rules/battle';
import { markUnitsUsed, unitsUsed } from '../rules/nexus';
import { EXPEDITION, EXPEDITION_SITES } from '../rules/downtimeData';
import {
  applyExpedition, broughtHome, expeditionsLeft, carried, checkOdds, checkText, chooseOption, currentEncounter, expeditionNames, expeditionSite, headHome, pressOn, rewardText, scaledReward, scanSite, shareOf, squadBonus, startExpedition, unhurt,
  type Expedition,
} from '../rules/downtime';
import { bankRoom, depositNearest, depositText, rewardOrigin } from '../rules/production';
import { Modal, toast } from './ui';
import { localDate } from '../model/date';

/**
 * Send up to three units on a short dice-story into the Nexus. Each unit goes once a round, and the faction's forces
 * share EXPEDITION.perFaction a round. A Scan picks
 * the site at random, and the force is locked into it until it records an Expedition there.
 */
export default function ExpeditionModal({ force, c, onClose }: { force: Force; c: Campaign; onClose: () => void }) {
  const { state, update, updateForce } = useStore();
  const left = expeditionsLeft(force, state.forces, c);
  const units = force.units.filter((u) => u.status === 'active');
  const used = unitsUsed(force, c);
  const scan = force.nexus?.expeditionScan;
  const site = scan && expeditionSite(scan) ? scan : undefined;
  const [squad, setSquad] = useState<string[]>([]);
  const [e, setE] = useState<Expedition | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const bonus = squadBonus(units.filter((u) => (e?.squad ?? squad).includes(u.id)));

  const step = (fn: (x: Expedition) => void) => setE((old) => {
    const x = structuredClone(old!);
    fn(x);
    return x;
  });

  const apply = (x: Expedition) => {
    let summary = '';
    // The haul's Materials go to the faction's bank nearest this force.
    let banked = '';
    const materials = broughtHome(x).materials;
    if (materials)
      update((s) => {
        const cc = s.campaign;
        if (!cc || !force.nexus) return;
        banked = depositText(materials, depositNearest(cc, force.nexus.factionId, materials, rewardOrigin(cc, force)));
        cc.updatedAt = new Date().toISOString();
      });
    updateForce(force.id, (d) => {
      summary = applyExpedition(d, x, localDate(), uid, banked || undefined, c);
      markUnitsUsed(d, c, x.squad);
    });
    setDone(summary);
    toast('Expedition recorded.');
  };

  // Closing part-way is heading home: the squad keeps its haul.
  const close = () => {
    if (e && !done) {
      const x = structuredClone(e);
      headHome(x);
      apply(x);
    }
    onClose();
  };

  const toggle = (id: string) =>
    setSquad((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length < EXPEDITION.squadMax ? [...s, id] : s));

  const name = (id: string) => {
    const u = force.units.find((x) => x.id === id);
    return u ? unitName(u) : 'a unit';
  };

  let body;
  let footer;
  if (!e && !site) {
    body = (
      <>
        <p className="small" style={{ marginTop: 0 }}>
          Up to {EXPEDITION.squadMax} units face {EXPEDITION.encounters} encounters in the Nexus. After each, head home with the haul or press on.
        </p>
        <p className="muted small">
          Scan the Nexus to find where to go: one of {EXPEDITION_SITES.length} sites, at random. The site stays locked in until an Expedition there comes home, so you can't scan again to pick another.
        </p>
      </>
    );
    footer = (
      <>
        <button onClick={onClose}>Cancel</button>
        <button className="primary" onClick={() => updateForce(force.id, (d) => { if (d.nexus) d.nexus.expeditionScan ??= scanSite(); })}>Scan</button>
      </>
    );
  } else if (!e) {
    const s = expeditionSite(site!)!;
    body = (
      <>
        <p className="small" style={{ marginTop: 0 }}>
          Up to {EXPEDITION.squadMax} units face {EXPEDITION.encounters} encounters in the Nexus. After each, head home with the haul or press on.
        </p>
        <p className="muted small">
          Deeper pays more, but each failed roll raises the ambush danger. Each unit that comes home unhurt carries back 1/{EXPEDITION.squadMax} of what the squad finds, so a smaller squad, or one with hurt units, leaves the rest behind (XP goes to every unit in full).
          {' '}Checks roll 1–4 dice. Every roll gets +1 per unit after the first and +1 per {EXPEDITION.levelsPerBonus} squad levels (max +{EXPEDITION.bonusCap}).
        </p>
        <div className="fields">
          <p className="span-all small" style={{ margin: 0 }}>
            <span className="muted">{left} of {EXPEDITION.perFaction} Expeditions left for your faction this round.</span>
          </p>
          <p className="span-all small" style={{ margin: 0 }}>
            <span className="muted">The scan found:</span> <b>{s.name}</b> <span className="tag gold" data-tip="Locked in until an Expedition there comes home.">Locked</span>
          </p>
          <p className="span-all small" style={{ margin: 0 }}>{s.desc} <span className="muted">Make it all the way: {rewardText(s.finish.reward)} for a full squad.</span></p>
          {/* Same test as depositNearest: Materials only bank where there's room, so with none they're lost. */}
          {(!force.nexus || bankRoom(c, force.nexus.factionId) <= 0) && (
            <p className="span-all small" style={{ margin: 0, color: 'var(--warn)' }}>No bank: any Materials found are lost.</p>
          )}
          <div className="span-all small">
            <div className="muted">Squad ({squad.length}/{EXPEDITION.squadMax}){squad.length > 0 && <> · <b>+{bonus}</b> to every roll</>}</div>
            {squad.length > 0 && <CarryNote carrying={squad.length} why={squad.length < EXPEDITION.squadMax ? `only ${squad.length} unit${squad.length > 1 ? 's' : ''} picked` : ''} example={`making it all the way brings home ${rewardText(shareOf(squad.length, s.finish.reward))}`} />}
            {units.length === 0 && <span className="muted">No active units.</span>}
            {used.length > 0 && <div className="muted">Units that already went on a Solo patrol, Expedition or task this round stay home. Games at the table don't count.</div>}
            <div className="mission-pick">
              {units.map((u) => {
                const on = squad.includes(u.id);
                const out = used.includes(u.id);
                const full = !on && squad.length >= EXPEDITION.squadMax;
                const why = out ? 'Already went out this round' : full ? `The squad is full (${EXPEDITION.squadMax} units)` : undefined;
                return (
                  <label key={u.id} className={`shop-item${on ? ' selected' : ''}${why ? ' disabled' : ''}`} data-tip={why}>
                    <input type="checkbox" checked={on} disabled={!!why} onChange={() => toggle(u.id)} />
                    <div className="grow">
                      <b>{unitName(u)}</b> <span className="muted small">{u.points} pts</span>
                      {out && <> <span className="tag gold">Out this round</span></>}
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      </>
    );
    footer = (
      <>
        <button onClick={onClose}>Cancel</button>
        <button className="primary" disabled={!squad.length || !left} data-tip={!left ? 'Your faction has no Expeditions left this round' : squad.length ? undefined : 'Pick at least one unit'} onClick={() => setE(startExpedition(site!, squad, Math.random, expeditionNames(force, c, squad)))}>Set out</button>
      </>
    );
  } else {
    const s = expeditionSite(e.site)!;
    const enc = currentEncounter(e);
    body = (
      <>
        <div className="row small">
          <span className="grow">
            <b>{s.name}</b> · {e.phase === 'done' ? (e.finished ? 'made it all the way' : 'heading home') : `encounter ${Math.min(e.stage + 1, e.deck.length)} of ${e.deck.length}`}
            {' '}· squad: {e.squad.map(name).join(', ')}
          </span>
          <span data-tip="Bonus is added to every roll. Each failed roll raises the danger; pressing on rolls a D6 against it for an ambush.">
            Bonus <b>+{bonus}</b> · Danger <b>{e.danger}</b>
          </span>
        </div>
        <p className="small" style={{ margin: '0.5rem 0' }}>
          <span className="muted">Bringing home:</span> <b>{rewardText(broughtHome(e))}</b>
          {unhurt(e).length < EXPEDITION.squadMax && rewardText({ ...e.haul, xp: 0 }) !== 'nothing' && <span className="muted"> · found {rewardText({ ...e.haul, xp: 0 })}</span>}
        </p>
        {unhurt(e).length < EXPEDITION.squadMax && <CarryNote carrying={unhurt(e).length} why={carryWhy(e, name)} />}
        {e.log.length > 0 && (
          <ol className="small" style={{ paddingLeft: '1.2rem' }}>
            {e.log.map((l, i) => <li key={i}>{l}</li>)}
          </ol>
        )}
        {e.injuries.length > 0 && (
          <p className="small" style={{ color: 'var(--warn)' }}>
            {e.injuries.map((x) => `${name(x.unitId)}: ${x.scar ?? 'Lost (sits out the next battle)'}`).join(' · ')}
          </p>
        )}
        {e.phase === 'encounter' && enc && (
          <div className="panel">
            <h3>{enc.title}</h3>
            <p>{enc.text}</p>
            {enc.choices.map((ch, i) => (
              <div key={i} className="row" style={{ marginTop: '0.4rem' }}>
                <button onClick={() => step((x) => void chooseOption(x, i, bonus))}>{ch.label}</button>
                <span className="muted small grow">
                  {ch.check ? `${checkText(ch.check)} · ${Math.round(checkOdds(ch.check, bonus) * 100)}%` : 'no roll'}
                  {/* What it adds to the haul brought home, at the squad's share, and what the squad finds when that's more. */}
                  {choiceGain(e, scaledReward(ch.reward, e.stage))}
                </span>
              </div>
            ))}
          </div>
        )}
        {e.phase === 'crossroads' && (
          <p className="small">
            {e.danger
              ? `Press on and roll a D6: on ${e.danger === 1 ? 'a 1' : e.danger >= 6 ? 'any roll' : `1–${e.danger}`} the squad is ambushed and a unit is scarred or Lost.`
              : 'No danger yet. Pressing on is safe.'}
            {' '}Rewards deeper in are worth more.
          </p>
        )}
        {e.phase === 'done' && done && (
          <div className="small panel">
            <b>Recorded on {force.name}:</b> {done}
            {e.haul.xp > 0 && <div className="muted">The XP went to each of {e.squad.map(name).join(', ')}.</div>}
            <div className="muted">They count as out for the rest of this round.</div>
          </div>
        )}
        {!done && (
          <p className="muted small">
            {e.phase === 'done'
              ? `The expedition is over. Bring the haul home to record it on ${force.name}; closing this window does the same.`
              : 'Closing this window heads home with the haul so far.'}
          </p>
        )}
      </>
    );
    footer = e.phase === 'crossroads' ? (
      <>
        <button onClick={() => { const x = structuredClone(e); headHome(x); setE(x); apply(x); }}>Head home</button>
        <button className="primary" onClick={() => step((x) => void pressOn(x))}>Press on</button>
      </>
    ) : e.phase === 'done' ? (
      <>
        {!done && <button className="primary" onClick={() => apply(e)}>Bring the haul home</button>}
        {done && <button className="primary" onClick={onClose}>Close</button>}
      </>
    ) : null;
  }

  return <Modal title="Expedition" onClose={done ? onClose : close} footer={footer} wide>{body}</Modal>;
}

/** Why fewer than a full squad's worth of units can carry: empty places in the squad, and who's hurt. */
function carryWhy(e: Expedition, name: (id: string) => string) {
  const empty = EXPEDITION.squadMax - e.squad.length;
  const hurt = e.squad.filter((id) => !unhurt(e).includes(id)).map(name);
  return [
    empty > 0 && `${e.squad.length} unit${e.squad.length > 1 ? 's' : ''} sent`,
    hurt.length > 0 && `${hurt.join(' and ')} ${hurt.length > 1 ? 'are' : 'is'} hurt and can't carry`,
  ].filter(Boolean).join('; ');
}

/** The carrying share spelled out: how many units carry, why not all, and (optionally) what that means for the finish. */
function CarryNote({ carrying, why, example }: { carrying: number; why: string; example?: string }) {
  const full = carrying >= EXPEDITION.squadMax;
  return (
    <p className="small" style={{ margin: '0.25rem 0', ...(full ? {} : { color: 'var(--warn)' }) }}>
      {full
        ? <>Full squad: carries home everything found.</>
        : <>Carrying {carrying} of {EXPEDITION.squadMax} ({why}): only <b>{carrying}/{EXPEDITION.squadMax}</b> of the Supply, Materials, RP and Shards found comes home; the rest is left behind. XP isn't cut.{example ? ` So ${example}.` : ''}</>}
    </p>
  );
}

/** A choice's reward as it comes home, plus what's found when the squad can't carry it all. */
function choiceGain(e: Expedition, r: Parameters<typeof carried>[1]) {
  const home = rewardText(carried(e, r));
  if (home === 'nothing') return '';
  const found = rewardText({ ...r, xp: 0 });
  return unhurt(e).length < EXPEDITION.squadMax && found !== 'nothing' ? ` · ${home} home (of ${found} found)` : ` · ${home}`;
}
