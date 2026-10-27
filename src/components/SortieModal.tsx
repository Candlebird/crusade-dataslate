import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '../model/store';
import { nowIso, uid } from '../model/factory';
import { localDate } from '../model/date';
import { FeatList } from './Feats';
import type { Campaign, Force, SortieRecap, Unit } from '../model/types';
import { echoPortrait } from '../model/emblem';
import { unitName } from '../rules/battle';
import { levelForXp } from '../rules/engine';
import { echoesBook } from '../rules/echoForce';
import { raiderPool } from '../rules/raiders';
import { applySortie, offTableKey, offTableLeft, postWeekly, weekBoard } from '../rules/downtime';
import { partyProblem, sortieProblem, sortieScout, startSortie } from '../rules/tasks';
import { SORTIE, SORTIE_BOONS, type SortieLength, type SortieMarkId, type SortieMode } from '../rules/downtimeData';
import {
  active, actingSquad, autoMove, moveMember, autoStep, bossOf, campHome, epilogueOf, leaveShop, regionName, regionOf, shopBuy, shopHeal, campRaise, campRest, canSortie, xpCap, choiceOpen, createRun, enterNode, eventChoose, eventOf, fightTitle, giveOrder, startRound, nextTurn, braceFor, omensRead, sigWeaker,
  isFort, keepsHaul, leaveCombat, leaveEvent, memberName, memberUp, nextSlots, onField, patchUp, pickBoon, quitRun, distOf, DISTANCES, reachText, reachable, runXp, skillProblem,
  skillTargets, skillsOf, slotOf, SLOTS, trinketInfo, veteranTitle, sightOf, weekKey, weekSeed, weeklyScore,
  ambushOdds, beastInfo, cursesOf, shopPrice, marksOf, markHeat, goalProgress, goalText, lastStanding, unlockedBoons,
  type SortieFx, type SortieIntentKind, type SortieModel, type SortieNode, type SortieNodeKind, type SortieRun, type SortieSkill, type SortieSkillKind, type SortieSquad,
} from '../rules/sortie';
import { SORTIE_BOSSES, SORTIE_REGIONS, type SortieSignature } from '../rules/sortieStory';
import { Modal, confirmAction, toast } from './ui';
import { EmblemBadge, Portrait } from './Emblem';
import { Glyph, Icon, IconText, SvgIcon, type IconName } from './Icon';

const NODE_ICON: Record<SortieNodeKind, IconName> = {
  fight: 'g:crossed-swords', elite: 'g:crowned-skull', camp: 'g:camping-tent', shrine: 'g:sparkles', cache: 'g:locked-chest', shop: 'g:scales', boss: 'g:warlord-helmet',
};
const NODE_NAME: Record<SortieNodeKind, string> = { fight: 'Echo pack', elite: 'Elite Echoes', camp: 'Camp', shrine: 'Encounter', cache: 'Cache', shop: 'Shop', boss: 'Echo lord' };
const INTENT: Record<SortieIntentKind, [string, string]> = {
  melee: ['⚔', 'Will fight in melee'],
  shoot: ['➶', 'Will shoot'],
  charge: ['»', 'Will charge in'],
  ability: ['✦', 'Will use an ability'],
  advance: ['↑', 'Will move up'],
  shaken: ['≈', 'Shaken: steadying itself'],
  waiting: ['…', 'Waiting in ambush'],
};
const OVER: Record<NonNullable<SortieRun['over']>, string> = {
  won: 'The Echo lord is down: the sortie is a success.',
  home: 'The party headed home from camp.',
  fell: 'The whole party was wiped out.',
  broke: 'The last of the party broke and fled.',
  quit: 'The party turned back.',
};
const AUTO_STEP = 380;
/** The pause after each squad's turn in a fight, in ms. */
const TURN_PAUSE = 600;
/** How long a blow's trail and number stay up, and the gap between blows that land together (ms). */
const BLOW_MS = 950;
const BLOW_GAP = 120;

interface Blow extends SortieFx { x1: number; y1: number; x2: number; y2: number; delay: number; stack: number }

/** Trails from striker to struck, with the wounds dealt floating over the target, for each new blow in the fight. */
function Blows({ fx, field }: { fx?: SortieFx[]; field: React.RefObject<HTMLDivElement | null> }) {
  const seen = useRef(fx?.[fx.length - 1]?.n ?? 0);
  const [shown, setShown] = useState<Blow[]>([]);
  const timers = useRef<number[]>([]);
  // Where each card stood last time: a squad the blow destroyed is already gone from the field.
  const last = useRef(new Map<string, { x: number; y: number }>());
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  useEffect(() => {
    const el = field.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    const now = new Map<string, { x: number; y: number }>();
    el.querySelectorAll<HTMLElement>('[data-sq]').forEach((x) => {
      const r = x.getBoundingClientRect();
      now.set(x.dataset.sq!, { x: r.left - box.left + r.width / 2, y: r.top - box.top + r.height / 2 });
    });
    const before = last.current;
    last.current = now;
    const mid = (key: string) => now.get(key) ?? before.get(key);
    // A new fight counts its blows from the start again.
    if ((fx?.[fx.length - 1]?.n ?? 0) < seen.current) seen.current = 0;
    const fresh = (fx ?? []).filter((f) => f.n > seen.current);
    if (!fresh.length) return;
    seen.current = fresh[fresh.length - 1].n;
    const add: Blow[] = [];
    // Numbers landing on the same squad stack up rather than overlap.
    const onto = new Map<string, number>();
    fresh.forEach((f, i) => {
      const a = mid(f.from);
      const b = mid(f.to);
      const stack = onto.get(f.to) ?? 0;
      onto.set(f.to, stack + 1);
      if (a && b) add.push({ ...f, x1: a.x, y1: a.y, x2: b.x, y2: b.y, delay: i * BLOW_GAP, stack });
    });
    if (!add.length) return;
    setShown((xs) => [...xs, ...add]);
    const done = new Set(add.map((x) => x.n));
    timers.current.push(window.setTimeout(() => setShown((xs) => xs.filter((x) => !done.has(x.n))), BLOW_MS + add[add.length - 1].delay));
  });
  if (!shown.length) return null;
  return (
    <>
      <svg className="sortie-fx" aria-hidden="true">
        {shown.map((f) => (
          <line
            key={f.n}
            x1={f.x1} y1={f.y1} x2={f.x2} y2={f.y2}
            className={`sortie-trail${f.mine ? ' mine' : ' foe'}${f.melee ? ' melee' : ''}${f.dmg ? '' : ' miss'}`}
            style={{ animationDelay: `${f.delay}ms` }}
          />
        ))}
      </svg>
      {shown.map((f) => (
        <span
          key={f.n}
          className={`sortie-dmg${f.mine ? ' mine' : ' foe'}${f.dmg ? '' : ' miss'}`}
          style={{ left: f.x2, top: f.y2 - f.stack * 22, animationDelay: `${f.delay}ms` }}
          aria-hidden="true"
        >
          {f.dmg ? `-${f.dmg}` : f.hits ? 'saved' : 'miss'}
        </span>
      ))}
    </>
  );
}
const ATTACKS: SortieSkillKind[] = ['weapon', 'atwill', 'charge'];

/** One model's wounds: pips when there are few, a bar when there are many. */
function Hp({ hp, max }: { hp: number; max: number }) {
  const left = Math.max(0, hp);
  if (max > 12) {
    return (
      <span className="sortie-bar" data-tip={`${left}/${max} wounds`}>
        <span style={{ width: `${(left / max) * 100}%` }} />
      </span>
    );
  }
  return (
    <span className="sortie-pips" data-tip={`${left}/${max} wounds`}>
      {Array.from({ length: max }, (_, i) => <i key={i} className={i < left ? 'on' : ''} />)}
    </span>
  );
}

