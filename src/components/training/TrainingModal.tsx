import { useMemo, useRef, useState } from 'react';
import type { Campaign, Force } from '../../model/types';
import { unitPortrait } from '../../model/emblem';
import {
  cardText, clearRubble, clearSave, createRun, loadRun, pickCard, pieceAt, pieceById, placeDraft, quitRun, saveRun, startWave,
  type Phase, type SavedRun, type Tile, type TrainingRun,
} from '../../rules/training';
import { Modal, confirmAction, toast } from '../ui';
import { act } from './act';
import { CardOffer, TIER_TAG } from './CardOffer';
import { DraftPanel } from './DraftPanel';
import { HudBar, type Speed } from './HudBar';
import { MapView } from './MapView';
import { PieceInfo } from './PieceInfo';
import { RecipeBook, finishCraft, type Crafting } from './RecipeBook';
import { glowIds } from './recipeView';
import { RunSummary } from './RunSummary';
import { ShopPanel } from './ShopPanel';
import { StartScreen } from './StartScreen';
import { WavePreview } from './WavePreview';
import { useBank } from './useBank';
import { useRunLoop } from './useRunLoop';

const newSeed = () => Math.floor(Math.random() * 2 ** 31);

/**
 * The Training sim: draft Shards into a maze, craft units from them and hold the base against endless waves. The run
 * saves at every build-phase change; XP banks as it lands. The engine is rules/training; this only wires it up.
 */
export default function TrainingModal({ force, c, onClose }: { force: Force; c?: Campaign; onClose: () => void }) {
  const portraits = useMemo(() => Object.fromEntries(force.units.map((u) => [u.id, unitPortrait(u, force)])), [force]);
  const bank = useBank(force, c);
  const [saved, setSaved] = useState<SavedRun | null>(() => loadRun(force.id));
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
    begin(createRun(force.id, force.units, newSeed()));
  };

  const onPhase = (r: TrainingRun, _was: Phase) => {
    if (r.phase === 'build') {
      bank.bankXp(r);
      saveRun(r);
      setPick(0);
      setPeek(false);
    } else if (r.phase === 'over') {
      bank.finish(r);
      clearSave(r.forceId);
      setCrafting(null);
    }
  };
  useRunLoop(run, { speed, paused, onTick: () => setTick((n) => n + 1), onPhase });

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
        <button className={saved ? '' : 'primary'} disabled={!force.units.length} onClick={newRun}>New run</button>
      </>}>
        <StartScreen force={force} c={c} saved={saved} />
      </Modal>
    );
  }

  const build = run.phase === 'build';
  // A craft whose Shards have gone (kept over, crumbled, the wave began) is no craft any more.
  const craftNow = crafting && build && !run.crafted.includes(crafting.unitId)
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

  const start = () => {
    setCrafting(null);
    setFocus(null);
    setPaused(false);
    act(() => startWave(run), () => setTick((n) => n + 1));
  };
  const quit = () => {
    if (!confirmAction('End this run? XP already earned stays banked.')) return;
    end(run);
    refresh();
  };
  const take = (i: number) => {
    act(() => pickCard(run, i), refresh);
    setPeek(false);
  };
  const again = () => begin(createRun(force.id, force.units, newSeed()));

  return (
    <Modal title="Training sim" onClose={close} wide footer={
      run.phase === 'over'
        ? <><button onClick={again}>Train again</button><button className="primary" onClick={onClose}>Done</button></>
        : <button onClick={close} title={build ? 'The run is saved: resume it later.' : 'Leaving mid-wave ends the run.'}>Close</button>
    }>
      <div className="training-game">
        <HudBar run={run} best={best.current} speed={speed} onSpeed={setSpeed} onStart={start} onQuit={quit} paused={paused} onPause={() => setPaused(!paused)} />
        <div className="training">
          <div className="training-board">
            <MapView run={run} portraits={portraits} glow={glow} selected={sel ?? undefined} placing={placing} onCell={onCell} />
            {build && <div className="row small training-next"><span className="muted">Next wave:</span><WavePreview run={run} /></div>}
            <div className="training-log muted small">{run.log.slice(-3).map((l, i) => <div key={i}>{l}</div>)}</div>
          </div>
          <div className="training-side small">
            {build && run.offer && peek && <button className="primary" onClick={() => setPeek(false)}>Pick a card</button>}
            {run.phase === 'wave' && run.offer && <div className="muted">The Echo Lord fell: pick a card after this wave.</div>}
            {selPiece && <PieceInfo piece={selPiece} onClose={() => setSel(null)} />}
            <DraftPanel run={run} pick={pick} onPick={setPick} onFocus={setFocus} onChange={refresh} />
            {run.phase !== 'over' && <RecipeBook run={run} units={force.units} portraits={portraits} crafting={craftNow} onCraft={setCrafting} />}
            {run.phase !== 'over' && <ShopPanel run={run} portraits={portraits} sel={sel} onSelect={setSel} onChange={refresh} />}
            {run.cards.length > 0 && (
              <div>
                <b>Cards</b>{' '}
                {run.cards.map((d, i) => {
                  const t = cardText(run, d);
                  return <span key={i} className={`tag ${TIER_TAG[d.rarity]}`} title={t.text}>{t.name}</span>;
                })}
              </div>
            )}
          </div>
        </div>
        {run.phase === 'over' && <RunSummary run={run} best={best.current} />}
      </div>
      {build && run.offer && !peek && <CardOffer run={run} offer={run.offer} portraits={portraits} onPick={take} onPeek={() => setPeek(true)} />}
    </Modal>
  );
}
