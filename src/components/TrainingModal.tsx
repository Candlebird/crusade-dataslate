import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../model/store';
import type { EmblemLayer, Force } from '../model/types';
import { unitPortrait } from '../model/emblem';
import type { Category } from '../rules/data';
import { unitName } from '../rules/battle';
import { levelForXp } from '../rules/engine';
import { TRAINING, type TrainingEnemyDef, type TrainingEnemyShape } from '../rules/downtimeData';
import { raiderPool } from '../rules/raiders';
import { veteranTitle } from '../rules/sortie';
import {
  BASE, DIRECTIONS, habitNames, FX_COLOR, FX_TIME, HEAL_DESC, LEVEL_UP, ROLES, auraOf, autoCardIndex, autoPlace, autoSpend, buyHeal, buyUpgrade, canTrain, cardText, createRun, dugIn, enemyDef, fixed, liftTower, mvp, pickCard, placeProblem, placeTower, placed, previewWave, quitRun,
  reach, runXp, squadPower, startProblem, startWave, step, healCost, healProblem, levelDmg, upgradeCost, upgradeProblem, type TrainingDraw, type TrainingEnemy, type TrainingFx, type TrainingRun, type TrainingSkill,
} from '../rules/training';
import { describe } from '../rules/abilities';
import { Modal, confirmAction, toast } from './ui';
import { FeatList } from './Feats';
import { uid } from '../model/factory';
import { localDate } from '../model/date';
import { Icon } from './Icon';
import { awardFeats, trainingFeats } from '../rules/feats';
import { EmblemBadge, Portrait, drawEmblem } from './Emblem';

const STEP = 0.05;
const N = TRAINING.mapSize;
const COLORS: Record<Category, string> = {
  Hero: '#c9a24a',
  Infantry: '#6f9a4a',
  Elite: '#5fb3b3',
  'Vehicle/Monster': '#b3352b',
  Aircraft: '#8f7fd0',
  Fortification: '#8d8778',
};

