import { useEffect, useMemo, useRef } from 'react';
import { TRAINING, TRAINING_ENEMIES, type TrainingEnemyDef } from '../../rules/downtimeData';
import { previewGroups, previewWave, waveTags, type PreviewGroup, type TrainingRun } from '../../rules/training';
import { enemyShape } from './drawLive';

export interface WavePreviewProps {
  run: TrainingRun;
}

/** What the next wave sends, one icon a kind with a count; hover for what it is. */
export function WavePreview({ run }: WavePreviewProps) {
  // The preview rolls on a copy of the dice: only a new wave (or a load) changes it.
  const groups = useMemo(() => previewGroups(previewWave(run)), [run, run.wave, run.rng]);
  const tags = waveTags(run.wave + 1);
  return (
    <span className="training-preview row" aria-label="Next wave's enemies">
      <span className="small muted">Next{tags.length ? ` (${tags.join(', ')})` : ''}:</span>
      {groups.map((g) => (
        <span key={g.kind} className="training-preview-group" title={enemyRundown(TRAINING_ENEMIES[g.kind], g)}>
          <EnemyIcon def={TRAINING_ENEMIES[g.kind]} vet={g.vets > 0} />
          <span className="small">×{g.n}</span>
        </span>
      ))}
    </span>
  );
}

export function EnemyIcon({ def, vet }: { def: TrainingEnemyDef; vet: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 48, 48);
    enemyShape(ctx, def.shape, 24, 24, 13, 0, def.color, vet);
  }, [def, vet]);
  return <canvas ref={ref} width={48} height={48} style={{ width: 24, height: 24 }} aria-hidden />;
}

/** A hover rundown of an enemy kind: what it does, and its numbers this wave. */
export function enemyRundown(d: TrainingEnemyDef, g: PreviewGroup): string {
  const lines = [
    `${d.name} ×${g.n}: ${d.desc}`,
    `Wounds ${g.hp} · Defense ${d.defense}+ · speed ${Math.round(d.speed * TRAINING.walkMul * 10) / 10} cells/s${d.armor ? ` · armour ${d.armor}` : ''}`,
  ];
  if (g.flies) lines.push('Flies straight from pad to pad, over the maze. Never held.');
  if (d.shotMul !== undefined && d.shotMul !== 1) lines.push(`Takes ×${d.shotMul} damage from shooting`);
  if (d.meleeMul !== undefined && d.meleeMul !== 1) lines.push(`Takes ×${d.meleeMul} damage in melee`);
  if (d.big) lines.push('Held half as long.');
  lines.push(`Costs the base ${d.leak} HP if it gets through.`);
  if (g.vets) lines.push(`${g.vets} of them veterans: ×${TRAINING.wave.vetHp} wounds, cost the base ${Math.max(d.leak, TRAINING.leak.vet)}.`);
  return lines.join('\n');
}