/** A model on the field: its face, its wounds and what's on it. */
function Token({ face, m, current }: { face: React.ReactNode; m: { hp: number; max: number } & Partial<SortieModel>; current?: boolean }) {
  const down = m.hp <= 0;
  const marks = [m.shaken ? '≈' : '', m.routed ? 'fled' : ''].filter(Boolean).join(' ');
  return (
    <span className={`sortie-token${down ? ' down' : ''}${m.routed ? ' routed' : ''}${current ? ' current' : ''}`} data-tip={down ? 'Fallen' : m.routed ? 'Routed' : m.shaken ? 'Shaken' : undefined}>
      {face}
      <Hp hp={m.hp} max={m.max} />
      {marks && <span className="sortie-mark"><IconText text={marks} /></span>}
    </span>
  );
}

/** A party unit's stress: when the bar fills, it cracks for a round. */
function Stress({ v }: { v?: number }) {
  const n = Math.min(SORTIE.stress.max, v ?? 0);
  return (
    <span className={`sortie-stress${n >= SORTIE.stress.max * 0.7 ? ' high' : ''}`} data-tip={`Stress ${+n.toFixed(1)}/${SORTIE.stress.max}: when full, the unit cracks for a round`}>
      <span style={{ width: `${(n / SORTIE.stress.max) * 100}%` }} />
    </span>
  );
}

const OVER_SHORT: Record<SortieRecap['over'], string> = { won: 'Won', home: 'Went home', fell: 'Wiped out', broke: 'Broke', quit: 'Turned back' };

/** A run looked back on. */
function RecapCard({ r }: { r: SortieRecap }) {
  return (
    <div className="sortie-recap small">
      <div className="row" style={{ gap: 6 }}>
        <b className="grow">{r.region} · {r.lord}</b>
        <span className={`sortie-recap-over ${r.over}`}>{OVER_SHORT[r.over]}</span>
      </div>
      <div className="muted">
        {r.date} · {r.length} {r.mode === 'shard' ? 'Shard run' : 'free run'}{r.tier ? ` · ${SORTIE.tiers[r.tier]?.name}` : ''}{r.ascension ? ` · Ascension ${r.ascension}` : ''}{r.weekly ? ` · weekly ${r.weekly}, ${r.score} pts` : ''}
      </div>
      <div>{r.party.join(', ')}: {r.won} fight{r.won === 1 ? '' : 's'} won, {r.depth} node{r.depth === 1 ? '' : 's'} cleared.</div>
      <ul className="sortie-recap-lines">
        {r.lines.map((l, i) => <li key={i}>{l}</li>)}
      </ul>
      <div><b>Came home:</b> {r.gained}</div>
    </div>
  );
}

const statusesOf = (s: SortieSquad, round: number) => Object.entries(s.status).filter(([, r]) => (r ?? -1) >= round).map(([k]) => k);

/** The party in its starting line: the units as picked, with a Fortification holding the back. */
const lineUp = (units: Unit[]) => [...units.filter((u) => !isFort(u)), ...units.filter(isFort)];

