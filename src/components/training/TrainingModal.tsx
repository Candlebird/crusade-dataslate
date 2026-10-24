import { useEffect, useMemo, useRef, useState } from 'react';
import type { Campaign, Force } from '../../model/types';
import { unitPortrait } from '../../model/emblem';
import {
  ackStale, cardText, readyRecipes, clearRubble, defaultByKey, clearSave, loadRun, pickCard, rerollCards, pieceAt, pieceById, placeDraft, quitRun, saveRun, staleSave, startWave,
  type Phase, type SavedRun, type Tile, type TrainingRun,
} from '../../rules/training';
import { TRAINING } from '../../rules/downtimeData';
import { BOT_CARD } from '../../rules/training/bot';
import { Modal, confirmAction, toast } from '../ui';
import { act } from './act';
import { CardOffer, cardTag } from './CardOffer';
import { DraftPanel } from './DraftPanel';
import { HudBar, type Speed } from './HudBar';
import { MapView } from './MapView';
import { PieceInfo } from './PieceInfo';
import { RecipeBook, finishCraft, type Crafting } from './RecipeBook';
import { glowIds } from './recipeView';
import { RunSummary } from './RunSummary';
import { ShopPanel } from './ShopPanel';
import { StartScreen } from './StartScreen';
import { WaveStatus } from './WavePreview';
import { useBank } from './useBank';
import { useRunLoop } from './useRunLoop';
import { useAuto } from './useAuto';
import { freshRun } from './freshRun';
import { thisWeek, useSiegeSettle } from './useSiegeSettle';

/**
 * The Training sim: draft Shards into a maze, craft units from them and hold the base against endless waves. The run
 * saves at every build-phase change; XP banks as it lands. The engine is rules/training; this only wires it up.
 */
