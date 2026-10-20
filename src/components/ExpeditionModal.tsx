import { useState } from 'react';
import { useStore } from '../model/store';
import { uid } from '../model/factory';
import type { Campaign, Force } from '../model/types';
import { unitName } from '../rules/battle';
import { markUnitsUsed, unitsUsed } from '../rules/nexus';
import { EXPEDITION, EXPEDITION_SITES } from '../rules/downtimeData';
import {
  applyExpedition, chooseOption, currentEncounter, expeditionSite, headHome, pressOn, rewardText, scaledReward, squadBonus, startExpedition,
  type Expedition,
} from '../rules/downtime';
import { Modal, toast } from './ui';

/** Send up to three units on a short dice-story into the Nexus. Any number a round, but each unit goes once. */
export default function ExpeditionModal({ force, c, onClose }: { force: Force; c: Campaign; onClose: () => void }) {
  const { updateForce } = useStore();
  const units = force.units.filter((u) => u.status === 'active');
  const used = unitsUsed(force, c);
  const [site, setSite] = useState(EXPEDITION_SITES[0].id);
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
    updateForce(force.id, (d) => {
      summary = applyExpedition(d, x, new Date().toISOString().slice(0, 10), uid);
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
  if (!e) {
    const s = expeditionSite(site)!;
    body = (
      <>
        <p className="muted small">
          Up to {EXPEDITION.squadMax} units head into the Nexus for {EXPEDITION.encounters} encounters. After each one, head home with the haul or press on: deeper pays more, but every failed roll raises the danger of an ambush.
          {bonus ? ' A veteran in the squad gives +1 to every roll.' : ` A unit of level ${EXPEDITION.veteranLevel}+ gives the squad +1 to its rolls.`}
        </p>
        <div className="fields">
          <label className="field span-all">
            Destination
            <select value={site} onChange={(ev) => setSite(ev.target.value)}>
              {EXPEDITION_SITES.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </label>
          <p className="span-all small" style={{ margin: 0 }}>{s.desc} <span className="muted">Make it all the way: {rewardText(s.finish.reward)}.</span></p>
          <div className="span-all small">
            <div className="muted">Squad ({squad.length}/{EXPEDITION.squadMax})</div>
            {units.length === 0 && <span className="muted">No active units.</span>}
            {used.length > 0 && <div className="muted">Each unit takes part in one skirmish, Solo patrol or Expedition a round (the main Battle doesn't count).</div>}
            {units.map((u) => (
              <label key={u.id} className="row">
                <input type="checkbox" checked={squad.includes(u.id)} disabled={used.includes(u.id) || (!squad.includes(u.id) && squad.length >= EXPEDITION.squadMax)} onChange={() => toggle(u.id)} />
                <span className="grow">{unitName(u)}</span>
                {used.includes(u.id) && <span className="tag gold">Already fought this round</span>}
              </label>
            ))}
          </div>
        </div>
      </>
    );
    footer = (
      <>
        <button onClick={onClose}>Cancel</button>
        <button className="primary" disabled={!squad.length} onClick={() => setE(startExpedition(site, squad))}>Set out</button>
      </>
    );
  } else {
    const s = expeditionSite(e.site)!;
    const enc = currentEncounter(e);
    body = (
      <>
        <div className="row small">
          <span className="grow"><b>{s.name}</b> · encounter {Math.min(e.stage + 1, e.deck.length)} of {e.deck.length} · squad: {e.squad.map(name).join(', ')}</span>
          <span>Danger <b>{e.danger}</b></span>
        </div>
        <p className="small" style={{ margin: '0.5rem 0' }}><span className="muted">Haul so far:</span> {rewardText(e.haul)}</p>
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
                  {ch.target ? `${ch.target}+${bonus ? ` (+${bonus})` : ''}` : 'no roll'}
                  {rewardText(scaledReward(ch.reward, e.stage)) !== 'nothing' ? ` · ${rewardText(scaledReward(ch.reward, e.stage))}` : ''}
                </span>
              </div>
            ))}
          </div>
        )}
        {e.phase === 'crossroads' && (
          <p className="small">
            {e.danger
              ? `Press on and roll a D6: on ${e.danger === 1 ? 'a 1' : e.danger >= 6 ? 'any roll' : `1–${e.danger}`} the squad is ambushed and a unit is scarred or Lost.`
              : 'No danger yet: pressing on is safe.'}
            {' '}Rewards deeper in are worth more.
          </p>
        )}
        {e.phase === 'done' && done && <p className="small"><b>Recorded:</b> {done}</p>}
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
