import { useEffect, useMemo, useRef } from 'react';
import { TRAINING, TRAINING_ENEMIES, type TrainingEnemyDef } from '../../rules/downtimeData';
import { finalBoss, finalOf, inEndless, isNemesisWave, lordIndex, lordLine, nemesisTricks, previewGroups, previewWave, waveTags, type PreviewGroup, type TrainingRun } from '../../rules/training';
import { enemyShape } from './drawLive';

export interface WavePreviewProps {
  run: TrainingRun;
}

/**
 * The wave line at the top of the side panel: what the next wave is and sends, or how the one under way is going. It
 * keeps its place (and height) in every phase so the panels under it don't jump.
 */
export function WaveStatus({ run }: WavePreviewProps) {
  if (run.phase === 'over') {
    const n = run.cleared;
    return <div className="training-status"><div className="training-status-head"><b>Run over</b><span className="muted">· {n} wave{n === 1 ? '' : 's'} cleared</span></div></div>;
  }
  const live = run.phase === 'wave';
  const n = live ? run.wave : run.wave + 1;
  const left = run.enemies.length + run.queue.length;
  return (
    <div className="training-status">
      <div className="training-status-head">
        <b>{live ? `Wave ${n} under way` : `Next: wave ${n}`}</b>
        {waveTags(n).map((t) => <span key={t} className="tag" data-tip={TAG_TEXT[t]}>{t}</span>)}
        {run.nemesis && isNemesisWave(run, n) && (
          <span className="tag red" data-tip={`Your Sortie nemesis is this wave's Echo Lord. ${nemesisTricks(run.nemesis).map((t) => `${t.name}: ${t.text}`).join(' ')}`}>
            Nemesis: {run.nemesis.name}
          </span>
        )}
        {run.nexus && <RealLordTag run={run} w={n} />}
        {run.finale && n === finalOf(run) && !inEndless(run) && (
          <span className="tag gold" data-tip={run.siege ? 'It comes alone and cannot fall: hurt it all you can before it reaches the base.' : 'Slay it with the base standing for a Victory; if it reaches the base the run ends.'}>
            Final: {finalBoss(run)}
          </span>
        )}
      </div>
      {live ? (
        <div className="muted">
          {left} enem{left === 1 ? 'y' : 'ies'} left
          {' · '}
          {run.leaked
            ? <span style={{ color: 'var(--red)' }} data-tip="Each enemy that reaches the base costs base HP; a wave with none through pays bonus credits">{run.leaked} got through</span>
            : <span data-tip="A wave with none through pays bonus credits">none through yet</span>}
        </div>
      ) : <WavePreview run={run} />}
      {!live && waveTags(n).some((t) => TAG_TEXT[t]) && (
        <div className="training-status-note muted">{waveTags(n).map((t) => TAG_TEXT[t]).filter(Boolean).join(' ')}</div>
      )}
    </div>
  );
}

/** What a wave tag means, said under the wave line before it starts (a tooltip never shows on a phone). */
export const TAG_TEXT: Record<string, string> = {
  Flying: 'Flying: they fly straight from pad to pad over the maze, so only pieces in reach of that line hit them.',
  Boss: `Boss: an Echo Lord leads this wave; it is tough, and costs the base at least ${TRAINING.leak.bossMin} HP if it gets through.`,
};

/** A tag for a wave one of the campaign's real Echo Lords leads; hover for its trick. */
function RealLordTag({ run, w }: { run: TrainingRun; w: number }) {
  const i = lordIndex(run, w);
  const l = i === undefined ? undefined : run.nexus!.lords[i];
  if (!l) return null;
  return <span className="tag red" data-tip={lordLine(l, w)}>{l.slain ? 'Slain: ' : ''}{l.name} ({l.tier})</span>;
}

/** What the next wave sends: its one kind (and a boss wave's lord), an icon with a count, the kind's name and how many
 *  are elites; hover for what it is. */
export function WavePreview({ run }: WavePreviewProps) {
  // The preview rolls on a copy of the dice: only a new wave (or a load) changes it.
  const groups = useMemo(() => previewGroups(previewWave(run)), [run, run.wave, run.rng]);
  return (
    <span className="training-preview row" aria-label="Next wave's enemies">
      {groups.map((g) => (
        <span key={g.kind} className="training-preview-group" data-tip={enemyRundown(TRAINING_ENEMIES[g.kind], g)}>
          <EnemyIcon def={TRAINING_ENEMIES[g.kind]} elite={g.elites > 0} />
          <span className="small">×{g.n} {TRAINING_ENEMIES[g.kind].name}{g.elites ? <span style={{ color: 'var(--gold)' }}> · {g.elites} elite</span> : null}</span>
        </span>
      ))}
    </span>
  );
}

export function EnemyIcon({ def, elite }: { def: TrainingEnemyDef; elite: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 48, 48);
    enemyShape(ctx, def.shape, 24, 24, 13, 0, def.color, elite);
  }, [def, elite]);
  return <canvas ref={ref} width={48} height={48} style={{ width: 24, height: 24 }} aria-hidden />;
}

/** A hover rundown of an enemy kind: what it does, and its numbers this wave. */
/** A preview's wounds, rounded: an early wave's walkers have less than one. */
export const woundsText = (hp: number) => (hp < 1 ? 'under 1' : String(hp));

export function enemyRundown(d: TrainingEnemyDef, g: PreviewGroup): string {
  const lines = [
    `${d.name} ×${g.n}: ${d.desc}`,
    `Wounds ${woundsText(g.hp)} · Defense ${d.defense}+ · speed ${Math.round(d.speed * TRAINING.walkMul * 10) / 10} cells/s${d.armor ? ` · armour ${d.armor}` : ''}`,
  ];
  if (g.flies) lines.push('Flies straight from pad to pad, over the maze. Never held.');
  if (d.shotMul !== undefined && d.shotMul !== 1) lines.push(`Takes ×${d.shotMul} damage from shooting`);
  if (d.meleeMul !== undefined && d.meleeMul !== 1) lines.push(`Takes ×${d.meleeMul} damage in melee`);
  if (d.big) lines.push('Held half as long.');
  lines.push(`Costs the base ${d.leak} HP if it gets through.`);
  if (g.elites) lines.push(`${g.elites} of them elites (gold outline): ×${TRAINING.wave.eliteHp} wounds, cost the base ${Math.max(d.leak, TRAINING.leak.elite)}.`);
  return lines.join('\n');
}