/** The training sim: pick a squad, then hold the base for as many waves as it can. Only XP comes out of it. */
export default function TrainingModal({ force, onClose }: { force: Force; onClose: () => void }) {
  const { state, updateForce } = useStore();
  const trainable = force.units.filter(canTrain);
  const portraits = useMemo(() => Object.fromEntries(force.units.map((u) => [u.id, unitPortrait(u, force)])), [force]);
  const [chosen, setChosen] = useState<string[]>([]);
  const runRef = useRef<TrainingRun | null>(null);
  const powerRef = useRef(0);
  const banked = useRef(false);
  const [, setTick] = useState(0);
  const [paused, setPaused] = useState(false);
  const [fast, setFast] = useState(false);
  const [auto, setAuto] = useState(false);
  // Hide the card offer for a look at the field.
  const [peek, setPeek] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const run = runRef.current;
  const refresh = () => setTick((n) => n + 1);

  const begin = () => {
    const units = trainable.filter((u) => chosen.includes(u.id));
    runRef.current = createRun(units, Math.floor(Math.random() * 2 ** 31), raiderPool(state.books, state.forces, force));
    powerRef.current = squadPower(units);
    banked.current = false;
    setSel(runRef.current.towers[0]?.unitId ?? null);
    refresh();
  };

  // Bank the run once: XP to the units and the best score. The summary is shown, not kept.
  const bank = useCallback(() => {
    const r = runRef.current;
    if (!r || banked.current || r.wave === 0) return;
    banked.current = true;
    const xp = runXp(r);
    const gained = r.towers.filter((t) => xp[t.unitId]);
    const lead = mvp(r);
    let feats: string[] = [];
    updateForce(force.id, (f) => {
      for (const [id, n] of Object.entries(xp)) {
        const u = f.units.find((x) => x.id === id);
        if (u) u.xp += n;
      }
      if (r.cleared > (f.trainingBest ?? 0)) f.trainingBest = r.cleared;
      feats = awardFeats(f, trainingFeats(r.cleared), r.towers.map((t) => t.unitId), localDate(), uid);
    });
    const led = lead ? `${lead.name} led the way with ${lead.kills} kill${lead.kills === 1 ? '' : 's'}. ` : '';
    toast(led + (gained.length ? `Training banked: ${gained.map((t) => `${t.name} +${t.xp} XP`).join(', ')}.` : 'Training over. No XP this time.') + (feats.length ? ` ${feats.join('. ')}.` : ''));
  }, [force.id, updateForce]);

  const close = () => {
    const r = runRef.current;
    if (r && r.phase !== 'over' && r.wave > 0) {
      if (!confirmAction('End this training run? Units keep the XP they have earned so far.')) return;
      quitRun(r);
    }
    bank();
    onClose();
  };

  // The game loop: fixed steps, drawn every frame, the side panel refreshed a few times a second.
  const canvas = useRef<HTMLCanvasElement>(null);
  const live = useRef({ paused, fast, sel, auto });
  live.current = { paused, fast, sel, auto };
  useEffect(() => {
    if (!run) return;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let ui = 0;
    let phase = runRef.current?.phase;
    let idle = 0; // time spent in setup, for auto mode
    const frame = (now: number) => {
      const r = runRef.current!;
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      if (r.phase === 'wave' && !live.current.paused) {
        acc += dt * (live.current.fast ? 2 : 1);
        while (acc >= STEP) {
          step(r, STEP);
          acc -= STEP;
        }
      } else acc = 0;
      // Auto mode: spend as credits come in, and between waves take the best card, fill the map and go.
      if (live.current.auto && r.phase !== 'over') {
        if (r.phase === 'wave') autoSpend(r);
        else if ((idle += dt) > (r.offer ? AUTO_CARD_WAIT : AUTO_WAIT)) {
          idle = 0;
          if (r.offer) pickCard(r, autoCardIndex(r));
          autoPlace(r);
          autoSpend(r);
          if (!startProblem(r)) startWave(r, powerRef.current);
          setTick((n) => n + 1);
        }
      }
      if (r.phase !== 'setup') idle = 0;
      if (r.phase !== 'wave') step(r, dt); // let the last shots fade
      draw(canvas.current, r, live.current.sel, portraits);
      ui += dt;
      // A few times a second in a wave, and whenever the phase changes.
      if ((r.phase === 'wave' && ui > 0.15) || r.phase !== phase) {
        ui = 0;
        phase = r.phase;
        if (r.phase === 'over' && !banked.current) bank();
        setTick((n) => n + 1);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [run, bank]);

  if (!run) {
    const toggle = (id: string) => setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : c.length < TRAINING.squadMax ? [...c, id] : c));
    return (
      <Modal
        title="Training sim"
        onClose={onClose}
        footer={<><button onClick={onClose}>Cancel</button><button className="primary" disabled={!chosen.length} onClick={begin}>Start training</button></>}
      >
        <p className="small" style={{ marginTop: 0 }}>
          Hold the base against endless waves. Each wave favours a direction, shown before it starts. Scouts and Ambushers come from the far side.
          Kills drop credits for upgrades. Every unit still standing earns <b>+{TRAINING.xpPerWave} XP</b> every {TRAINING.xpEvery} waves cleared, up to <b>{TRAINING.xpCap} XP</b> a run.
        </p>
        <p className="muted small">
          Quirks and trinkets from Sorties count here too (not morale). Nothing else carries over: no unit becomes busy, and one that falls is only out of this run. Waves scale with the squad’s points and levels.
          {force.trainingBest ? ` Best so far: ${force.trainingBest} waves.` : ''}
        </p>
        <FeatList force={force} where="training" />
        <div className="small" style={{ marginBottom: 4 }}><b>Squad</b> ({chosen.length}/{TRAINING.squadMax})</div>
        {!trainable.length && <p className="muted small">No active units to train.</p>}
        {trainable.map((u) => (
          <label key={u.id} className="row small" style={{ gap: 6 }}>
            <input type="checkbox" checked={chosen.includes(u.id)} disabled={!chosen.includes(u.id) && chosen.length >= TRAINING.squadMax} onChange={() => toggle(u.id)} />
            <Portrait unit={u} size={22} />
            <span className="grow">
              {unitName(u)}{veteranTitle(u) ? <i className="muted">, {veteranTitle(u)}</i> : null} <span className="muted">· {u.category} · level {levelForXp(u.xp)} · {u.points} pts</span>
              {habitNames(u).length > 0 && <span className="muted"> · from Sorties: {habitNames(u).join(', ')}</span>}
            </span>
          </label>
        ))}
      </Modal>
    );
  }

  const selected = run.towers.find((t) => t.unitId === sel);
  const setup = run.phase === 'setup';

  const click = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * N);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * N);
    const there = run.towers.find((t) => placed(t) && t.x === x && t.y === y);
    if (there) return setSel(there.unitId);
    // Mid-wave only a unit that can redeploy moves, and only while it has uses left.
    const mobile = run.phase === 'wave' && !!selected?.skills.some((k) => k.effect.kind === 'redeploy');
    if (!selected || selected.dead || (!setup && !mobile)) return setSel(null);
    const p = placeProblem(run, selected.unitId, x, y);
    if (p) return toast(p, 'error');
    placeTower(run, selected.unitId, x, y);
    // Next: the first unit still on the bench.
    const next = run.towers.find((t) => !t.dead && t.x < 0);
    if (next && selected.x >= 0 && !run.wave) setSel(next.unitId);
    refresh();
  };

  const take = (i: number) => {
    pickCard(run, i);
    setPeek(false);
    refresh();
  };

  const go = () => {
    const p = startProblem(run);
    if (p) return toast(p, 'error');
    startWave(run, powerRef.current);
    setPaused(false);
    refresh();
  };

  const buy = (heal: boolean) => {
    try {
      (heal ? buyHeal : buyUpgrade)(run, selected!.unitId);
    } catch (err) {
      toast((err as Error).message, 'error');
    }
    refresh();
  };

  const lift = () => {
    try {
      liftTower(run, selected!.unitId);
    } catch (err) {
      toast((err as Error).message, 'error');
    }
    refresh();
  };

  return (
    <Modal title="Training sim" onClose={close} wide footer={
      run.phase === 'over'
        ? <><button onClick={begin}>Train again</button><button className="primary" onClick={close}>Done</button></>
        : <button onClick={close}>{run.wave ? 'End training' : 'Close'}</button>
    }>
      <div className="training">
        <div className="training-board">
          <canvas ref={canvas} width={680} height={680} onClick={click} aria-label="Training map" />
          <div className="row" style={{ marginTop: 6 }}>
            {setup && run.offer && <button className="primary" onClick={() => setPeek(false)}>Pick a card</button>}
            {setup && !run.offer && <button className="primary" disabled={!!startProblem(run)} onClick={go}>Start wave {run.wave + 1}</button>}
            {run.phase !== 'over' && (
              <button className={auto ? 'primary' : ''} title="Let the squad play itself: it takes the rarest card, fills the map toward the next wave, and spends credits on whoever is lowest." onClick={() => setAuto(!auto)}>
                Auto
              </button>
            )}
            {run.phase === 'wave' && <button onClick={() => setPaused(!paused)}>{paused ? 'Resume' : 'Pause'}</button>}
            {run.phase === 'wave' && <button className={fast ? 'primary' : ''} onClick={() => setFast(!fast)}>2×</button>}
            <span className="grow small muted" style={{ textAlign: 'right' }}>
              {setup ? `Next wave from the ${DIRECTIONS[run.dir]}.` : run.phase === 'wave' ? `Wave ${run.wave} · ${run.enemies.length + run.queue.length} enemies left` : 'Run over.'}
            </span>
            {setup && <WavePreview run={run} power={powerRef.current} />}
          </div>
        </div>

        <div className="training-side small">
          <div className="row">
            <span className="grow">Waves cleared <b>{run.cleared}</b>{force.trainingBest ? <span className="muted"> · best {Math.max(force.trainingBest, run.cleared)}</span> : null}</span>
          </div>
          <div className="row">
            <span className="grow">Base <b style={{ color: run.baseHp < TRAINING.baseHp / 3 ? 'var(--red)' : undefined }}>{run.baseHp}/{TRAINING.baseHp}</b></span>
            <span>Credits <b style={{ color: 'var(--gold)' }}>{Math.floor(run.credits)}</b></span>
          </div>

          <div style={{ margin: '8px 0 4px' }}><b>Squad</b> <span className="muted">· tap one, then a tile{setup ? '' : ' (between waves, or one that can redeploy)'}</span></div>
          {run.towers.map((t) => (
            <button
              key={t.unitId}
              className={`training-unit ${t.unitId === sel ? 'primary' : ''}`}
              disabled={t.dead}
              onClick={() => setSel(t.unitId)}
            >
              {portraits[t.unitId] ? <EmblemBadge emblem={portraits[t.unitId]} size={20} /> : <span className="swatch" style={{ background: COLORS[t.category] }} />}
              <span className="grow" style={{ textAlign: 'left' }}>{t.name}</span>
              <span className="muted">{t.dead ? 'fallen' : t.x < 0 ? 'bench' : `${Math.ceil(t.hp)}/${t.maxHp}`} · {t.xp} XP</span>
            </button>
          ))}

          {selected && !selected.dead && (
            <div className="panel" style={{ marginTop: 8, padding: 8 }}>
              <div><b>{selected.name}</b> <span className="muted">· {selected.category} · level {selected.level}</span></div>
              <div className="muted">{ROLES[selected.category]}{dugIn(run, selected) ? ' Dug in now.' : ''}</div>
              <div style={{ margin: '4px 0' }}>
                {selected.guns.map((g, i) => (
                  <div key={i}>
                    {g.name}: {Math.round(g.attacks * 10) / 10} attacks, {Math.round(reach(selected, g) * 10) / 10} tiles, {Math.max(1, g.deadly) + Math.round(g.ap) + levelDmg(selected, g)} dmg
                  </div>
                ))}
              </div>
              {selected.skills.length > 0 && (
                <div style={{ margin: '4px 0' }}>
                  {selected.skills.map((k, i) => <div key={i}>{k.gun ? `${k.gun} · ` : ''}{k.source}: {describe(k.effect)}{skillState(k)}</div>)}
                  {selected.shield > 0 && <div className="muted">Shield: {Math.ceil(selected.shield)} wounds.</div>}
                </div>
              )}
              <div className="training-ups">
                <button title={LEVEL_UP} disabled={!!upgradeProblem(run, selected.unitId)} onClick={() => buy(false)}>
                  Level up{selected.up ? ` (+${selected.up})` : ''} · {upgradeCost(selected.up)}
                </button>
                <button title={HEAL_DESC} disabled={!!healProblem(run, selected.unitId)} onClick={() => buy(true)}>
                  Heal · {healCost(run, selected.unitId)}
                </button>
              </div>
              <div className="muted">Level up: {LEVEL_UP} Heal: {HEAL_DESC}</div>
              {setup && selected.x >= 0 && !fixed(run, selected) && <button style={{ marginTop: 4 }} onClick={lift}>Back to the bench</button>}
              {setup && fixed(run, selected) && <div className="muted">Dug into its position: it can’t move again.</div>}
            </div>
          )}

          {run.cards.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <b>Cards</b>{' '}
              {run.cards.map((d, i) => {
                const c = cardText(run, d);
                return <span key={i} className={`tag ${TIER_TAG[d.rarity]}`} title={c.text}>{c.name}</span>;
              })}
            </div>
          )}

          <div className="training-log muted">
            {run.log.slice(-4).map((l, i) => <div key={i}>{l}</div>)}
          </div>
          {run.phase === 'over' && (
            <p style={{ margin: '6px 0 0' }}>
              <b>{run.cleared} wave{run.cleared === 1 ? '' : 's'} cleared.</b> {Object.keys(runXp(run)).length ? 'XP banked to the units.' : 'No XP this time.'}
            </p>
          )}
        </div>
      </div>
      {run.phase === 'over' && <RunSummary run={run} />}
      {setup && run.offer && !peek && <CardOffer run={run} offer={run.offer} auto={auto} onPick={take} onPeek={() => setPeek(true)} />}
    </Modal>
  );
}

