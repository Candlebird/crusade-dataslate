import { useEffect, useMemo, useRef } from 'react';
import { TRAINING, TRAINING_ENEMIES, type TrainingEnemyKind } from '../../rules/downtimeData';
import { nextRound, previewGroups, previewWave, type NextRound, type PreviewGroup, type TrainingRun } from '../../rules/training';
import { Tip } from '../Tooltip';
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

/** One enemy kind's numbers in the next wave: count, wounds, speed, Defense, armour and what a leak costs the base. */
function StatRow({ g }: { g: PreviewGroup }) {
  const d = TRAINING_ENEMIES[g.kind];
  const speed = Math.round(d.speed * TRAINING.walkMul * 10) / 10;
  const boss = d.spawn === 'boss';
  return (
    <div className="training-next-kind">
      <span className="training-next-name">
        <MarkIcon kind={g.kind} elite={g.elites > 0} flies={g.flies} boss={boss} />
        <b>{d.name}</b> <span className="muted">×{g.n}{g.flies ? ' · flies' : ''}{g.elites ? ` · ${g.elites} elite` : ''}</span>
      </span>
      <span className="training-next-stats">
        <span>Wounds <b>{g.hp}</b></span>
        <span>Speed <b>{speed}</b></span>
        <span>Defense <b>{d.defense}+</b></span>
        {d.armor ? <span>Armour <b>{d.armor}</b></span> : null}
        <span>Leak <b>{d.leak}</b>{g.elites ? <span className="muted"> (elite {Math.max(d.leak, TRAINING.leak.elite)})</span> : null}</span>
      </span>
    </div>
  );
}

/** The next wave's popover: each kind's numbers, then one line each on what it does (its tricks, the boss's, the
 *  campaign's affixes). */
function WaveStats({ nr, groups }: { nr: NextRound; groups: PreviewGroup[] }) {
  return (
    <span className="training-next-pop">
      <b>Wave {nr.wave}</b>
      {groups.map((g) => <StatRow key={g.kind} g={g} />)}
      {nr.lines.map((l, i) => <span key={i} className="training-next-line">{l}</span>)}
    </span>
  );
}

/** The HUD's next-wave icons: its kind (and its boss), as drawn on the map. Hover, focus or tap opens a popover under
 *  them with each one's numbers and tricks. */
export function NextRoundIcon({ run }: { run: TrainingRun }) {
  // As the wave preview: a copy of the dice, so only a new wave (or a load) changes it.
  const plans = useMemo(() => previewWave(run), [run, run.wave, run.rng]);
  const nr = useMemo(() => nextRound(run, plans), [run, plans]);
  const groups = useMemo(() => previewGroups(plans), [plans]);
  if (!nr) return null;
  const lone = nr.kind === 'lord';
  return (
    <Tip place="below" content={<WaveStats nr={nr} groups={groups} />}>
      <span
        className="training-hud-stat training-next"
        tabIndex={0}
        role="img"
        aria-label={`Next wave ${nr.wave}: ${groups.map((g) => `${g.n} ${TRAINING_ENEMIES[g.kind].name}`).join(', ')}${nr.boss ? `, boss ${nr.boss}` : ''}`}
      >
        <MarkIcon kind={nr.kind} elite={nr.elite} flies={nr.flies} boss={lone} />
        {nr.boss && !lone && <MarkIcon kind="lord" elite={false} flies={nr.bossFlies} boss />}
      </span>
    </Tip>
  );
}