/** Sortie: a party of three on a branching map of Echo fights, camps and shrines. */
export default function SortieModal({ force, c, onClose }: { force: Force; c?: Campaign; onClose: () => void }) {
  const { state, update, updateForce } = useStore();
  const book = echoesBook(state.books);
  const fit = force.units.filter(canSortie);
  const [picked, setPicked] = useState<string[]>(() => lineUp(fit).filter((u, i, xs) => !isFort(u) || xs.findIndex(isFort) === i).slice(0, 3).map((u) => u.id));
  const [mode, setMode] = useState<SortieMode>('free');
  const [length, setLength] = useState<SortieLength>('short');
  const [deepOn, setDeepOn] = useState(false);
  const topTier = Math.min(force.sortie?.tier ?? 0, SORTIE.tiers.length - 1);
  const [tier, setTier] = useState(topTier);
  const [weekly, setWeekly] = useState(false);
  const [recapOpen, setRecapOpen] = useState<string | null>(null);
  const topAsc = Math.min(force.sortie?.ascension ?? 0, SORTIE.ascension.curses.length);
  const [asc, setAsc] = useState(topAsc);
  const [bestiaryOpen, setBestiaryOpen] = useState(false);
  const [marks, setMarks] = useState<SortieMarkId[]>([]);
  const [boonsOpen, setBoonsOpen] = useState(false);
  const week = weekKey(localDate());
  const offKey = offTableKey(c, localDate());
  const story = (state.forces.find((f) => f.id === force.id) ?? force).sortie;
  const runRef = useRef<SortieRun | null>(null);
  const banked = useRef(false);
  const [, setTick] = useState(0);
  const [auto, setAuto] = useState(false);
  const [skill, setSkill] = useState<string | null>(null);
  const [summary, setSummary] = useState('');
  const run = runRef.current;
  const units = picked.map((id) => force.units.find((u) => u.id === id));
  const problem = mode === 'shard' ? sortieProblem(force, c, units) : partyProblem(units);
  /** Move a pick one place along the starting line; a Fortification stays at the Back. */
  const shift = (i: number, dir: -1 | 1) => setPicked((xs) => {
    const line = lineUp(xs.map((id) => force.units.find((x) => x.id === id)!).filter(Boolean));
    const j = i + dir;
    if (!line[i] || !line[j] || isFort(line[i]) || isFort(line[j])) return xs;
    [line[i], line[j]] = [line[j], line[i]];
    return line.map((u) => u.id);
  });
  const toggle = (id: string) => setPicked((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : xs.length < 3 ? [...xs, id] : xs));

  // Bank the run once it's over: XP, the haul, and what happens to a unit that fell.
  const bank = useCallback(() => {
    const r = runRef.current;
    if (!r?.over || banked.current) return;
    banked.current = true;
    let text = '';
    update((s) => {
      const f = s.forces.find((x) => x.id === force.id);
      if (!f) return;
      text = applySortie(f, r, localDate(), uid, Math.random, offTableKey(c, localDate()));
      if (r.depth > (f.sortieBest ?? 0)) f.sortieBest = r.depth;
      f.updatedAt = nowIso();
      // A won Shard run in a campaign scouts a sector on the way home.
      const cc = s.campaign;
      if (c && cc && r.mode === 'shard' && r.over === 'won') {
        const seen = sortieScout(cc, f);
        if (seen) {
          text = text ? `${text}; ${seen}` : seen;
          const entry = f.ledger[f.ledger.length - 1];
          if (entry) entry.label = text;
          cc.updatedAt = nowIso();
        }
      }
      if (c && cc && r.weekly) {
        cc.sortieBoard = postWeekly(cc.sortieBoard, f, r, localDate());
        cc.updatedAt = nowIso();
      }
    });
    setSummary(text);
    setAuto(false);
    toast(text);
  }, [force.id, c, update]);

  const after = useCallback(() => {
    setTick((n) => n + 1);
    if (runRef.current?.over) bank();
  }, [bank]);

  /** Run a step of the game, showing why it can't be done if it can't. */
  const doit = (fn: () => void) => {
    try {
      fn();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
    setSkill(null);
    after();
  };

  // After each squad's turn the fight waits a moment, so each move can be seen before the next one comes.
  const pausing = run?.screen === 'combat' && run.combat?.need === 'next' && !run.combat.over;
  const turnsLeft = run?.combat?.queue.length;
  useEffect(() => {
    if (!pausing || auto) return;
    const t = window.setTimeout(() => {
      const r = runRef.current;
      if (r?.combat?.need === 'next') doit(() => nextTurn(r));
    }, TURN_PAUSE);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pausing, auto, turnsLeft]);

  // Auto: the run plays itself, a step at a time so it can be watched.
  useEffect(() => {
    if (!auto || !run || run.over || !book) return;
    const t = window.setInterval(() => {
      const r = runRef.current;
      if (!r || r.over) return;
      try {
        autoStep(r, book);
      } catch (e) {
        toast((e as Error).message, 'error');
        setAuto(false);
      }
      after();
    }, AUTO_STEP);
    return () => window.clearInterval(t);
  }, [auto, run, book, after]);

  const begin = () => {
    if (!book) return;
    if (problem) return toast(problem, 'error');
    if (mode === 'shard') updateForce(force.id, (f) => startSortie(f, c, picked));
    // The weekly challenge: the same seed, length and difficulty for every force, with no grudges or deep regions.
    runRef.current = weekly
      ? createRun(lineUp(units as Unit[]), weekSeed(week), mode, SORTIE.weekly.length, { tier: SORTIE.weekly.tier, weekly: week })
      : createRun(lineUp(units as Unit[]), Math.floor(Math.random() * 2 ** 31), mode, length, {
        nemesis: force.sortie?.nemesis,
        bled: force.sortie?.bled,
        slain: Object.fromEntries(Object.entries(force.sortie?.bestiary ?? {}).filter(([k]) => k.startsWith('lord:')).map(([k, b]) => [k.slice(5), b.slain])),
        boons: unlockedBoons(force.sortie),
        deep: deepOn ? force.sortie?.deep : undefined,
        tier,
        ascension: tier === SORTIE.tiers.length - 1 ? asc : 0,
        marks: (story?.stats?.wins ?? 0) > 0 ? marks : [],
        raiders: raiderPool(state.books, state.forces, force),
      });
    setRecapOpen(null);
    banked.current = false;
    setSummary('');
    after();
  };

  const close = () => {
    const r = runRef.current;
    if (r && !r.over) {
      const lose = r.mode === 'shard' ? ' The haul is left behind.' : '';
      if (!confirmAction(`Turn back now? The party keeps the XP earned so far.${lose}`)) return;
      quitRun(r);
      bank();
    }
    onClose();
  };

  if (!book) {
    return (
      <Modal title="Sortie" onClose={onClose} footer={<button onClick={onClose}>Close</button>}>
        <p className="small" style={{ marginTop: 0 }}>A Sortie needs the Void Echoes army book. Import <b>Void Echoes</b> on the Books page first.</p>
      </Modal>
    );
  }

  if (!run) {
    const pay = SORTIE.tiers[tier]?.pay ?? 1;
    const caps = { short: Math.floor(SORTIE.caps[mode].short * pay + 1e-9), long: Math.floor(SORTIE.caps[mode].long * pay + 1e-9) };
    return (
      <Modal
        title="Sortie"
        onClose={onClose}
        footer={<><button onClick={onClose}>Cancel</button><button className="primary" disabled={!!problem} onClick={begin}>Set out</button></>}
      >
        <p className="small" style={{ marginTop: 0 }}>
          A party of 3 crosses a branching map of Echo fights, camps, shrines and caches to an Echo lord. The party stands Front, Middle and Back,
          and shifts every round: Middle to Front, Front to Back, Back to Middle. A Fortification always holds the Back. Echo squads stand Close, Mid
          or Far, and each slot behind the Front adds 1 step of distance. Blades and Charges work only from the Front. Guns reach as far as their range allows.
          Every attack, yours and the Echoes', rolls to hit twice and keeps the better. Wounds carry over between fights.
        </p>
        <div className="small" style={{ marginBottom: 4 }}><b>Party</b> <span className="muted">({picked.length}/3)</span></div>
        {fit.length < 3 && <p className="muted small">A Sortie needs 3 active units.</p>}
        <div className="sortie-pick">
          {fit.map((u) => {
            const at = lineUp(picked.map((id) => force.units.find((x) => x.id === id)!).filter(Boolean)).findIndex((x) => x.id === u.id);
            const on = picked.includes(u.id);
            return (
              <label key={u.id} className="row small" style={{ gap: 6 }}>
                <input type="checkbox" checked={on} disabled={!on && picked.length >= 3} onChange={() => toggle(u.id)} />
                <Portrait unit={u} size={22} />
                <span className="grow">{unitName(u)}{veteranTitle(u) && <span className="sortie-title"> · {veteranTitle(u)}</span>} <span className="muted">· {u.category} · level {levelForXp(u.xp)} · {u.points} pts{mode === 'free' ? ` · ${offTableLeft(u, offKey)} off-table XP left` : ''}</span></span>
                {at >= 0 && <span className="sortie-slot-tag">{SLOTS[at]}</span>}
              </label>
            );
          })}
        </div>
        {picked.length > 0 && (
          <LineOrder
            units={lineUp(picked.map((id) => force.units.find((x) => x.id === id)!).filter(Boolean))}
            onMove={shift}
          />
        )}
        <div className="sortie-choice">
          <div className="small"><b>Kind of run</b></div>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            <button className={mode === 'free' ? 'primary' : ''} onClick={() => setMode('free')}>Free</button>
            <button className={mode === 'shard' ? 'primary' : ''} onClick={() => setMode('shard')}>Shard run ({SORTIE.cost} Umbra Shards)</button>
          </div>
          <p className="muted small" style={{ margin: '4px 0 0' }}>
            {mode === 'free'
              ? 'Any time, as often as you like. XP only: units aren’t busy and suffer nothing if they fall.'
              : <>Costs {SORTIE.cost} Umbra Shards (you have {force.umbraShards}){c ? ' and uses all 3 units’ task for the round' : ''}. Beat the boss or head home from a camp to bring home Supply, RP and up to {SORTIE.haul.maxUs} Umbra Shards. Each unit wiped out takes a scar or is left Comatose.</>}
          </p>
          {problem && picked.length > 0 && <p className="small" style={{ color: 'var(--warn)', margin: '4px 0 0' }}>{problem}</p>}
          <div className="small" style={{ marginTop: 8 }}><b>Road</b></div>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            <button className={!weekly ? 'primary' : ''} onClick={() => setWeekly(false)}>Your own</button>
            <button className={weekly ? 'primary' : ''} onClick={() => setWeekly(true)}>Weekly challenge ({week})</button>
          </div>
          {weekly ? (
            <>
              <p className="muted small" style={{ margin: '4px 0 0' }}>
                Same region, Echo lord and map for every force this week: a long run at {SORTIE.tiers[SORTIE.weekly.tier].name}, no grudges or deep regions.
                Score: {SORTIE.weekly.depth} per node, {SORTIE.weekly.won} per fight won, {SORTIE.weekly.boss} for the lord, {SORTIE.weekly.alive} per unit standing.
              </p>
              <WeekBoard c={c} week={week} forceId={force.id} recaps={story?.recaps} />
            </>
          ) : <>
          <div className="small" style={{ marginTop: 8 }}><b>Length</b></div>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            <button className={length === 'short' ? 'primary' : ''} onClick={() => setLength('short')}>Short: {SORTIE.rows.short} rows, up to {caps.short} XP</button>
            <button className={length === 'long' ? 'primary' : ''} onClick={() => setLength('long')}>Long: {SORTIE.rows.long} rows, up to {caps.long} XP</button>
          </div>
          {force.sortie?.deep?.length ? (
            <>
              <div className="small" style={{ marginTop: 8 }}><b>Where</b></div>
              <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                <button className={!deepOn ? 'primary' : ''} onClick={() => setDeepOn(false)}>Anywhere</button>
                <button className={deepOn ? 'primary' : ''} onClick={() => setDeepOn(true)}>Deep: {SORTIE_REGIONS.filter((r) => force.sortie?.deep?.includes(r.id)).map((r) => r.deep.name).join(' or ')}</button>
              </div>
              <p className="muted small" style={{ margin: '4px 0 0' }}>
                Deep regions have {Math.round((SORTIE.deep.budget - 1) * 100)}% bigger fights and {Math.round((SORTIE.deep.haul - 1) * 100)}% more loot.
              </p>
            </>
          ) : null}
          {topTier > 0 && (
            <>
              <div className="small" style={{ marginTop: 8 }}><b>Difficulty</b></div>
              <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                {SORTIE.tiers.slice(0, topTier + 1).map((t, i) => (
                  <button key={t.name} className={tier === i ? 'primary' : ''} data-tip={t.text} onClick={() => setTier(i)}>{t.name}{i ? ` ×${t.pay}` : ''}</button>
                ))}
              </div>
              <p className="muted small" style={{ margin: '4px 0 0' }}>
                {tier ? `${SORTIE.tiers.slice(1, tier + 1).map((t) => t.text).join(' ')} XP, its cap and the haul ×${SORTIE.tiers[tier].pay}.` : 'No twists.'}
                {tier === topTier && topTier < SORTIE.tiers.length - 1 ? ` Win at ${SORTIE.tiers[topTier].name} to unlock ${SORTIE.tiers[topTier + 1].name}.` : ''}
                {tier === SORTIE.tiers.length - 1 && !topAsc ? ` Win here to unlock Ascension 1 and its first curse.` : ''}
              </p>
              {tier === SORTIE.tiers.length - 1 && topAsc > 0 && (
                <>
                  <div className="small" style={{ marginTop: 8 }}><b>Ascension</b></div>
                  <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
                    {Array.from({ length: topAsc + 1 }, (_, i) => (
                      <button key={i} className={asc === i ? 'primary' : ''} data-tip={i ? SORTIE.ascension.curses[i - 1].text : 'No curses'} onClick={() => setAsc(i)}>
                        {i || 'Off'}
                      </button>
                    ))}
                  </div>
                  <p className="muted small" style={{ margin: '4px 0 0' }}>
                    {asc ? (
                      <>
                        {SORTIE.ascension.curses.slice(0, asc).map((x) => (
                          <span key={x.id} className="sortie-cursed" data-tip={x.text}>{x.name}{' '}</span>
                        ))}
                        — {SORTIE.ascension.curses.slice(0, asc).map((x) => x.text).join(' ')} Pays ×{(SORTIE.tiers[tier].pay + asc * SORTIE.ascension.pay).toFixed(1)}.
                      </>
                    ) : 'No curses.'}
                    {asc === topAsc && topAsc < SORTIE.ascension.curses.length ? ` Win at Ascension ${topAsc} to unlock ${topAsc + 1}.` : ''}
                  </p>
                </>
              )}
            </>
          )}
          {Object.keys(force.sortie?.nemesis ?? {}).length ? (
            <p className="small" style={{ margin: '6px 0 0' }}>
              <b>Nemeses:</b>{' '}
              {SORTIE_BOSSES.filter((b) => force.sortie?.nemesis?.[b.id]).map((b) => `${b.name} (${force.sortie!.nemesis![b.id]})`).join(', ')}
              <span className="muted"> — each shows up half the time, tougher per grudge, with a {SORTIE.nemesis.bounty} RP bounty per grudge.</span>
            </p>
          ) : null}
          </>}
          {force.sortieBest ? <p className="muted small" style={{ margin: '6px 0 0' }}>Furthest so far: {force.sortieBest} nodes.</p> : null}
          {topTier === 0 && <p className="muted small" style={{ margin: '6px 0 0' }}>Win a run to unlock {SORTIE.tiers[1].name}: harder runs that pay more.</p>}
          {c && mode === 'shard' && <p className="muted small" style={{ margin: '6px 0 0' }}>A won Shard run scouts the nearest unseen sector on the way home.</p>}
          {story?.trinkets?.length ? (
            <p className="small" style={{ margin: '6px 0 0' }}>
              <b>Spare trinkets:</b> {story.trinkets.map((t) => trinketInfo(t)?.name ?? t).join(', ')}
              <span className="muted"> — equip them from a unit’s sheet. Sorties only.</span>
            </p>
          ) : null}
        </div>
        {story?.recaps?.length ? (
          <div className="sortie-choice">
            <div className="small"><b>Past runs</b></div>
            {story.recaps.map((r) => (
              <div key={r.id}>
                <button className="ghost small sortie-recap-row" onClick={() => setRecapOpen(recapOpen === r.id ? null : r.id)}>
                  {r.date} · {r.region} · {OVER_SHORT[r.over]} · {r.depth} nodes{r.weekly ? ` · weekly ${r.score} pts` : ''}
                </button>
                {recapOpen === r.id && <RecapCard r={r} />}
              </div>
            ))}
          </div>
        ) : null}
        {!weekly && (story?.stats?.wins ?? 0) > 0 && (
          <div className="sortie-choice">
            <div className="small"><b>Pact marks</b> <span className="muted">· optional hardships, +{Math.round(SORTIE.marks.pay * 100)}% XP and haul per heat</span></div>
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              {SORTIE.marks.list.map((m) => {
                const on = marks.includes(m.id);
                return (
                  <button key={m.id} className={`small${on ? ' primary' : ''}`} data-tip={m.text} aria-pressed={on}
                    onClick={() => setMarks(on ? marks.filter((x) => x !== m.id) : [...marks, m.id])}>
                    {m.name} <span className="muted">· {m.heat}</span>
                  </button>
                );
              })}
            </div>
            {marks.length > 0 && (() => {
              const heat = SORTIE.marks.list.filter((m) => marks.includes(m.id)).reduce((n, m) => n + m.heat, 0);
              return (
                <p className="muted small" style={{ margin: '4px 0 0' }}>
                  {heat} heat, +{Math.round(heat * SORTIE.marks.pay * 100)}% pay. {SORTIE.marks.list.filter((m) => marks.includes(m.id)).map((m) => m.text).join(' ')}
                </p>
              );
            })()}
          </div>
        )}
        <div className="sortie-choice">
          <button className="ghost small sortie-recap-row" onClick={() => setBoonsOpen(!boonsOpen)}>
            <b>Boons</b>{' '}
            <span className="muted">· {unlockedBoons(story).filter((id) => !SORTIE_BOONS[id].curse).length} of {Object.values(SORTIE_BOONS).filter((b) => !b.curse).length} unlocked <Icon name={boonsOpen ? 'l:chevron-up' : 'l:chevron-down'} /></span>
          </button>
          {boonsOpen && (
            <div className="sortie-bestiary">
              <p className="muted small" style={{ margin: 0 }}>Runs offer only this force's unlocked boons. Reach a boon's goal to unlock it. The weekly challenge offers all of them.</p>
              {(Object.keys(SORTIE.unlocks) as (keyof typeof SORTIE_BOONS)[]).filter((id) => SORTIE_BOONS[id]).map((id) => {
                const u = SORTIE.unlocks[id];
                const have = goalProgress(story, u.goal);
                const open = have >= u.n;
                return (
                  <div key={id} className={`sortie-beast${open ? ' lord' : ''}`}>
                    <div>
                      <b>{SORTIE_BOONS[id].name}</b>{SORTIE_BOONS[id].rare && <span className="sortie-rare"> · Rare</span>}
                      <span className="muted small"> · {open ? 'unlocked' : `${goalText(u.goal, u.n)} (${Math.min(have, u.n)}/${u.n})`}</span>
                    </div>
                    <div className="small">{open ? SORTIE_BOONS[id].text : <span className="muted">{SORTIE_BOONS[id].text}</span>}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <FeatList force={force} where="sortie" />
        {story?.bestiary && Object.keys(story.bestiary).length ? (
          <div className="sortie-choice">
            <button className="ghost small sortie-recap-row" onClick={() => setBestiaryOpen(!bestiaryOpen)}>
              <b>Bestiary</b> <span className="muted">· {Object.keys(story.bestiary).length} met · {Object.values(story.bestiary).filter((b) => b.slain || b.drill).length} lore learned <Icon name={bestiaryOpen ? 'l:chevron-up' : 'l:chevron-down'} /></span>
            </button>
            {bestiaryOpen && (
              <div className="sortie-bestiary">
                {Object.entries(story.bestiary)
                  .map(([k, b]) => ({ k, b, info: beastInfo(k) }))
                  .sort((x, y) => Number(y.info.lord) - Number(x.info.lord) || x.info.name.localeCompare(y.info.name))
                  .map(({ k, b, info }) => (
                    <div key={k} className={`sortie-beast${info.lord ? ' lord' : ''}`}>
                      <div>
                        <b>{info.name}</b>{info.lord && <span className="muted small"> · Echo lord, {info.unit}</span>}
                        <span className="muted small"> · met in {b.met} fight{b.met === 1 ? '' : 's'} · {b.slain} slain{b.drill ? ` · ${b.drill} slain in Training` : ''}{b.mark ? ` · best pact heat ${b.mark}` : ''}{story.bled?.[k.slice(5)] && info.lord ? ' · wounded, waiting' : ''}</span>
                      </div>
                      <div className="small">{b.slain || b.drill ? <i>{info.lore}</i> : <span className="muted">Slay one to learn more.</span>}</div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        ) : null}
      </Modal>
    );
  }

  const cap = xpCap(run);
  const title = `Sortie${run.mode === 'shard' ? ' (Shard run)' : ''}`;

  return (
    <Modal
      title={title}
      wide
      onClose={close}
      footer={
        <>
          <label className="row small" style={{ gap: 4, marginRight: 'auto' }} data-tip="The party plays itself: path, orders, boons and shrine choices.">
            <input type="checkbox" checked={auto} disabled={!!run.over} onChange={(e) => setAuto(e.target.checked)} /> Auto
          </label>
          {!run.over && <button onClick={close}>Turn back</button>}
          {run.over && <button className="primary" onClick={onClose}>Done</button>}
        </>
      }
    >
      <div className="sortie">
        <div className="sortie-main">
          {run.screen === 'map' && (
            <>
              <MapScreen run={run} onEnter={(n) => doit(() => enterNode(run, book, n))} />
              <div className="sortie-panel">
                <h3>Formation</h3>
                <p className="muted small" style={{ marginTop: 0 }}>The party's starting line for the next fight. You can only change it here, between fights.</p>
                <LineOrder units={run.party.map((m) => m.unit)} down={run.party.map((m) => !memberUp(m))} onMove={(i, dir) => doit(() => moveMember(run, i, dir))} />
              </div>
            </>
          )}
          {run.screen === 'combat' && run.combat && (
            <CombatScreen
              run={run}
              skill={skill}
              setSkill={setSkill}
              onUse={(id, target) => doit(() => giveOrder(run, id, target))}
              onAuto={() => doit(() => autoMove(run))}
              onStart={() => doit(() => startRound(run))}
              onBrace={(id) => doit(() => braceFor(run, id))}
              onLeave={() => doit(() => leaveCombat(run))}
            />
          )}
          {run.screen === 'reward' && run.offer && (
            <div className="sortie-panel">
              <h3>Spoils</h3>
              {run.scene && <p className="small sortie-scene">{run.scene}</p>}
              <p className="muted small">Take a boon for the rest of the run{run.offer.patch ? ', or patch the party up instead' : ''}.</p>
              <div className="sortie-boons">
                {run.offer.boons.map((id, i) => (
                  <button key={id} className={`sortie-boon${SORTIE_BOONS[id].rare ? ' rare' : ''}`} onClick={() => doit(() => pickBoon(run, i))}>
                    <b>{SORTIE_BOONS[id].name}{SORTIE_BOONS[id].rare && <span className="sortie-rare"> · Rare</span>}</b>
                    <span className="small">{SORTIE_BOONS[id].text}</span>
                  </button>
                ))}
                {run.offer.patch && (
                  <button className="sortie-boon heal" onClick={() => doit(() => patchUp(run))}>
                    <b>Patch up</b>
                    <span className="small">Every model mends {Math.round(SORTIE.patch * 100)}% of its wounds, and 1 fallen model gets back up.</span>
                  </button>
                )}
              </div>
              <button className="ghost" onClick={() => doit(() => pickBoon(run, null))}>Take nothing</button>
            </div>
          )}
          {run.screen === 'event' && <EventScreen run={run} onChoose={(i) => doit(() => eventChoose(run, i))} onLeave={() => doit(() => leaveEvent(run, book))} />}
          {run.screen === 'camp' && (
            <div className="sortie-panel">
              <h3><Icon name="g:camping-tent" /> Camp</h3>
              {run.scene && <p className="small sortie-scene">{run.scene}</p>}
              <p className="small">Rest here, or call it a day and head home{run.mode === 'shard' ? ' with the haul' : ''}.</p>
              <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                <button className="primary" onClick={() => doit(() => campRest(run))}>Rest: mend {Math.round(SORTIE.rest * 100)}% and raise {campRaise(run) === 1 ? '1 fallen' : `up to ${campRaise(run)} fallen`}</button>
                <button onClick={() => doit(() => campHome(run))}>Head home</button>
              </div>
            </div>
          )}
          {run.screen === 'shop' && run.shop && (
            <div className="sortie-panel">
              <h3><Icon name="g:scales" /> Shop</h3>
              {run.scene && <p className="small sortie-scene">{run.scene}</p>}
              <p className="muted small">
                Spend the run’s Supply: you have <b>{run.haul.supply}</b>.{run.mode === 'shard' ? ' Supply spent here doesn’t come home.' : ''}
              </p>
              <div className="sortie-boons">
                {run.shop.boons.map((b, i) => (
                  <button key={b.id} className={`sortie-boon${SORTIE_BOONS[b.id].rare ? ' rare' : ''}`} disabled={b.sold || run.haul.supply < b.price} onClick={() => doit(() => shopBuy(run, i))}>
                    <b>{SORTIE_BOONS[b.id].name}{SORTIE_BOONS[b.id].rare && <span className="sortie-rare"> · Rare</span>} <span className="sortie-price">{b.sold ? 'Sold' : `${b.price} Supply`}</span></b>
                    <span className="small">{SORTIE_BOONS[b.id].text}</span>
                  </button>
                ))}
                <button className="sortie-boon heal" disabled={run.shop.healed || run.haul.supply < shopPrice(run, SORTIE.shop.heal)} onClick={() => doit(() => shopHeal(run))}>
                  <b>Field dressings <span className="sortie-price">{run.shop.healed ? 'Sold' : `${shopPrice(run, SORTIE.shop.heal)} Supply`}</span></b>
                  <span className="small">Every model mends {Math.round(SORTIE.shop.healShare * 100)}% of its wounds.</span>
                </button>
              </div>
              <button className="primary" onClick={() => doit(() => leaveShop(run))}>Move on</button>
            </div>
          )}
          {run.screen === 'over' && run.over && (
            <div className="sortie-panel">
              <h3>{run.over === 'won' ? 'Victory' : run.over === 'home' ? 'Home again' : 'The sortie is over'}</h3>
              <p>{run.over === 'won' ? `${bossOf(run).name} is down: the sortie is a success.` : OVER[run.over]}</p>
              <p className="small sortie-scene">{epilogueOf(run)}</p>
              <p className="small">
                {run.won} fight{run.won === 1 ? '' : 's'} won, {run.depth} node{run.depth === 1 ? '' : 's'} cleared. <b>+{runXp(run)} XP</b> per unit (cap {cap}){run.party.some((m) => !memberUp(m)) && <>, half for a unit wiped out</>}.
                {run.mode === 'shard' && (keepsHaul(run) ? ` The haul comes home: ${haulText(run)}.` : ' The haul was lost.')}
              </p>
              {summary && <p className="muted small">{summary}</p>}
              {run.weekly && <p className="small">Weekly challenge {run.weekly}: <b>{weeklyScore(run)} pts</b>{c ? ' (posted to the campaign board)' : ''}.</p>}
              {story?.recaps?.[0] && (
                <>
                  <button onClick={() => setRecapOpen(recapOpen ? null : story.recaps![0].id)}>{recapOpen ? 'Hide recap' : 'Run recap'}</button>
                  {recapOpen && <RecapCard r={story.recaps[0]} />}
                </>
              )}
              {run.weekly && c && <WeekBoard c={c} week={run.weekly} forceId={force.id} />}
            </div>
          )}
        </div>
        <Side run={run} cap={cap} />
      </div>
    </Modal>
  );
}

/** This week's challenge board: the campaign's, or out of a campaign just the force's own best. */
function WeekBoard({ c, week, forceId, recaps }: { c?: Campaign; week: string; forceId: string; recaps?: SortieRecap[] }) {
  if (!c) {
    const best = Math.max(0, ...(recaps ?? []).filter((r) => r.weekly === week).map((r) => r.score ?? 0));
    return best ? <p className="small" style={{ margin: '4px 0 0' }}>Your best this week: <b>{best} pts</b>.</p> : null;
  }
  const rows = weekBoard(c.sortieBoard, week);
  return (
    <div className="sortie-board small">
      <div className="muted">Board for {week}</div>
      {!rows.length && <div className="muted">No runs yet this week. Be the first.</div>}
      {rows.map((e, i) => (
        <div key={e.forceId} className={`row${e.forceId === forceId ? ' mine' : ''}`} style={{ gap: 6 }}>
          <span className="sortie-board-rank">{i + 1}</span>
          <span className="grow">{e.force} <span className="muted">({e.player})</span></span>
          <span className="muted">{OVER_SHORT[e.over]}, {e.depth} nodes</span>
          <b>{e.score}</b>
        </div>
      ))}
    </div>
  );
}

const haulText = (run: SortieRun) => [`${run.haul.supply} Supply`, run.haul.rp ? `${run.haul.rp} RP` : '', run.haul.us ? `${run.haul.us} Umbra Shard${run.haul.us === 1 ? '' : 's'}` : ''].filter(Boolean).join(', ');

/** The party, its wounds, boons and the run so far; in a fight, just the boons it carries. */
function Side({ run, cap }: { run: SortieRun; cap: number }) {
  if (run.screen === 'combat') {
    return (
      <div className="sortie-side small">
        <div className="sortie-side-head">Boons this run</div>
        {!run.boons.length && <p className="muted" style={{ margin: 0 }}>None yet. Win a fight to pick one.</p>}
        {run.boons.map((b) => (
          <div key={b} className="sortie-side-boon">
            <b className={SORTIE_BOONS[b].curse ? 'sortie-cursed' : undefined}>{SORTIE_BOONS[b].name}{SORTIE_BOONS[b].curse ? ' (cursed)' : SORTIE_BOONS[b].rare ? ' (rare)' : ''}</b>
            <span className="muted">{SORTIE_BOONS[b].text}</span>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="sortie-side small">
      <div className="muted">{run.length === 'long' ? 'Long' : 'Short'} {run.mode === 'shard' ? 'Shard run' : 'free run'} · {regionName(run)}</div>
      {run.party.map((m) => (
        <div key={m.unit.id} className={`sortie-member${memberUp(m) ? '' : ' down'}`}>
          <div className="row" style={{ gap: 6 }}>
            <Portrait unit={m.unit} size={28} />
            <b className="grow">{memberName(m)}</b>
            {!memberUp(m) && <span className="muted">down</span>}
          </div>
          <div className="sortie-models">
            {m.models.map((x, i) => <Token key={i} face={null} m={x} />)}
          </div>
          <div className="row" style={{ gap: 6 }}>
            <span className="muted">Stress</span> <Stress v={m.stress} />
            {m.unit.trinket && trinketInfo(m.unit.trinket) && <span className="muted" data-tip={trinketInfo(m.unit.trinket)!.text}>· {trinketInfo(m.unit.trinket)!.name}</span>}
          </div>
          {m.scars?.length ? (
            <div className="row small" style={{ gap: 4, flexWrap: 'wrap' }}>
              {m.scars.map((id) => <span key={id} className="sortie-scar" data-tip={SORTIE.scars[id].text}>{SORTIE.scars[id].name}</span>)}
            </div>
          ) : null}
        </div>
      ))}
      <div>XP <b>{runXp(run)}</b> / {cap} <span className="muted">({+run.xp.toFixed(2)} earned)</span></div>
      {run.mode === 'shard' ? <div>Haul: {haulText(run)}</div> : <div>Supply: {run.haul.supply} <span className="muted">(for shops)</span></div>}
      <div>Nodes cleared: {run.depth}</div>
      {!run.marks?.length ? null : <div data-tip={marksOf(run).map((m) => m.text).join(' ')}>Pact marks: {marksOf(run).map((m) => m.name.replace(/^Mark of (the )?/, '')).join(', ')} <span className="muted">({markHeat(run)} heat)</span></div>}
      {run.omens || run.map.flat().some((n) => n.omen) ? (
        <div data-tip="Each omen weakens the lord's own signature. Read them closely: before its fight you brace for one signature, and the right one is weaker again.">
          Omens read: <b>{omensRead(run)}</b> / {SORTIE.omens.need}{sigWeaker(run, bossOf(run).sig.id) ? <span className="muted"> · signature {sigWeaker(run, bossOf(run).sig.id)}% weaker</span> : null}
        </div>
      ) : null}
      {run.weekly && <div>Weekly score: <b>{weeklyScore(run)}</b></div>}
      {run.trinkets?.length ? <div>Trinkets found: {run.trinkets.map((t) => trinketInfo(t)?.name ?? t).join(', ')}</div> : null}
      {run.boons.length > 0 && (
        <div>
          <div className="muted">Boons</div>
          {run.boons.map((b) => <div key={b} data-tip={SORTIE_BOONS[b].text}>• {SORTIE_BOONS[b].name}</div>)}
        </div>
      )}
      <div className="sortie-journal">
        {[...run.journal].reverse().slice(0, 8).map((l, i) => <div key={i} className={`tone-${l.tone}`}>{l.text}</div>)}
      </div>
    </div>
  );
}

/** The branching map, from the start at the bottom to the Echo lord at the top. */
/** The party's starting line, Front to Back, with arrows to reorder it. */
function LineOrder({ units, down, onMove }: { units: Unit[]; down?: boolean[]; onMove: (i: number, dir: -1 | 1) => void }) {
  return (
    <div className="sortie-line">
      {units.map((u, i) => (
        <div key={u.id} className={`row small sortie-line-row${down?.[i] ? ' down' : ''}`} style={{ gap: 6 }}>
          <span className="sortie-slot-tag">{SLOTS[i]}</span>
          <Portrait unit={u} size={22} />
          <span className="grow">{unitName(u)}{isFort(u) && <span className="muted"> · holds the Back</span>}{down?.[i] && <span className="muted"> · down</span>}</span>
          <button className="ghost" aria-label={`Move ${unitName(u)} forward`} disabled={i === 0 || isFort(u) || isFort(units[i - 1])} onClick={() => onMove(i, -1)}><Icon name="l:chevron-up" /></button>
          <button className="ghost" aria-label={`Move ${unitName(u)} back`} disabled={i === units.length - 1 || isFort(u) || isFort(units[i + 1])} onClick={() => onMove(i, 1)}><Icon name="l:chevron-down" /></button>
        </div>
      ))}
    </div>
  );
}

function MapScreen({ run, onEnter }: { run: SortieRun; onEnter: (n: SortieNode) => void }) {
  const next = reachable(run);
  const W = 300;
  const ROW = 58;
  const H = run.map.length * ROW + 20;
  const pos = (n: SortieNode) => {
    const width = run.map[n.row].length;
    return { x: ((n.col + 0.5) / width) * W, y: H - 10 - (n.row + 0.5) * ROW };
  };
  return (
    <div className="sortie-panel">
      <h3>{regionName(run)}</h3>
      {run.row < 0 && <p className="small sortie-scene">{run.deep ? regionOf(run).deep.intro : regionOf(run).intro}</p>}
      <p className="muted small" style={{ marginTop: 0 }}>
        {run.row < 0 ? 'Pick where to start.' : 'Pick the next step.'} {bossOf(run).name} waits at the top.
        {run.map.some((row) => row.some((n) => n.hidden)) && ` ? is unseen ground. The party sees ${sightOf(run)} step${sightOf(run) === 1 ? '' : 's'} ahead.`}
        {run.map.some((row) => row.some((n) => n.veiled && n.row > run.row && (n.kind === 'fight' || n.kind === 'elite'))) && (
          ambushOdds(run) > 0
            ? ` Fights on ground that started hidden have a ${Math.round(ambushOdds(run) * 100)}% ambush chance. A scout or the lantern prevents it.`
            : ' A scout or the lantern prevents ambushes.'
        )}
        {cursesOf(run).length ? <span className="sortie-cursed"> Ascension {run.ascension}: {cursesOf(run).map((x) => x.name).join(', ')}.</span> : null}
      </p>
      <svg className="sortie-map" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Sortie map">
        {run.map.flatMap((row) => row.flatMap((n) => n.next.map((col) => {
          const to = run.map[n.row + 1]?.[col];
          if (!to) return null;
          const a = pos(n);
          const b = pos(to);
          const lit = n.row === run.row && n.col === run.col;
          return <line key={`${n.row}.${n.col}-${col}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={lit ? 'lit' : ''} />;
        })))}
        {run.map.flat().map((n) => {
          const p = pos(n);
          const open = next.includes(n);
          const here = n.row === run.row && n.col === run.col;
          const past = n.row <= run.row && !here;
          const tip = n.hidden ? 'Unknown: get closer to see it' : n.kind === 'boss' ? `${bossOf(run).name} (${bossOf(run).unit})` : n.affix ? `${NODE_NAME[n.kind]}: ${SORTIE.affixes[n.affix].name}` : NODE_NAME[n.kind];
          return (
            <g
              key={`${n.row}.${n.col}`}
              className={`sortie-node ${n.hidden ? 'hidden' : n.kind}${open ? ' open' : ''}${here ? ' here' : ''}${past ? ' past' : ''}`}
              transform={`translate(${p.x} ${p.y})`}
              onClick={open ? () => onEnter(n) : undefined}
              role={open ? 'button' : undefined}
              tabIndex={open ? 0 : undefined}
              onKeyDown={open ? (e) => (e.key === 'Enter' || e.key === ' ') && onEnter(n) : undefined}
              data-tip={tip}
              aria-label={tip}
            >
              <circle r={n.kind === 'boss' ? 21 : 16} />
              {n.hidden ? <text textAnchor="middle" dominantBaseline="central">?</text> : <SvgIcon name={NODE_ICON[n.kind]} x={0} y={0} size={n.kind === 'boss' ? 24 : 18} className="sortie-node-icon" />}
              {n.omen && !n.hidden && (
                <g className="sortie-omen" transform="translate(13 -13)" data-tip="An omen of the lord">
                  <circle r={6} />
                  <SvgIcon name="g:diamonds" x={0} y={0} size={8} />
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function EventScreen({ run, onChoose, onLeave }: { run: SortieRun; onChoose: (i: number) => void; onLeave: () => void }) {
  const ev = eventOf(run);
  if (!ev) return null;
  const done = run.event?.result !== undefined;
  return (
    <div className="sortie-panel">
      <h3><Icon name="g:sparkles" /> {ev.name}</h3>
      <p className="small">{ev.text}</p>
      {run.scene && <p className="small sortie-scene">{run.scene}</p>}
      {!done && (
        <div className="sortie-choices">
          {ev.choices.map((ch, i) => {
            const open = choiceOpen(run, ch);
            return (
              <button key={i} disabled={!open} onClick={() => onChoose(i)} data-tip={open ? undefined : `Needs ${ch.needs!.join(' or ')}`}>
                {ch.label}
                {ch.chance !== undefined && <span className="muted"> ({Math.round(ch.chance * 100)}%)</span>}
                {ch.needs && <span className="muted"> [{ch.needs.join(' / ')}]</span>}
              </button>
            );
          })}
        </div>
      )}
      {done && (
        <>
          <p><b>{run.event!.result}</b></p>
          <button className="primary" onClick={onLeave}>{run.event!.then === 'fight' ? 'To arms!' : 'Move on'}</button>
        </>
      )}
    </div>
  );
}

/** The fight: the party's line on the left, the Echo squads by distance on the right, the skills below. */
function CombatScreen({ run, skill, setSkill, onUse, onAuto, onStart, onBrace, onLeave }: {
  run: SortieRun;
  skill: string | null;
  setSkill: (s: string | null) => void;
  onUse: (id: string, target?: string) => void;
  onAuto: () => void;
  onStart: () => void;
  onBrace: (id: SortieSignature) => void;
  onLeave: () => void;
}) {
  const c = run.combat!;
  const fieldRef = useRef<HTMLDivElement>(null);
  const me = actingSquad(run);
  // Auto only helps a squad whose models carry different weapons; elsewhere it's for testing.
  const mixed = !!me && new Set(active(me).map((m) => m.guns.map((g) => g.name).sort().join('|'))).size > 1;
  const skills = skillsOf(run);
  const chosen = skills.find((s) => s.id === skill);
  const targets = chosen ? skillTargets(run, chosen) : [];
  const field = onField(c);
  const waiting = c.enemies.filter((e) => e.arrives && active(e).length);
  // Marauders wear their own emblems: one out of another force is known on sight.
  const echoFace = (e: SortieSquad, size: number) => (e.raider ? <Portrait unit={e.unit} size={size} /> : <EmblemBadge emblem={echoPortrait(e.name)} size={size} title={e.name} />);
  const squad = (key: string) => c.party.find((p) => p.key === key) ?? c.enemies.find((e) => e.key === key);
  const face = (s: SortieSquad, size: number) => (s.echo ? echoFace(s, size) : <Portrait unit={s.unit} size={size} />);
  const out = c.party.filter((p) => p.slot === undefined);
  // The turn order, with back-to-back turns of the same squad folded into one token.
  const turns: { key: string; n: number }[] = [];
  for (const t of c.queue) {
    const last = turns[turns.length - 1];
    if (last?.key === t.key) last.n++;
    else turns.push({ key: t.key, n: 1 });
  }
  turns.splice(8);

  const pick = (sk: SortieSkill) => {
    const p = skillProblem(run, sk.id, sk.reach ? targets[0] : undefined);
    if (sk.wait || sk.blocked) return;
    if (!sk.reach) {
      if (p) return toast(p, 'error');
      return onUse(sk.id);
    }
    setSkill(skill === sk.id ? null : sk.id);
  };
  const target = (e: SortieSquad) => {
    if (!chosen) return;
    const p = skillProblem(run, chosen.id, e.key);
    if (p) return toast(p, 'error');
    onUse(chosen.id, e.key);
  };

  const at = me ? SLOTS[slotOf(me)] : '';
  const who = c.over || !me ? '' : c.need === 'order' ? `Round ${c.round}: ${me.name} (${at}) is up. Give its order for the round.` : '';

  return (
    <div className="sortie-panel">
      <div className="row" style={{ gap: 8 }}>
        <h3 className="grow" style={{ margin: 0 }}>
          {c.kind === 'boss' ? bossOf(run).name : fightTitle[c.kind]}
          {c.affix && <span className="sortie-affix" data-tip={SORTIE.affixes[c.affix].text}> · {SORTIE.affixes[c.affix].name}</span>}
        </h3>
        <span className="muted small">Round {c.round} · {c.kills} kill{c.kills === 1 ? '' : 's'}</span>
      </div>
      {!c.over && c.queue.length > 0 && (
        <div className="sortie-init" data-tip="Who acts next this round, fastest first">
          <span className="sortie-init-label">{c.need === 'start' ? `Round ${c.round} order` : 'Turn order'}</span>
          <div className="sortie-init-row">
            {turns.map((t, i) => {
              const s = squad(t.key);
              if (!s) return null;
              const size = i === 0 ? 36 : 26;
              return (
                <span key={i} className={`sortie-init-tok${s.echo ? ' echo' : ' mine'}${i === 0 ? ' now' : ''}`} data-tip={`${s.name}${t.n > 1 ? `, ${t.n} turns in a row` : ''}`}>
                  {i === 0 && <span className="sortie-init-now">{c.need === 'start' ? 'First' : 'Now'}</span>}
                  {face(s, size)}
                  {t.n > 1 && <span className="sortie-init-n">×{t.n}</span>}
                  <span className="sortie-init-name">{s.name}</span>
                </span>
              );
            })}
          </div>
        </div>
      )}
      <div className="sortie-field" ref={fieldRef}>
        <Blows fx={c.fx} field={fieldRef} />
        <div className="sortie-party">
          {SLOTS.map((name, i) => {
            const p = c.party.find((x) => x.slot === i);
            const next = p ? nextSlots(c)[p.key] : undefined;
            return (
              <div key={name} data-sq={p?.key} className={`sortie-slot${p && p === me ? ' acting' : ''}${p ? '' : ' vacant'}`}>
                <div className="sortie-band-head">{name}{i ? <span className="muted"> · +{i} distance</span> : <span className="muted"> · melee</span>}</div>
                {!p && <div className="muted small sortie-band-none">Empty</div>}
                {p && (
                  <>
                    <div className="row small" style={{ gap: 6 }}>
                      <Portrait unit={p.unit} size={26} />
                      <span className="grow"><b>{p.name}</b> <span className="muted">Q{p.quality}+ D{p.defense}+</span>{p.shield > 0 && <span className="sortie-status"> · shield {p.shield}</span>}</span>
                      {c.orders[p.key] && <span className="sortie-ordered" data-tip="Has its order for the round"><Icon name="l:check" /></span>}
                    </div>
                    <div className="sortie-models">
                      {p.models.map((m, j) => <Token key={j} face={null} m={m} />)}
                    </div>
                    {p.member !== undefined && run.party[p.member] && (
                      <div className="row small" style={{ gap: 6 }}>
                        <Stress v={run.party[p.member].stress} />
                        {lastStanding(c, p) && <span className="sortie-stand">last stand: +1 to hit, more attacks, no morale</span>}
                        {run.party[p.member].scars?.map((id) => <span key={id} className="sortie-scar" data-tip={SORTIE.scars[id].text}>{SORTIE.scars[id].name}</span>)}
                        {p.crack?.round === c.round && <span className="sortie-cracked">{p.crack.kind === 'refuse' ? 'cracked: won’t take orders' : 'cracked: fights wild, -1 to hit'}</span>}
                      </div>
                    )}
                    {statusesOf(p, c.round).length > 0 && <div className="small sortie-status">{statusesOf(p, c.round).join(', ')}</div>}
                    {next !== undefined && next !== i && <div className="small muted sortie-next">next round: {SLOTS[next]}</div>}
                  </>
                )}
              </div>
            );
          })}
          {out.map((p) => (
            <div key={p.key} className="small muted sortie-out">
              <Portrait unit={p.unit} size={20} /> {p.name} is out of the fight.
            </div>
          ))}
          <div className="muted small">Each round: Middle to Front, Front to Back, Back to Middle.</div>
        </div>
        <div className="sortie-ranks">
          {[1, 2, 3].map((d) => {
            const here = field.filter((e) => distOf(e) === d);
            return (
              <div key={d} className={`sortie-band d${d}${here.length ? '' : ' vacant'}`}>
                <div className="sortie-band-head">{DISTANCES[d]}</div>
                {!here.length && <div className="muted small sortie-band-none">No one</div>}
                {here.map((e) => {
                  const can = targets.includes(e.key);
                  const [icon, intent0] = e.intent ? INTENT[e.intent] : ['', ''];
                  const intent = e.key === c.lord && c.tells?.length ? `${intent0}. ${c.tells.map((t) => `${t.text} ${t.answer}`).join(' ')}` : intent0;
                  return (
                    <button
                      key={e.key}
                      data-sq={e.key}
                      className={`sortie-echo${can ? ' target' : ''}${chosen && !can ? ' out' : ''}`}
                      disabled={!chosen}
                      onClick={() => target(e)}
                    >
                      {echoFace(e, 30)}
                      <span className="sortie-echo-body">
                        <span className="small"><b>{e.name}</b>{e.hero ? ' (Hero)' : ''} <span className="muted">Q{e.quality}+ D{e.defense}+</span></span>
                        {e.raider && <span className="small sortie-raider">Marauder · {e.raider}</span>}
                        <span className="sortie-models">{e.models.map((m, i) => <Token key={i} face={null} m={m} />)}</span>
                        {statusesOf(e, c.round).length > 0 && <span className="small sortie-status">{statusesOf(e, c.round).join(', ')}</span>}
                      </span>
                      {icon && <span className="sortie-intent" data-tip={intent}><Glyph g={icon} /></span>}
                    </button>
                  );
                })}
              </div>
            );
          })}
          {waiting.map((e) => (
            <div key={e.key} className="sortie-echo out small">
              {echoFace(e, 24)}
              <span className="muted">{e.key === c.lord ? `${e.name} is on its way: it joins the fight in round ${e.arrives}, or the round after its escorts all fall.` : `${e.name} lurks in ambush (round ${e.arrives}).`}</span>
            </div>
          ))}
        </div>
      </div>
      {!c.over && c.need !== 'brace' && c.tells?.map((t) => (
        <div key={t.sig} className="small tone-bad sortie-tell" style={{ marginTop: 6 }}>
          <b>Tell:</b> {t.text} <span className="muted">{t.answer}</span>
        </div>
      ))}
      {c.over ? (
        <div className="row" style={{ gap: 6, marginTop: 8 }}>
          <b className="grow">{c.over === 'won' ? 'The Echoes are gone.' : c.over === 'broke' ? 'The party breaks and flees.' : 'The party is wiped out.'}</b>
          <button className="primary" onClick={onLeave}>Continue</button>
        </div>
      ) : c.need === 'brace' && c.brace ? (
        <div style={{ marginTop: 8 }}>
          <div className="small">
            <b>What will you brace for?</b> Omens read: {omensRead(run)}/{SORTIE.omens.need}. Bracing for one of {bossOf(run).name}’s signatures makes it {Math.round(SORTIE.omens.brace * 100)}% weaker
            all fight; a wrong guess costs nothing. Think back on what the omens said.
          </div>
          <div className="sortie-skills" style={{ marginTop: 6 }}>
            {c.brace.options.map((id) => {
              const sig = SORTIE_BOSSES.find((b) => b.sig.id === id)!.sig;
              return (
                <button key={id} className="sortie-skill" onClick={() => onBrace(id)} data-tip={sig.text}>
                  <b>{sig.name}</b>
                  <span className="muted">{sig.text}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : c.need === 'next' ? (
        <p className="small muted" style={{ marginTop: 8 }}>{(() => { const n = squad(c.queue[0]?.key ?? ''); return n ? `Next: ${n.name}…` : '…'; })()}</p>
      ) : c.need === 'start' ? (
        <div className="row" style={{ gap: 6, marginTop: 8 }}>
          <span className="grow small">
            {c.round === 1 ? 'The Echoes are in sight.' : `Round ${c.round - 1} is over.`} Check the turn order and Echo intents, then start. Each unit takes its order when its turn comes.
          </span>
          <button className="primary" onClick={onStart}>Start round {c.round}</button>
        </div>
      ) : (
        <>
          <div className="row small" style={{ gap: 6, marginTop: 8 }}>
            <span className="grow">{who} {chosen && <b>Pick a target at {reachText(chosen.reach)}.</b>}</span>
            {(import.meta.env.DEV || mixed) && <button onClick={onAuto} data-tip="Let the unit choose this one">Auto</button>}
          </div>
          {([['Attacks', skills.filter((sk) => ATTACKS.includes(sk.kind))], ['Abilities', skills.filter((sk) => !ATTACKS.includes(sk.kind))]] as const).map(([head, list]) => list.length > 0 && (
            <div key={head} className="sortie-skillset">
              <div className="sortie-skillset-head">{head}</div>
              <div className="sortie-skills">
                {list.map((sk) => (
                  <button
                    key={sk.id}
                    className={`sortie-skill ${sk.kind}${sk.melee ? ' melee' : ''}${skill === sk.id ? ' chosen' : ''}`}
                    disabled={sk.wait > 0 || !!sk.blocked}
                    onClick={() => pick(sk)}
                    data-tip={sk.blocked ? `${sk.blocked} ${sk.text}` : sk.text}
                  >
                    <b>{sk.name}</b>
                    <span className="muted">{sk.blocked ? sk.blocked : sk.wait ? `ready in ${sk.wait}` : sk.free ? 'free action' : sk.reach ? reachText(sk.reach) : sk.kind === 'atwill' ? 'nearest squad in reach' : ''}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
          {chosen && <p className="small muted" style={{ margin: '4px 0 0' }}>{chosen.text}</p>}
        </>
      )}
      <div className="sortie-log small">
        {[...c.log].reverse().slice(0, 14).map((l, i) => <div key={i} className={`tone-${l.tone}`}>{l.text}</div>)}
      </div>
    </div>
  );
}

