import { useEffect, useMemo, useRef, useState } from 'react';
import { TRAINING_ENEMIES, type TrainingEnemyKind } from '../../rules/downtimeData';
import { nextRound, previewWave, type TrainingRun } from '../../rules/training';
import { bossGlow, enemyShape, flyerWings } from './drawLive';

/** A wave's enemy as drawn on the map: its shape and colour, the gold rim of an elite, a flyer's wings, a boss's glow. */
function MarkIcon({ kind, elite, flies, boss }: { kind: TrainingEnemyKind; elite: boolean; flies: boolean; boss: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    const d = TRAINING_ENEMIES[kind];
    ctx.clearRect(0, 0, 48, 48);
    const r = boss ? 11 : 12;
    const y = flies ? 30 : 25;
    if (boss) bossGlow(ctx, 24, y, r);
    if (flies) flyerWings(ctx, 24, y, r * 0.75);
    enemyShape(ctx, d.shape, 24, y, flies ? r * 0.8 : r, 0, d.color, elite);
  }, [kind, elite, flies, boss]);
  return <canvas ref={ref} width={48} height={48} style={{ width: 24, height: 24 }} aria-hidden />;
}

/** The HUD's next-round icon: the next wave's kind (and its boss), as drawn on the map. Tap toggles a popover of one
 *  line each on what they do; a mouse hover shows it too. */
export function NextRoundIcon({ run }: { run: TrainingRun }) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  // As the wave preview: a copy of the dice, so only a new wave (or a load) changes it.
  const nr = useMemo(() => nextRound(run, previewWave(run)), [run, run.wave, run.rng]);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);
  useEffect(() => setOpen(false), [run.wave]);
  if (!nr) return null;
  const lone = nr.kind === 'lord';
  const shown = open || hover;
  return (
    <span
      ref={box}
      className="training-hud-stat training-next"
      onPointerEnter={(e) => e.pointerType === 'mouse' && setHover(true)}
      onPointerLeave={(e) => e.pointerType === 'mouse' && setHover(false)}
    >
      <button
        className="ghost training-next-btn"
        aria-expanded={shown}
        aria-label={`Next round: wave ${nr.wave}, ${TRAINING_ENEMIES[nr.kind].name}${nr.boss ? `, boss ${nr.boss}` : ''}. Show what it does`}
        onClick={() => setOpen(!open)}
      >
        <span className="muted">Next</span>
        <MarkIcon kind={nr.kind} elite={nr.elite} flies={nr.flies} boss={lone} />
        {nr.boss && !lone && <MarkIcon kind="lord" elite={false} flies={nr.bossFlies} boss />}
      </button>
      {shown && (
        <span className="training-next-pop small" role="tooltip">
          <b>Wave {nr.wave}: {lone ? nr.boss : TRAINING_ENEMIES[nr.kind].name}</b>
          {nr.lines.map((l, i) => <span key={i}>{l}</span>)}
        </span>
      )}
    </span>
  );
}