/** Draw the map: grid, base, units, enemies, shots, and the favoured direction. */
function draw(cv: HTMLCanvasElement | null, run: TrainingRun, sel: string | null, portraits: Record<string, EmblemLayer[]>) {
  const ctx = cv?.getContext('2d');
  if (!cv || !ctx) return;
  const s = cv.width / N;
  ctx.fillStyle = '#12151a';
  ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.fillStyle = '#0c0d0f';
  ctx.fillRect(0, 0, cv.width, s);
  ctx.fillRect(0, cv.height - s, cv.width, s);
  ctx.fillRect(0, 0, s, cv.height);
  ctx.fillRect(cv.width - s, 0, s, cv.height);
  ctx.strokeStyle = '#232830';
  ctx.lineWidth = 1;
  for (let i = 1; i < N; i++) {
    ctx.beginPath(); ctx.moveTo(i * s, 0); ctx.lineTo(i * s, cv.height); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * s); ctx.lineTo(cv.width, i * s); ctx.stroke();
  }

  // Cover: raised ground, shots over it are at -2 to hit.
  for (const c of run.cover) {
    ctx.fillStyle = '#3a3428';
    ctx.fillRect(c.x * s + 1, c.y * s + 1, s - 2, s - 2);
    ctx.strokeStyle = '#6b5d3f';
    ctx.lineWidth = 1;
    ctx.strokeRect(c.x * s + 2.5, c.y * s + 2.5, s - 5, s - 5);
    ctx.beginPath();
    ctx.moveTo(c.x * s + s * 0.2, c.y * s + s * 0.7); ctx.lineTo(c.x * s + s * 0.4, c.y * s + s * 0.35);
    ctx.lineTo(c.x * s + s * 0.6, c.y * s + s * 0.6); ctx.lineTo(c.x * s + s * 0.8, c.y * s + s * 0.3);
    ctx.stroke();
  }

  // The favoured direction: a wedge of the edge and an arrow pointing in.
  const a = (run.dir * 45 * Math.PI) / 180;
  const cx = BASE.x * s;
  const cy = BASE.y * s;
  ctx.save();
  ctx.fillStyle = run.phase === 'setup' ? 'rgba(179,53,43,0.16)' : 'rgba(179,53,43,0.08)';
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  const arc = (TRAINING.arc * Math.PI) / 180;
  ctx.arc(cx, cy, cv.width, a - Math.PI / 2 - arc, a - Math.PI / 2 + arc);
  ctx.closePath();
  ctx.fill();
  ctx.translate(cx + Math.sin(a) * (N / 2 - 1.4) * s, cy - Math.cos(a) * (N / 2 - 1.4) * s);
  ctx.rotate(a);
  ctx.fillStyle = '#b3352b';
  ctx.beginPath();
  ctx.moveTo(0, s * 0.7); ctx.lineTo(-s * 0.55, -s * 0.3); ctx.lineTo(s * 0.55, -s * 0.3);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Base.
  ctx.fillStyle = '#2a3442';
  ctx.strokeStyle = '#5fb3b3';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx, cy, BASE.radius * s, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  bar(ctx, cx - s * 0.6, cy + s * 0.8, s * 1.2, run.baseHp / TRAINING.baseHp, '#5fb3b3');

  // Reach of the selected unit.
  const st = run.towers.find((t) => t.unitId === sel && placed(t));
  if (st) {
    const tx = (st.x + 0.5) * s;
    const ty = (st.y + 0.5) * s;
    ctx.setLineDash([4, 4]);
    for (const r of new Set(st.guns.map((g) => reach(st, g)))) {
      ctx.strokeStyle = 'rgba(201,162,74,0.55)';
      ctx.beginPath(); ctx.arc(tx, ty, r * s, 0, Math.PI * 2); ctx.stroke();
    }
    if (st.category === 'Hero') {
      ctx.strokeStyle = 'rgba(111,154,74,0.6)';
      ctx.beginPath(); ctx.arc(tx, ty, (auraOf(st) + 0.5) * s, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  // Units.
  for (const t of run.towers) {
    if (!placed(t)) continue;
    const x = t.x * s;
    const y = t.y * s;
    ctx.fillStyle = COLORS[t.category];
    ctx.globalAlpha = t.category === 'Aircraft' ? 0.75 : 1;
    ctx.fillRect(x + s * 0.12, y + s * 0.12, s * 0.76, s * 0.76);
    const face = portraits[t.unitId];
    if (face) drawEmblem(ctx, face, x + s * 0.17, y + s * 0.15, s * 0.66);
    ctx.globalAlpha = 1;
    if (dugIn(run, t)) { ctx.strokeStyle = '#d9d4c7'; ctx.lineWidth = 1; ctx.strokeRect(x + s * 0.06, y + s * 0.06, s * 0.88, s * 0.88); }
    if (t.unitId === sel) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(x + s * 0.04, y + s * 0.04, s * 0.92, s * 0.92); }
    if (!face) {
      ctx.fillStyle = '#0c0d0f';
      ctx.font = `bold ${Math.round(s * 0.42)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(t.name.slice(0, 1).toUpperCase(), x + s / 2, y + s / 2 + 1);
    }
    bar(ctx, x + s * 0.1, y + s * 0.9, s * 0.8, t.hp / t.maxHp, '#6f9a4a');
    if (t.shield > 0) { ctx.strokeStyle = FX_COLOR.shield; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x + s / 2, y + s / 2, s * 0.58, 0, Math.PI * 2); ctx.stroke(); }
  }

  // Enemies.
  for (const e of run.enemies) {
    const d = enemyDef(run, e);
    enemyShape(ctx, d.shape, e.x * s, e.y * s, d.size * s, Math.atan2(BASE.y - e.y, BASE.x - e.x), d.color, e.vet);
    const tint = statusTint(e);
    if (tint) { ctx.strokeStyle = tint; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(e.x * s, e.y * s, d.size * s + 3, 0, Math.PI * 2); ctx.stroke(); }
    if (e.hp < e.maxHp) bar(ctx, e.x * s - d.size * s, e.y * s - d.size * s - 5, d.size * s * 2, e.hp / e.maxHp, '#b3352b');
  }

  // Shots, blows and saves.
  for (const f of run.fx) {
    ctx.strokeStyle = f.color;
    ctx.globalAlpha = Math.min(1, f.t / 0.1) * (f.miss ? 0.45 : 1);
    if (f.kind === 'pulse') ring(ctx, f, s);
    else if (f.saved) shield(ctx, f, s);
    else if (f.melee) slash(ctx, f, s);
    else {
      ctx.lineWidth = f.kind === 'bolt' ? 3 : 2;
      if (f.kind === 'heal') ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(f.x1 * s, f.y1 * s); ctx.lineTo(f.x2 * s, f.y2 * s); ctx.stroke();
      ctx.setLineDash([]);
      if (f.blocked) {
        // A puff of dust where the cover took the shot.
        ctx.globalAlpha = Math.min(1, f.t / 0.1);
        ctx.fillStyle = '#b8a27a';
        ctx.beginPath(); ctx.arc(f.x2 * s, f.y2 * s, s * 0.14, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  ctx.globalAlpha = 1;

  if (run.phase === 'over') {
    ctx.fillStyle = 'rgba(12,13,15,0.6)';
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = '#c9a24a';
    ctx.font = `bold ${Math.round(s * 1.1)}px serif`;
    ctx.textAlign = 'center';
    ctx.fillText(`${run.cleared} wave${run.cleared === 1 ? '' : 's'} cleared`, cx, cy);
  }
}

const AUTO_WAIT = 1.2;
const AUTO_CARD_WAIT = 2.6;
const TIER_TAG: Record<TrainingDraw['rarity'], string> = { Common: '', Rare: 'red', Legendary: 'gold' };

/** The cards on offer between waves: they rise up from below the screen, one after another, and glow by rarity. */
function CardOffer({ run, offer, auto, onPick, onPeek }: { run: TrainingRun; offer: TrainingDraw[]; auto: boolean; onPick: (i: number) => void; onPeek: () => void }) {
  const best = autoCardIndex(run);
  const top = offer.some((d) => d.rarity === 'Legendary') ? 'legendary' : offer.some((d) => d.rarity === 'Rare') ? 'rare' : 'common';
  return (
    <div className={`training-cards ${top}`} role="dialog" aria-label="Choose a card">
      <div className="training-cards-title">
        <div className="training-cards-kicker">Wave {run.wave} cleared</div>
        <h2>Choose a boon</h2>
      </div>
      <div className="training-cards-row">
        {offer.map((d, i) => {
          const c = cardText(run, d);
          const unit = run.towers.find((t) => t.unitId === d.unitId);
          return (
            <button
              key={i}
              className={`training-card ${d.rarity.toLowerCase()}${auto && i === best ? ' chosen' : ''}`}
              style={{ animationDelay: `${0.15 + i * 0.18}s` }}
              disabled={auto}
              onClick={() => onPick(i)}
            >
              <span className="training-card-shine" aria-hidden />
              <span className={`tag ${TIER_TAG[d.rarity]}`}>{d.rarity}</span>
              <span className="training-card-name">{c.name}</span>
              {unit && <span className="training-card-unit"><span className="swatch" style={{ background: COLORS[unit.category] }} /> {unit.name}</span>}
              <span className="training-card-text">{c.text}</span>
            </button>
          );
        })}
      </div>
      {auto ? <div className="muted small">Auto takes the rarest card…</div> : <button className="small" onClick={onPeek}>Look at the field first</button>}
    </div>
  );
}

/** How each unit did over the run, the standout starred. */
function RunSummary({ run }: { run: TrainingRun }) {
  const lead = mvp(run);
  const n = (x: number) => Math.round(x);
  return (
    <div className="training-summary small">
      <div style={{ marginBottom: 4 }}>
        <b>Run summary</b>
        {lead && <span className="muted"> · {lead.name} led the exercise</span>}
      </div>
      <table>
        <thead>
          <tr><th>Unit</th><th title="Enemies it finished off">Kills</th><th title="Wounds it dealt">Damage</th><th title="Hits it saved with its Defense">Saves</th><th title="Wounds it took">Taken</th><th>XP</th></tr>
        </thead>
        <tbody>
          {[...run.towers].sort((a, b) => b.kills - a.kills || b.dealt - a.dealt).map((t) => (
            <tr key={t.unitId} className={t === lead ? 'mvp' : ''}>
              <td>{t === lead ? <><Icon name="g:round-star" /> </> : null}{t.name}{t.dead ? <span className="muted"> (fell)</span> : null}</td>
              <td>{t.kills}</td>
              <td>{n(t.dealt)}</td>
              <td>{n(t.saved)}</td>
              <td>{n(t.taken)}</td>
              <td>{t.xp}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** An enemy's outline, by role, turned to face the way it's heading (toward the base). A veteran's is edged in gold. */
/** What the next wave sends, one icon a kind with a count; hover for what it is. */
function WavePreview({ run, power }: { run: TrainingRun; power: number }) {
  const groups = new Map<string, { def: TrainingEnemyDef; n: number; vets: number; hp: number }>();
  for (const s of previewWave(run, power)) {
    const key = `${s.kind}:${s.mk ?? ''}`;
    const g = groups.get(key) ?? { def: enemyDef(run, s), n: 0, vets: 0, hp: 0 };
    g.n += 1;
    if (s.vet) g.vets += 1;
    else g.hp = s.hp;
    groups.set(key, g);
  }
  return (
    <span className="row" style={{ gap: 8, flexWrap: 'wrap' }} aria-label="Next wave's enemies">
      {[...groups].map(([key, g]) => (
        <span key={key} title={enemyRundown(g.def, g)} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, cursor: 'help' }}>
          <EnemyIcon def={g.def} vet={g.vets > 0} />
          <span className="small">×{g.n}</span>
        </span>
      ))}
    </span>
  );
}

function EnemyIcon({ def, vet }: { def: TrainingEnemyDef; vet: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 48, 48);
    enemyShape(ctx, def.shape, 24, 24, 13, 0, def.color, vet);
  }, [def, vet]);
  return <canvas ref={ref} width={48} height={48} style={{ width: 24, height: 24 }} />;
}

/** A hover rundown of an enemy kind: what it does, its numbers this wave, and how many come as veterans. */
function enemyRundown(d: TrainingEnemyDef, g: { n: number; vets: number; hp: number }): string {
  const hp = Math.round(g.hp || (d.hp * TRAINING.enemyHp));
  const lines = [
    `${d.name} ×${g.n}: ${d.desc}`,
    `Wounds ${hp} · speed ${d.speed} tiles/s${d.armor ? ` · armour ${d.armor}` : ''}`,
    `Melee: ${d.attacks} attack${d.attacks === 1 ? '' : 's'}, hits on ${d.quality}+${d.ap ? `, AP(${d.ap})` : ''}`,
  ];
  if (d.gun) lines.push(`Shoots: ${d.gun.attacks} attack${d.gun.attacks === 1 ? '' : 's'}, range ${d.gun.range}${d.gun.ap ? `, AP(${d.gun.ap})` : ''}`);
  if (d.shotMul !== undefined && d.shotMul !== 1) lines.push(`Takes ×${d.shotMul} damage from shooting`);
  if (d.meleeMul !== undefined && d.meleeMul !== 1) lines.push(`Takes ×${d.meleeMul} damage in melee`);
  if (d.spawn === 'scout') lines.push('Comes in from the far side as the wave starts.');
  if (d.spawn === 'ambush') lines.push('Appears mid-wave, close in on the far side.');
  if (d.spawn === 'boss') lines.push('The Echo Lord: a boss.');
  if (g.vets) lines.push(`${g.vets} of them veterans: ×${TRAINING.vet.hp} wounds, +${TRAINING.vet.hit} to hit, +${TRAINING.vet.ap} AP.`);
  return lines.join('\n');
}

function enemyShape(ctx: CanvasRenderingContext2D, shape: TrainingEnemyShape, x: number, y: number, r: number, facing: number, color: string, vet?: boolean) {
  // Points of a regular polygon, or a star alternating between two radii.
  const ring = (n: number, r1: number, r2 = r1, turn = 0) =>
    Array.from({ length: n * (r2 === r1 ? 1 : 2) }, (_, i) => {
      const a = turn + (i * Math.PI * 2) / (n * (r2 === r1 ? 1 : 2));
      const rr = r2 === r1 || i % 2 === 0 ? r1 : r2;
      return [Math.cos(a) * rr, Math.sin(a) * rr];
    });
  const pts: Record<TrainingEnemyShape, number[][]> = {
    dart: [[r * 1.2, 0], [-r * 0.8, r * 0.75], [-r * 0.4, 0], [-r * 0.8, -r * 0.75]],
    diamond: [[r * 1.1, 0], [0, r * 0.8], [-r * 1.1, 0], [0, -r * 0.8]],
    pentagon: ring(5, r * 1.05),
    chevron: [[r * 1.2, 0], [-r * 0.6, r * 0.95], [-r * 0.15, 0], [-r * 0.6, -r * 0.95]],
    hexagon: ring(6, r * 1.05),
    shield: [[r * 1.15, 0], [r * 0.25, r * 0.95], [-r * 0.85, r * 0.85], [-r * 0.85, -r * 0.85], [r * 0.25, -r * 0.95]],
    star: ring(4, r * 1.25, r * 0.45),
    spikes: ring(8, r * 1.15, r * 0.75),
    crown: ring(6, r * 1.15, r * 0.7, Math.PI / 6),
  };
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(facing);
  ctx.fillStyle = color;
  ctx.beginPath();
  pts[shape].forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
  ctx.closePath();
  ctx.fill();
  // Armour shows as a thick dark rim, a mirrored hide as a bright one; the boss gets a gold one.
  if (shape === 'hexagon' || shape === 'crown' || shape === 'shield') {
    ctx.strokeStyle = shape === 'crown' ? '#c9a24a' : shape === 'shield' ? '#f2fbff' : '#2a3038';
    ctx.lineWidth = Math.max(2, r * 0.18);
    ctx.stroke();
  }
  if (vet) {
    ctx.strokeStyle = '#e8c55a';
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 2]);
    ctx.beginPath(); ctx.arc(0, 0, r + 6, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
}

/** A blow: a curved swipe across the target from the striker's side, sweeping through as it fades, with sparks. */
/** A skill's clock or uses left, for the unit panel. */
function skillState(k: TrainingSkill): string {
  if (k.effect.kind === 'redeploy') return ` (${k.uses} left this wave)`;
  if (!('every' in k.effect)) return '';
  return k.cd > 0 ? ` (ready in ${Math.ceil(k.cd)}s)` : ' (ready)';
}

/** The colour of the status that shows on an enemy, worst first. */
const TINTS: [keyof TrainingEnemy['status'], string][] = [['stun', '#ffe066'], ['slow', '#5ab0ff'], ['daze', FX_COLOR.field], ['mark', '#ff5ad1'], ['bleed', '#d0303a']];
const statusTint = (e: TrainingEnemy) => TINTS.find(([k]) => e.status[k])?.[1];

/** A ring swelling out to its radius as it fades. */
function ring(ctx: CanvasRenderingContext2D, f: TrainingFx, s: number) {
  const k = 1 - f.t / FX_TIME.pulse;
  ctx.globalAlpha = 0.7 * (1 - k);
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(f.x1 * s, f.y1 * s, Math.max(1, (f.r ?? 1) * s * (0.3 + 0.7 * k)), 0, Math.PI * 2); ctx.stroke();
}

function slash(ctx: CanvasRenderingContext2D, f: TrainingFx, s: number) {
  const a = Math.atan2(f.y2 - f.y1, f.x2 - f.x1);
  const done = 1 - f.t / FX_TIME.melee;
  const r = s * 0.38;
  const from = a + Math.PI - 1.2;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(f.x2 * s, f.y2 * s, r, from, from + 2.4 * Math.min(1, done * 2.5));
  ctx.stroke();
  ctx.lineWidth = 1.5;
  for (const k of [-0.6, 0, 0.6]) {
    const d = a + k;
    const r1 = s * (0.1 + done * 0.15);
    ctx.beginPath();
    ctx.moveTo(f.x2 * s + Math.cos(d) * r1, f.y2 * s + Math.sin(d) * r1);
    ctx.lineTo(f.x2 * s + Math.cos(d) * (r1 + s * 0.14), f.y2 * s + Math.sin(d) * (r1 + s * 0.14));
    ctx.stroke();
  }
  ctx.lineCap = 'butt';
}

/** Hits a unit shrugged off: a blue ring that swells out round it as it fades, with the count when more than one. */
function shield(ctx: CanvasRenderingContext2D, f: TrainingFx, s: number) {
  const done = 1 - f.t / FX_TIME.save;
  const r = s * (0.55 + done * 0.2);
  ctx.globalAlpha = 1 - done * 0.8;
  ctx.fillStyle = 'rgba(90,176,255,0.18)';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(f.x1 * s, f.y1 * s, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  if (f.saved! > 1) {
    ctx.fillStyle = f.color;
    ctx.font = `bold ${Math.round(s * 0.32)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(`×${f.saved}`, f.x1 * s + r * 0.75, f.y1 * s - r * 0.75);
  }
}

function bar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, share: number, color: string) {
  ctx.fillStyle = '#000';
  ctx.fillRect(x, y, w, 4);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w * Math.max(0, Math.min(1, share)), 4);
}
