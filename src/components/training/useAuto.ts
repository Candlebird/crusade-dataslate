import { useEffect, useRef } from 'react';
import type { Unit } from '../../model/types';
import maze from '../../rules/trainingTestMaze.json';
import { continueEndless, startProblem, type TrainingRun } from '../../rules/training';
import { botMoves, type MazeSpot } from '../../rules/training/bot';

// Auto (debug, TRAINING.debugAuto): the balance bot plays the live run a move at a time, slow enough to watch. Each
// build phase is one botMoves run, a move every MOVE_S real seconds (by the speed; none while paused), then the next
// wave starts. Turning it off hands the run back between moves. The shell marks the run (run.auto): it banks nothing.

/** Real seconds between the bot's moves at 1×, and before it takes a card (the offer rises first). */
const MOVE_S = 0.4;
const CARD_S = 1.6;

export interface AutoOpts {
  on: boolean;
  speed: number;
  paused: boolean;
  units: Unit[];
  /** A move was made: the panels re-render (and the run saves). */
  onMove: (what: string) => void;
  /** The build is done: start the next wave. */
  onStart: () => void;
  /** The bot can't go on (stuck, or a move refused): Auto turns off. */
  onStuck: (why: string) => void;
}

export function useAuto(run: TrainingRun | null, opts: AutoOpts): void {
  const live = useRef(opts);
  live.current = opts;
  // The maze cursor carries over between build phases of one run.
  const cursor = useRef(0);
  useEffect(() => { cursor.current = 0; }, [run]);
  useEffect(() => {
    if (!run || !opts.on) return;
    let moves: Generator<string, number> | null = null;
    let wait = 0;
    let last = performance.now();
    const timer = window.setInterval(() => {
      const o = live.current;
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
      if (o.paused || run.phase !== 'build') {
        moves = null;
        wait = 0;
        return;
      }
      if (run.finale?.victory === 'pending') {
        continueEndless(run);
        o.onMove('On into Endless');
        return;
      }
      if (!moves) {
        moves = botMoves(run, o.units, maze as MazeSpot[], cursor.current);
        wait = run.offer?.length ? CARD_S : MOVE_S;
      }
      wait -= dt * o.speed;
      if (wait > 0) return;
      wait = MOVE_S;
      try {
        const r = moves.next();
        if (!r.done) {
          o.onMove(r.value);
          return;
        }
        cursor.current = r.value;
        moves = null;
        const why = run.draft.step !== 'done' ? 'the bot found nowhere to place a Shard' : startProblem(run);
        if (why) o.onStuck(why);
        else o.onStart();
      } catch (e) {
        moves = null;
        o.onStuck(e instanceof Error ? e.message : String(e));
      }
    }, 50);
    return () => window.clearInterval(timer);
  }, [run, opts.on]);
}