export default function TrainingModal({ force, c, onClose }: { force: Force; c?: Campaign; onClose: () => void }) {
  const portraits = useMemo(() => Object.fromEntries(force.units.map((u) => [u.id, unitPortrait(u, force)])), [force]);
  const bank = useBank(force, c);
  // An older version's save is dropped first (and the start screen says so, once).
  const [cleared] = useState(() => staleSave(force.id));
  useEffect(() => ackStale(force.id), [force.id]);
  const [saved, setSaved] = useState<SavedRun | null>(() => loadRun(force.id));
  // The next run is this week's Weekly Siege; the campaign's finished weeks are settled on opening.
  const [siege, setSiege] = useState(false);
  useSiegeSettle(c);
  const [run, setRun] = useState<TrainingRun | null>(null);
  const [, setTick] = useState(0);
  const [speed, setSpeed] = useState<Speed>(1);
  const [paused, setPaused] = useState(false);
  // Hide the card offer for a look at the field.
  const [peek, setPeek] = useState(false);
  // The hand Shard the next tap places; a craft waiting for its Shard; pieces a hovered keep option lights; the piece picked.
  const [pick, setPick] = useState<number | null>(0);
  const [crafting, setCrafting] = useState<Crafting | null>(null);
  const [focus, setFocus] = useState<number[] | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const best = useRef(force.trainingBest ?? 0);
  // Auto (debug): the bot plays (useAuto); and the side panel's tab on a phone (CSS shows them all on a wide screen).
  const [auto, setAuto] = useState(false);
  const [tab, setTab] = useState<Tab>('draft');

  /** Re-render the panels, saving the run while it is between waves. */
  const refresh = () => {
    if (run?.phase === 'build') saveRun(run);
    setTick((n) => n + 1);
  };

  const begin = (r: TrainingRun) => {
    bank.reset();
    best.current = force.trainingBest ?? 0;
    setPick(0);
    setSel(null);
    setCrafting(null);
    setFocus(null);
    setPeek(false);
    setPaused(false);
    setAuto(false);
    setTab('draft');
    saveRun(r);
    setSaved(null);
    setRun(r);
  };

  /** End a run for good: pay it out and drop its save. */
  const end = (r: TrainingRun) => {
    quitRun(r);
    bank.finish(r);
    clearSave(r.forceId);
  };

  const newRun = () => {
    if (saved) {
      const n = saved.run.cleared;
      if (!confirmAction(`Start a new run? The saved one (${n} wave${n === 1 ? '' : 's'} cleared) ends here.`)) return;
      bank.reset();
      end(saved.run);
    }
    begin(freshRun(force, c, siege));
  };

  const onPhase = (r: TrainingRun, _was: Phase) => {
    if (r.phase === 'build') {
      bank.bankXp(r);
      saveRun(r);
      setPick(0);
      setPeek(false);
      setTab('draft');
    } else if (r.phase === 'over') {
      bank.finish(r);
      clearSave(r.forceId);
      setCrafting(null);
      setSel(null);
      setFocus(null);
      setAuto(false);
    }
  };
  useRunLoop(run, { speed, paused, onTick: () => setTick((n) => n + 1), onPhase });
  const start = () => {
    if (!run) return;
    setCrafting(null);
    setFocus(null);
    setPaused(false);
    act(() => startWave(run), () => setTick((n) => n + 1));
    setTab('wave');
  };
  useAuto(run, {
    on: auto, speed, paused, units: force.units,
    onMove: () => refresh(),
    onStart: () => start(),
    onStuck: (why) => {
      setAuto(false);
      toast(`Auto stopped: ${why}`, 'error');
    },
  });

  const close = () => {
    if (run?.phase === 'wave') {
      if (!confirmAction('Leave mid-wave? That ends the run; XP already earned stays banked.')) return;
      end(run);
    } else if (run?.phase === 'build') saveRun(run);
    onClose();
  };

  if (!run) {
    return (
      <Modal title="Training sim" onClose={onClose} footer={<>
        <button onClick={onClose}>Cancel</button>
        {saved && <button className="primary" onClick={() => begin(saved.run)}>Resume</button>}
        <button className={saved ? '' : 'primary'} disabled={!force.units.length} onClick={newRun}>{siege ? 'Start the siege' : 'New run'}</button>
      </>}>
        <StartScreen force={force} c={c} saved={saved} cleared={cleared} siege={siege} onSiege={setSiege} week={thisWeek()} />
      </Modal>
    );
  }

  const build = run.phase === 'build';
  // A craft whose Shards have gone (kept over, crumbled, the wave began) is no craft any more.
  const craftNow = crafting && build && !(crafting.unitId && run.crafted.includes(crafting.unitId))
    && crafting.uses.every((id) => pieceById(run, id)?.kind === 'shard') ? crafting : null;
  const hand = run.draft.hand;
  const placing = build && !craftNow && run.draft.step === 'place' && pick !== null ? hand[pick] : undefined;
  const glow = craftNow ? new Set(craftNow.uses) : focus ? new Set(focus) : build ? glowIds(run) : undefined;
  const selPiece = sel !== null ? pieceById(run, sel) : undefined;

  const onCell = (cell: Tile, place: Tile) => {
    if (run.phase === 'over') return;
    const p = pieceAt(run, cell.x, cell.y);
    if (craftNow) {
      if (p && craftNow.uses.includes(p.id)) {
        if (finishCraft(run, force.units, craftNow, p.id, refresh)) {
          setCrafting(null);
          setSel(p.id);
        }
      } else toast('Tap one of the glowing Shards (or Cancel the craft).', 'error');
      return;
    }
    if (p) {
      if (p.kind === 'rubble') {
        if (build) act(() => clearRubble(run, p.id), refresh);
      } else setSel(sel === p.id ? null : p.id);
      return;
    }
    if (placing && pick !== null) {
      if (act(() => placeDraft(run, pick, place.x, place.y), refresh)) setPick(run.draft.hand.length ? Math.min(pick, run.draft.hand.length - 1) : null);
      return;
    }
    setSel(null);
  };

  /** Auto on marks the run for good (it banks nothing from then on); off hands it back between moves. */
  const toggleAuto = () => {
    if (!auto && !run.auto) {
      if (!confirmAction('Auto (debug): the bot plays this run for you. A run that used Auto banks nothing from here on: no XP, records, titles, quirks, trinkets, honours, bestiary or siege score. Turn it on?')) return;
      run.auto = true;
      refresh();
    }
    setCrafting(null);
    setAuto(!auto);
  };
  const quit = () => {
    if (!confirmAction('End this run? XP already earned stays banked.')) return;
    end(run);
    setCrafting(null);
    setSel(null);
    refresh();
  };
  const take = (i: number) => {
    act(() => pickCard(run, i), refresh);
    setPeek(false);
  };
  const again = () => begin(freshRun(force, c, !!run.siege));
  /** Start (or cancel) a craft; the floating piece card makes way for the craft banner. */
  const craftMode = (cr: Crafting | null) => {
    setCrafting(cr);
    if (cr) setSel(null);
  };
  const over = run.phase === 'over';
  const craftName = !craftNow ? '' : craftNow.def ? defaultByKey(craftNow.def)?.name ?? 'The defence'
    : run.recipes.find((r) => r.unitId === craftNow.unitId)?.name ?? 'The unit';

  // The map (with the HUD over it) is the stage; the panels sit beside it, or under it on a phone. The header's ×
  // closes (the run saves between waves); the run summary comes up over the map when the base falls.
  return (
    <Modal title="Training sim" onClose={close}>
      <div className="training-game">
        <div className="training-stage">
          <HudBar
            run={run} best={best.current} speed={speed} onSpeed={setSpeed} onStart={start} onQuit={quit} paused={paused} onPause={() => setPaused(!paused)}
            auto={TRAINING.debugAuto ? auto : undefined} onAuto={toggleAuto}
          />
          <div className="training-board">
            <MapView run={run} portraits={portraits} glow={glow} selected={sel ?? undefined} placing={placing} paused={paused} onCell={onCell} />
            {selPiece && !over && <PieceInfo piece={selPiece} record={selPiece.kind === 'unit' ? force.units.find((u) => u.id === selPiece.unitId) : undefined} onClose={() => setSel(null)} />}
            {craftNow && (
              <div className="training-map-banner small" role="status">
                <span className="grow">Tap one of the glowing Shards: {craftName} stands there, the rest turn to rubble.</span>
                <button onClick={() => setCrafting(null)}>Cancel</button>
              </div>
            )}
            {over && (
              <div className="training-over">
                <div className="training-over-card">
                  <RunSummary run={run} best={best.current} force={force} />
                  <div className="training-over-actions">
                    <button onClick={again}>{run.siege ? 'Siege again' : 'Train again'}</button>
                    <button className="primary" onClick={onClose}>Done</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="training-side small">
          <div className="training-tabs" role="tablist" aria-label="Panels">
            {TABS.map(([k, name]) => (
              <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'primary' : ''} onClick={() => setTab(k)}>
                {name}{k === 'units' && build && readyRecipes(run).length > 0 && <span className="training-tab-dot" aria-label="(a unit is ready)" />}
              </button>
            ))}
          </div>
          <div className={`training-sec${tab === 'draft' ? ' on' : ''}`}>
            {build && run.offer && peek && <button className="primary" onClick={() => setPeek(false)}>Pick a card</button>}
            {run.phase === 'wave' && run.offer && <div className="muted">The Echo Lord fell: pick a card after this wave.</div>}
            <DraftPanel run={run} pick={pick} sel={sel} onPick={setPick} onFocus={setFocus} onChange={refresh} />
          </div>
          <div className={`training-sec${tab === 'units' ? ' on' : ''}`}>
            {!over && <RecipeBook run={run} units={force.units} portraits={portraits} crafting={craftNow} onCraft={(cr) => { craftMode(cr); if (cr) setTab('draft'); }} />}
          </div>
          <div className={`training-sec${tab === 'shop' ? ' on' : ''}`}>
            {!over && <ShopPanel run={run} portraits={portraits} sel={sel} onSelect={setSel} onChange={refresh} />}
          </div>
          <div className={`training-sec training-sec-wave${tab === 'wave' ? ' on' : ''}`}>
            <WaveStatus run={run} />
            {run.cards.length > 0 && (
              <div className="training-held">
                <b>Cards</b>{' '}
                {run.cards.map((d, i) => {
                  const t = cardText(run, d);
                  return <span key={i} className={`tag ${cardTag(d)}`} title={`${t.name}: ${t.text}`}>{t.name}</span>;
                })}
              </div>
            )}
            <div className="training-log muted small" aria-label="Run log, newest first">
              {run.log.slice(-20).reverse().map((l, i) => <div key={i}>{l}</div>)}
            </div>
          </div>
        </div>
      </div>
      {build && run.offer && !peek && <CardOffer run={run} offer={run.offer} portraits={portraits} auto={auto} autoPick={BOT_CARD} onPick={take} onPeek={() => setPeek(true)} onReroll={() => act(() => rerollCards(run), refresh)} />}
    </Modal>
  );
}

/** The side panel's tabs on a phone (a wide screen shows every panel, stacked). */
type Tab = 'draft' | 'units' | 'shop' | 'wave';
const TABS: [Tab, string][] = [['draft', 'Draft'], ['units', 'Units'], ['shop', 'Shop'], ['wave', 'Wave']];
