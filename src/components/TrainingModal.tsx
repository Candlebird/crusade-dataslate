import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '../model/store';
import { uid } from '../model/factory';
import { localDate } from '../model/date';
import type { Force } from '../model/types';
import type { Category } from '../rules/data';
import { unitName } from '../rules/battle';
import { levelForXp } from '../rules/engine';
import { TRAINING, TRAINING_ENEMIES } from '../rules/downtimeData';
import {
  BASE, DIRECTIONS, FX_TIME, ROLES, UPGRADES, auraOf, buyUpgrade, canTrain, createRun, dugIn, fixed, liftTower, placeProblem, placeTower, placed, quitRun,
  reach, runXp, squadPower, startProblem, startWave, step, upgradeCost, upgradeProblem, type TrainingFx, type TrainingRun, type UpgradeKind,
} from '../rules/training';
import { Modal, confirmAction, toast } from './ui';

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
  const { updateForce } = useStore();
  const trainable = force.units.filter(canTrain);
  const [chosen, setChosen] = useState<string[]>(trainable.slice(0, TRAINING.squadMax).map((u) => u.id));
  const runRef = useRef<TrainingRun | null>(null);
  const powerRef = useRef(0);
  const banked = useRef(false);
  const [, setTick] = useState(0);
  const [paused, setPaused] = useState(false);
  const [fast, setFast] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const run = runRef.current;
  const refresh = () => setTick((n) => n + 1);

  const begin = () => {
    const units = trainable.filter((u) => chosen.includes(u.id));
    runRef.current = createRun(units, Math.floor(Math.random() * 2 ** 31));
    powerRef.current = squadPower(units);
    banked.current = false;
    setSel(runRef.current.towers[0]?.unitId ?? null);
    refresh();
  };

  // Bank the run once: XP to the units, a ledger line, and the best score.
  const bank = useCallback(() => {
    const r = runRef.current;
    if (!r || banked.current || r.wave === 0) return;
    banked.current = true;
    const xp = runXp(r);
    const gained = r.towers.filter((t) => xp[t.unitId]);
    updateForce(force.id, (f) => {
      for (const [id, n] of Object.entries(xp)) {
        const u = f.units.find((x) => x.id === id);
        if (u) u.xp += n;
      }
      f.ledger.push({
        id: uid(), date: localDate(), rp: 0, supply: 0,
        label: `Training: ${r.cleared} wave${r.cleared === 1 ? '' : 's'} cleared${gained.length ? ` (${gained.map((t) => `${t.name} +${t.xp} XP`).join(', ')})` : ''}`,
      });
      if (r.cleared > (f.trainingBest ?? 0)) f.trainingBest = r.cleared;
    });
    toast(gained.length ? `Training banked: ${gained.map((t) => `${t.name} +${t.xp} XP`).join(', ')}.` : 'Training over. No XP this time.');
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
  const live = useRef({ paused, fast, sel });
  live.current = { paused, fast, sel };
  useEffect(() => {
    if (!run) return;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let ui = 0;
    let phase = runRef.current?.phase;
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
      if (r.phase !== 'wave') step(r, dt); // let the last shots fade
      draw(canvas.current, r, live.current.sel);
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
          Nothing else carries over: no unit becomes busy, and one that falls is only out of this run. Waves scale with the squad’s points and levels.
          {force.trainingBest ? ` Best so far: ${force.trainingBest} waves.` : ''}
        </p>
        <div className="small" style={{ marginBottom: 4 }}><b>Squad</b> ({chosen.length}/{TRAINING.squadMax})</div>
        {!trainable.length && <p className="muted small">No active units to train.</p>}
        {trainable.map((u) => (
          <label key={u.id} className="row small" style={{ gap: 6 }}>
            <input type="checkbox" checked={chosen.includes(u.id)} disabled={!chosen.includes(u.id) && chosen.length >= TRAINING.squadMax} onChange={() => toggle(u.id)} />
            <span className="grow">{unitName(u)} <span className="muted">· {u.category} · level {levelForXp(u.xp)} · {u.points} pts</span></span>
          </label>
        ))}
      </Modal>
    );
  }

  const selected = run.towers.find((t) => t.unitId === sel);
  const cost = upgradeCost(run.bought);
  const setup = run.phase === 'setup';

  const click = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * N);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * N);
    const there = run.towers.find((t) => placed(t) && t.x === x && t.y === y);
    if (there) return setSel(there.unitId);
    if (!selected || selected.dead || !setup) return setSel(null);
    const p = placeProblem(run, selected.unitId, x, y);
    if (p) return toast(p, 'error');
    placeTower(run, selected.unitId, x, y);
    // Next: the first unit still on the bench.
    const next = run.towers.find((t) => !t.dead && t.x < 0);
    if (next && selected.x >= 0 && !run.wave) setSel(next.unitId);
    refresh();
  };

  const go = () => {
    const p = startProblem(run);
    if (p) return toast(p, 'error');
    startWave(run, powerRef.current);
    setPaused(false);
    refresh();
  };

  const buy = (k: UpgradeKind) => {
    try {
      buyUpgrade(run, selected!.unitId, k);
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
            {setup && <button className="primary" disabled={!!startProblem(run)} onClick={go}>Start wave {run.wave + 1}</button>}
            {run.phase === 'wave' && <button onClick={() => setPaused(!paused)}>{paused ? 'Resume' : 'Pause'}</button>}
            {run.phase === 'wave' && <button className={fast ? 'primary' : ''} onClick={() => setFast(!fast)}>2×</button>}
            <span className="grow small muted" style={{ textAlign: 'right' }}>
              {setup ? `Next wave from the ${DIRECTIONS[run.dir]}.` : run.phase === 'wave' ? `Wave ${run.wave} · ${run.enemies.length + run.queue.length} enemies left` : 'Run over.'}
            </span>
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

          <div style={{ margin: '8px 0 4px' }}><b>Squad</b> <span className="muted">· tap one, then a tile{setup ? '' : ' (between waves)'}</span></div>
          {run.towers.map((t) => (
            <button
              key={t.unitId}
              className={`training-unit ${t.unitId === sel ? 'primary' : ''}`}
              disabled={t.dead}
              onClick={() => setSel(t.unitId)}
            >
              <span className="swatch" style={{ background: COLORS[t.category] }} />
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
                    {g.name}: {Math.round(g.attacks * 10) / 10} attacks, {Math.round(reach(selected, g) * 10) / 10} tiles, {Math.max(1, g.deadly) + Math.round(g.ap) + selected.up.dmg} dmg
                  </div>
                ))}
              </div>
              <div className="training-ups">
                {(Object.keys(UPGRADES) as UpgradeKind[]).map((k) => (
                  <button key={k} title={UPGRADES[k].desc} disabled={!!upgradeProblem(run, selected.unitId)} onClick={() => buy(k)}>
                    {UPGRADES[k].name}{selected.up[k] ? ` (${selected.up[k]})` : ''}
                  </button>
                ))}
              </div>
              <div className="muted">Next upgrade: {cost} credits.</div>
              {setup && selected.x >= 0 && !fixed(run, selected) && <button style={{ marginTop: 4 }} onClick={lift}>Back to the bench</button>}
              {setup && fixed(run, selected) && <div className="muted">Dug into its position: it can’t move again.</div>}
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
    </Modal>
  );
}

