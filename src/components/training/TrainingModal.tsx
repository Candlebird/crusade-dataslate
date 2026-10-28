import { useEffect, useMemo, useRef, useState } from 'react';
import type { Campaign, Force } from '../../model/types';
import { unitPortrait } from '../../model/emblem';
import {
  ackStale, bankVictory, continueEndless, finalBoss, clearRubble, defaultByKey, clearSave, loadRun, pickCard, rerollCards, pieceAt, pieceById, placeDraft, quitRun, ambushSwap, scoutMove, scoutMoveProblem, saveRun, staleSave, startWave,
  type Phase, type SavedRun, type Tile, type TrainingRun,
} from '../../rules/training';
import { TRAINING } from '../../rules/downtimeData';
import { BOT_CARD } from '../../rules/training/bot';
import { Modal, confirmAction, toast } from '../ui';
import { act } from './act';
import { CardOffer } from './CardOffer';
import { HudBar, type Speed } from './HudBar';
import { MapView } from './MapView';
import type { MoveRule } from './PieceActions';
import { PieceInfo } from './PieceInfo';
import { finishCraft, type Crafting } from './RecipeBook';
import { glowIds } from './recipeView';
import { RunSummary } from './RunSummary';
import { SidePanel, wideSide, type Tab } from './SidePanel';
import { StartScreen } from './StartScreen';
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
  // A Scout move or Ambush swap waiting for its spot or piece on the map.
  const [moving, setMoving] = useState<{ id: number; rule: MoveRule } | null>(null);
  const best = useRef(force.trainingBest ?? 0);
  // Base HP lost on each wave played this sitting (by wave), for the log: display only, never saved.
  const hpLost = useRef<Record<number, number>>({});
  const hpStart = useRef<number | null>(null);
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
    hpLost.current = {};
    hpStart.current = null;
    setPick(0);
    setSel(null);
    setCrafting(null);
    setMoving(null);
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
    if (r.phase !== 'wave' && hpStart.current !== null) {
      hpLost.current[r.wave] = Math.max(0, hpStart.current - r.baseHp);
      hpStart.current = null;
    }
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
    setMoving(null);
    setFocus(null);
    setPaused(false);
    hpStart.current = run.baseHp;
    act(() => startWave(run), () => setTick((n) => n + 1));
    if (!wideSide()) setTab('wave');
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
        <button onClick={onClose}>Close</button>
        {saved && <button className="primary" onClick={() => begin(saved.run)}>Resume</button>}
        <button className={saved ? '' : 'primary'} disabled={!force.units.length} data-tip={saved ? 'Starts over: the saved run ends here' : undefined} onClick={newRun}>{siege ? 'Start the siege' : 'New run'}</button>
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
  // A hand Shard is unknown until it is down: the ghost is a bare footprint.
  // A move whose unit has gone, or whose build phase ended, is no move any more.
  const moveNow = moving && build && !craftNow && pieceById(run, moving.id)?.kind === 'unit' ? moving : null;
  const scouting = moveNow?.rule === 'scout' ? moveNow : null;
  const placing = scouting || (build && !craftNow && run.draft.step === 'place' && pick !== null && hand[pick]) ? true : undefined;
  const glow = craftNow ? new Set(craftNow.uses) : focus ? new Set(focus) : build ? glowIds(run) : undefined;
  const selPiece = sel !== null ? pieceById(run, sel) : undefined;

  const onCell = (cell: Tile, place: Tile) => {
    if (run.phase === 'over') return;
    const p = pieceAt(run, cell.x, cell.y);
    if (moveNow) {
      const done = () => { setMoving(null); setSel(moveNow.id); refresh(); };
      if (moveNow.rule === 'scout') act(() => scoutMove(run, moveNow.id, place.x, place.y), done);
      else if (!p || p.id === moveNow.id) toast('Tap another piece to swap with (or Cancel).', 'error');
      else act(() => ambushSwap(run, moveNow.id, p.id), done);
      return;
    }
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
      if (!confirmAction('Auto (debug): the bot plays this run for you. A run that used Auto banks nothing from here on: no XP, records, titles, quirks, honours, bestiary or siege score. Turn it on?')) return;
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
    if (cr) { setSel(null); setMoving(null); }
  };
  const over = run.phase === 'over';
  // The Final boss fell: bank the Victory (the run ends, the loop banks it) or go on into Endless.
  const victory = build && run.finale?.victory === 'pending';
  const onVictory = (go: boolean) => act(() => (go ? continueEndless(run) : bankVictory(run)), refresh);
  const craftName = !craftNow ? '' : craftNow.def ? defaultByKey(craftNow.def)?.name ?? 'The defence'
    : run.recipes.find((r) => r.unitId === craftNow.unitId)?.name ?? 'The unit';
  const mover = moveNow ? pieceById(run, moveNow.id) : undefined;
  const moverName = mover?.kind === 'unit' ? mover.name : 'The unit';
  const scoutWhy = scouting ? (x: number, y: number) => scoutMoveProblem(run, scouting.id, x, y) : undefined;

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
            <MapView run={run} portraits={portraits} glow={glow} selected={sel ?? undefined} placing={placing} placeWhy={scoutWhy} paused={paused} onCell={onCell} />
            {selPiece && !over && !moveNow && <PieceInfo run={run} piece={selPiece} record={selPiece.kind === 'unit' ? force.units.find((u) => u.id === selPiece.unitId) : undefined} onClose={() => setSel(null)} onChange={refresh} onMove={(rule) => setMoving({ id: selPiece.id, rule })} />}
            {craftNow && (
              <div className="training-map-banner small" role="status">
                <span className="grow">Tap one of the glowing Shards: {craftName} stands there, the rest turn to rubble.</span>
                <button onClick={() => setCrafting(null)}>Cancel</button>
              </div>
            )}
            {moveNow && (
              <div className="training-map-banner small" role="status">
                <span className="grow">{moveNow.rule === 'scout' ? `Tap an open spot: ${moverName} moves there (the route must stay open).` : `Tap a defence, Shard or rubble: ${moverName} swaps places with it.`}</span>
                <button onClick={() => setMoving(null)}>Cancel</button>
              </div>
            )}
            {victory && !auto && (
              <div className="training-over" role="dialog" aria-label="Victory">
                <div className="training-over-card small">
                  <div style={{ marginBottom: 4, color: 'var(--gold)' }}><b>Victory!</b> {finalBoss(run)} falls on the Final wave {run.finale!.final}, the base standing at {run.baseHp}/{TRAINING.baseHp}.</div>
                  <div className="muted">Bank it and end the run here, or go on into Endless: waves with no Final ahead, every one climbing steeper. The Victory stands either way.</div>
                  <div className="training-over-actions">
                    <button onClick={() => onVictory(false)}>Bank and end</button>
                    <button className="primary" onClick={() => onVictory(true)}>Continue into Endless</button>
                  </div>
                </div>
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
        <SidePanel
          run={run} units={force.units} portraits={portraits} tab={tab} onTab={setTab} pick={pick} onPick={setPick} sel={sel} onFocus={setFocus}
          crafting={craftNow} onCraft={(cr) => { craftMode(cr); if (cr && !wideSide()) setTab('draft'); }} peek={peek} onUnpeek={() => setPeek(false)} onChange={refresh}
          hpLost={hpLost.current}
        />
        {/* On a phone held upright End run sits at the foot of the page, under the panels, instead of in the HUD. */}
        {run.phase !== 'over' && <button className="training-foot-quit" onClick={quit}>End run</button>}
      </div>
      {build && !victory && run.offer && !peek && <CardOffer run={run} offer={run.offer} portraits={portraits} auto={auto} autoPick={BOT_CARD} onPick={take} onPeek={() => setPeek(true)} onReroll={() => act(() => rerollCards(run), refresh)} />}
    </Modal>
  );
}