/** Draw the map: grid, base, units, enemies, shots, and the favoured direction. */
function draw(cv: HTMLCanvasElement | null, run: TrainingRun, sel: string | null) {
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
    ctx.globalAlpha = 1;
    if (dugIn(run, t)) { ctx.strokeStyle = '#d9d4c7'; ctx.lineWidth = 1; ctx.strokeRect(x + s * 0.06, y + s * 0.06, s * 0.88, s * 0.88); }
    if (t.unitId === sel) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(x + s * 0.04, y + s * 0.04, s * 0.92, s * 0.92); }
    ctx.fillStyle = '#0c0d0f';
    ctx.font = `bold ${Math.round(s * 0.42)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(t.name.slice(0, 1).toUpperCase(), x + s / 2, y + s / 2 + 1);
    bar(ctx, x + s * 0.1, y + s * 0.9, s * 0.8, t.hp / t.maxHp, '#6f9a4a');
  }

  // Enemies.
  for (const e of run.enemies) {
    const d = TRAINING_ENEMIES[e.kind];
    ctx.fillStyle = d.color;
    ctx.beginPath(); ctx.arc(e.x * s, e.y * s, d.size * s, 0, Math.PI * 2); ctx.fill();
    if (e.hp < e.maxHp) bar(ctx, e.x * s - d.size * s, e.y * s - d.size * s - 5, d.size * s * 2, e.hp / e.maxHp, '#b3352b');
  }

  // Shots, blows and saves.
  for (const f of run.fx) {
    ctx.strokeStyle = f.color;
    ctx.globalAlpha = Math.min(1, f.t / 0.1) * (f.miss ? 0.45 : 1);
    if (f.saved) shield(ctx, f, s);
    else if (f.melee) slash(ctx, f, s);
    else {
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(f.x1 * s, f.y1 * s); ctx.lineTo(f.x2 * s, f.y2 * s); ctx.stroke();
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

/** A blow: a curved swipe across the target from the striker's side, sweeping through as it fades, with sparks. */
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
