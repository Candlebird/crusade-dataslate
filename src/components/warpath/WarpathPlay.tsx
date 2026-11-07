import { useEffect, useRef, useState } from 'react';
import {
  bossesOf, bossName, botInput, botPick, cardText, choose, clock, HERO_POWERS, heroCooldown, reroll, ROLES, roleOf, skip, step, WARPATH, xpNeed, type Input, type PowerId, type SquadRole, type WarpathRun,
} from '../../rules/warpath';
import { Icon } from '../Icon';
import { RoleBadge, roleTint } from './RoleBadge';
import { DoctrineSlots, WarpathBuild } from './WarpathBuild';
import { checkSprites, drawWarpath, resetSprites, type Palette, type View } from './draw';

// The run on screen: a full-screen canvas, the HUD, the level-up cards and the pause menu. The sim steps at a fixed 60 a
// second from a requestAnimationFrame loop; the canvas redraws every frame and the HUD ten times a second.

const ZOOM_KEY = 'warpath-zoom';
/** Inches across the screen's long side: up to `max` on a phone, `wide` on a desktop (a mouse to point with). */
const ZOOM = { min: 48, max: 72, wide: 90, start: 60 };
const zoomMax = () => (typeof window !== 'undefined' && window.matchMedia?.('(pointer: fine)').matches ? ZOOM.wide : ZOOM.max);
/** Most sim steps a frame (a slow frame plays a little slower rather than jumping). */
const MAX_STEPS = 6;
const STICK = 56;

function readZoom(): number {
  try {
    const z = Number(localStorage.getItem(ZOOM_KEY));
    return z >= ZOOM.min && z <= zoomMax() ? z : ZOOM.start;
  } catch {
    return ZOOM.start;
  }
}

interface Hud { hp: number; maxHp: number; xp: number; need: number; level: number; t: number; kills: number; points: number; bosses: number; boss?: { name: string; share: number; lord: boolean }; squads: { id: string; name: string; role: SquadRole; share: number; away: boolean; level: number }[]; power: { power: PowerId; left: number } }

const hudOf = (run: WarpathRun): Hud => {
  const b = run.enemies.find((e) => e.boss === 'lord') ?? run.enemies.find((e) => e.boss);
  return {
    hp: run.hp, maxHp: run.maxHp, xp: run.xp, need: xpNeed(run.level), level: run.level, t: run.t, kills: run.kills, points: run.points, bosses: bossesOf(run),
    squads: run.squads.slice(1).map((s) => ({
      id: s.unitId, name: s.name, role: roleOf(s), level: s.level, away: !!s.reserve || !!s.fort?.down,
      share: s.fort ? s.fort.hp / Math.max(1, s.fort.maxHp) : s.alive / s.size,
    })),
    power: heroCooldown(run),
    boss: b && { name: `${bossName(run, b)}${b.boss === 'lord' ? ' (Echo Lord)' : ' (captain)'}`, share: b.hp / b.maxHp, lord: b.boss === 'lord' },
  };
};

export interface PlayProps {
  run: WarpathRun;
  palette: Palette;
  /** Debug: the bot plays (banks nothing). */
  auto: boolean;
  onAuto?: () => void;
  /** Save now (a level-up opened, every minute, pausing). */
  onSave: (run: WarpathRun) => void;
  onOver: (run: WarpathRun) => void;
  /** Leave and keep the run saved. */
  onLeave: (run: WarpathRun) => void;
  /** Give up the run (it ends as if the hero fell). */
  onQuit: (run: WarpathRun) => void;
}

export function WarpathPlay({ run, palette, auto, onAuto, onSave, onOver, onLeave, onQuit }: PlayProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const keys = useRef(new Set<string>());
  const actRef = useRef(false);
  const stick = useRef<{ id: number; ox: number; oy: number; dx: number; dy: number } | null>(null);
  const [stickView, setStickView] = useState<{ ox: number; oy: number; dx: number; dy: number } | null>(null);
  const [paused, setPaused] = useState(false);
  const [build, setBuild] = useState(false);
  const buildRef = useRef(false);
  buildRef.current = build;
  const pausedRef = useRef(false);
  pausedRef.current = paused || build;
  const autoRef = useRef(auto);
  autoRef.current = auto;
  const [hud, setHud] = useState(() => hudOf(run));
  const [phase, setPhase] = useState(run.phase);
  const [, bump] = useState(0);
  const [peek, setPeek] = useState(false);
  const [quitting, setQuitting] = useState(false);
  const zoom = useRef(readZoom());
  const cbs = useRef({ onSave, onOver });
  cbs.current = { onSave, onOver };

  // Keys: WASD and arrows move, Space is the hero's button, P or Escape pauses, B shows the build.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'b' && run.phase !== 'over') {
        e.preventDefault();
        setBuild((b) => !b);
        return;
      }
      if (k === 'p' || k === 'escape') {
        e.preventDefault();
        e.stopPropagation();
        if (buildRef.current) setBuild(false);
        else if (run.phase === 'play') setPaused((p) => !p);
        return;
      }
      if (k === ' ' && run.phase !== 'play') return;
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) {
        e.preventDefault();
        keys.current.add(k);
      }
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    const blur = () => keys.current.clear();
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down, true);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, [run]);

  // The page behind doesn't scroll while the run is up.
  useEffect(() => {
    const was = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = was; };
  }, []);

  // The tab hidden: pause and save.
  useEffect(() => {
    const vis = () => {
      if (document.hidden && run.phase !== 'over') {
        setPaused(true);
        cbs.current.onSave(run);
      }
    };
    document.addEventListener('visibilitychange', vis);
    return () => document.removeEventListener('visibilitychange', vis);
  }, [run]);

  // The loop.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let hudAt = 0;
    let saveAt = run.t + WARPATH.cloudEvery;
    const cam = { x: run.hx, y: run.hy };
    const input = (): Input => {
      if (autoRef.current) return botInput(run);
      const k = keys.current;
      let dx = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0);
      let dy = (k.has('s') || k.has('arrowdown') ? 1 : 0) - (k.has('w') || k.has('arrowup') ? 1 : 0);
      const s = stick.current;
      if (s && Math.hypot(s.dx, s.dy) > 6) {
        dx = s.dx / STICK;
        dy = s.dy / STICK;
      }
      return { dx, dy, act: k.has(' ') || actRef.current };
    };
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (run.phase === 'card' && autoRef.current) {
        choose(run, botPick(run));
        bump((n) => n + 1);
      }
      if (!pausedRef.current && run.phase === 'play') {
        acc += dt;
        let n = 0;
        while (acc >= WARPATH.step && n < MAX_STEPS && run.phase === 'play') {
          step(run, input());
          acc -= WARPATH.step;
          n++;
        }
        if (n >= MAX_STEPS) acc = 0;
        const ph = run.phase as WarpathRun['phase'];
        if (ph === 'card') {
          setPhase('card');
          setPeek(false);
          cbs.current.onSave(run);
        } else if (ph === 'over') {
          setPhase('over');
          setHud(hudOf(run));
          cbs.current.onOver(run);
        } else if (run.t >= saveAt) {
          saveAt = run.t + WARPATH.cloudEvery;
          cbs.current.onSave(run);
        }
      } else {
        // Floating numbers still fade while paused on a card.
        for (const f of run.fx) f.t -= dt * 0.25;
      }
      const c = canvas.current;
      if (!c) return;
      const w = c.clientWidth;
      const h = c.clientHeight;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
        c.width = Math.round(w * dpr);
        c.height = Math.round(h * dpr);
      }
      const ctx = c.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // The camera eases after the hero (a snap if it's far).
      const k = Math.min(1, dt * 10);
      cam.x += (run.hx - cam.x) * k;
      cam.y += (run.hy - cam.y) * k;
      if (Math.hypot(run.hx - cam.x, run.hy - cam.y) > 20) { cam.x = run.hx; cam.y = run.hy; }
      const view: View = { cx: cam.x, cy: cam.y, ppi: Math.max(w, h) / zoom.current, w, h };
      drawWarpath(ctx, run, view, palette, now / 1000);
      if (now - hudAt > 100) {
        hudAt = now;
        checkSprites();
        setHud(hudOf(run));
      }
    };
    raf = requestAnimationFrame(frame);
    // A canvas whose pixels the browser dropped comes back blank: redraw the sprite caches from scratch.
    const c0 = canvas.current;
    c0?.addEventListener('contextrestored', resetSprites);
    return () => {
      cancelAnimationFrame(raf);
      c0?.removeEventListener('contextrestored', resetSprites);
    };
  }, [run, palette]);

  // Zoom with the wheel or a pinch (two pointers).
  const onWheel = (e: React.WheelEvent) => {
    zoom.current = Math.max(ZOOM.min, Math.min(zoomMax(), zoom.current + Math.sign(e.deltaY) * 3));
    try { localStorage.setItem(ZOOM_KEY, String(zoom.current)); } catch { /* not kept */ }
  };

  // The thumbstick: anchored wherever the press lands, drag to move.
  const onDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    stick.current = { id: e.pointerId, ox: e.clientX, oy: e.clientY, dx: 0, dy: 0 };
    setStickView({ ox: e.clientX, oy: e.clientY, dx: 0, dy: 0 });
  };
  const onMove = (e: React.PointerEvent) => {
    const s = stick.current;
    if (!s || s.id !== e.pointerId) return;
    let dx = e.clientX - s.ox;
    let dy = e.clientY - s.oy;
    const d = Math.hypot(dx, dy);
    if (d > STICK) {
      // The stick stays where it was pressed; past the rim the knob just pins to the edge.
      dx = (dx / d) * STICK;
      dy = (dy / d) * STICK;
    }
    s.dx = dx;
    s.dy = dy;
    setStickView({ ox: s.ox, oy: s.oy, dx, dy });
  };
  const onUp = (e: React.PointerEvent) => {
    if (stick.current?.id !== e.pointerId) return;
    stick.current = null;
    setStickView(null);
  };

  const act = (f: () => void) => () => {
    f();
    bump((n) => n + 1);
    setPhase(run.phase);
  };
  const hpShare = hud.hp / Math.max(1, hud.maxHp);
  const heroRole = roleOf(run.squads[0]);
  const choosing = run.offer[0]?.kind === 'spec';
  const press = (on: boolean) => (e: React.PointerEvent) => { e.preventDefault(); actRef.current = on; };

  return (
    <div className="warpath-screen">
      <canvas
        ref={canvas}
        className="warpath-canvas"
        onWheel={onWheel}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onContextMenu={(e) => e.preventDefault()}
      />
      {stickView && (
        <div className="warpath-stick" style={{ left: stickView.ox, top: stickView.oy }}>
          <div className="warpath-stick-knob" style={{ transform: `translate(${stickView.dx}px, ${stickView.dy}px)` }} />
        </div>
      )}
      <div className="warpath-hud">
        <div className="warpath-xp" title={`Level ${hud.level}: ${Math.floor(hud.xp)}/${hud.need} XP`}>
          <div style={{ width: `${Math.min(100, (hud.xp / hud.need) * 100)}%` }} />
          <span>Level {hud.level}</span>
        </div>
        <div className="warpath-hud-row">
          <div className="warpath-hp" title="Hero HP">
            <div style={{ width: `${hpShare * 100}%`, background: hpShare > 0.6 ? '#5cc06a' : hpShare > 0.3 ? '#e0b030' : '#e0483a' }} />
            <span>{Math.ceil(hud.hp)} / {Math.round(hud.maxHp)}</span>
          </div>
          <RoleBadge role={heroRole} />
          <span className="warpath-stat warpath-time"><Icon name="g:sands-of-time" /> {clock(hud.t)}</span>
          <span className="warpath-stat" title="Kills"><Icon name="g:skull-crossed-bones" /> {hud.kills.toLocaleString()}</span>
          <span className="warpath-stat" title="Bosses slain"><Icon name="g:crowned-skull" /> {hud.bosses}</span>
          <span className="warpath-stat" title={`Points on the field (of ${WARPATH.cap})`}><Icon name="g:knight-banner" /> {hud.points}</span>
          <button className="warpath-pause" onClick={() => setPaused(true)} aria-label="Pause"><Icon name="l:pause" /></button>
        </div>
        {hud.boss && (
          <div className={`warpath-boss${hud.boss.lord ? ' lord' : ''}`}>
            <span>{hud.boss.name}</span>
            <div><div style={{ width: `${hud.boss.share * 100}%` }} /></div>
          </div>
        )}
        {auto && <div className="warpath-auto">AUTO: the bot is playing. Nothing banks.</div>}
      </div>

      {hud.squads.length > 0 && (
        <div className="warpath-squads" aria-label="Your squads">
          {hud.squads.map((s) => (
            <span key={s.id} className={`warpath-squad${s.share <= 0 ? ' down' : ''}${s.away ? ' away' : ''}`} style={roleTint(s.role)} title={`${s.name} · ${ROLES[s.role].name}, level ${s.level}`}>
              <Icon name={ROLES[s.role].icon} />
              <i style={{ width: `${s.share * 100}%` }} />
            </span>
          ))}
        </div>
      )}
      <button className={`warpath-act${hud.power.left <= 0 ? ' ready' : ''}`} style={{ ...roleTint(heroRole), '--cd': `${hud.power.left * 360}deg` } as React.CSSProperties}
          onPointerDown={press(true)} onPointerUp={press(false)} onPointerCancel={press(false)} onPointerLeave={press(false)} onContextMenu={(e) => e.preventDefault()}
          aria-label={HERO_POWERS[hud.power.power].name} title={`${HERO_POWERS[hud.power.power].name}: ${HERO_POWERS[hud.power.power].text} (Space)`}>
          <Icon name={ROLES[heroRole].icon} />
          <span>{HERO_POWERS[hud.power.power].name}</span>
      </button>

      {phase === 'card' && !peek && run.phase === 'card' && (
        <div className="training-cards warpath-cards" role="dialog" aria-label="Level up">
          <div className="training-cards-title">
            <div className="training-cards-kicker">{clock(run.t)} · {run.points}/{WARPATH.cap} pts on the field</div>
            <h2>{choosing ? 'Specialise' : `Level ${run.level}`}</h2>
            <div className="training-cards-sub">{choosing ? 'This unit has earned a speciality. The choice is for the rest of the run.' : 'Take one. The run is paused.'}</div>
          </div>
          {!choosing && <DoctrineSlots run={run} />}
          <div className="training-cards-row">
            {run.offer.map((c, i) => {
              const t = cardText(run, c);
              const delay = { animationDelay: `${0.05 + i * 0.1}s` };
              return (
                <div key={`${run.level}:${run.rerolls}:${i}`} className="warpath-card-slot">
                  <button className={`training-card ${['call', 'stratagem', 'trophy', 'spec'].includes(c.kind) ? 'legendary' : c.kind === 'doctrine' ? 'rare' : ''}`} style={delay}
                    disabled={auto} onClick={act(() => choose(run, i))}>
                    <span className="training-card-shine" aria-hidden />
                    <span className={`tag ${['call', 'stratagem', 'trophy', 'spec'].includes(c.kind) ? 'gold' : c.kind === 'doctrine' ? 'red' : ''}`}>{t.tag}</span>
                    {t.icon && <Icon name={t.icon} className="warpath-card-icon" />}
                    <span className="training-card-name">{t.title}</span>
                    {t.role && <RoleBadge role={t.role} />}
                    <span className="training-card-text">{t.text}</span>
                  </button>
                  {t.pair && (
                    <div className={`warpath-card-pair${t.pair.held ? ' held' : ''}`} style={delay}>
                      <span>Pairs with <b>{t.pair.other} ({t.pair.held})</b>{t.pair.held ? '' : ": won't pair yet"}</span>
                      <span><b className="plan">{t.pair.plan}:</b> {t.pair.text}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="row warpath-card-actions">
            <button className="ghost" disabled={auto || choosing || run.rerolls <= 0} onClick={act(() => reroll(run))}><Icon name="l:refresh-cw" /> Reroll ({run.rerolls})</button>
            <button className="ghost" disabled={auto || choosing} onClick={act(() => skip(run))}><Icon name="g:meat" /> Skip: heal {Math.round(WARPATH.cards.skipHeal * 100)}%</button>
            <button className="ghost" onClick={() => setPeek(true)}><Icon name="l:eye" /> Look</button>
            <button className="ghost" onClick={() => setBuild(true)}><Icon name="l:file-text" /> Build</button>
          </div>
        </div>
      )}
      {phase === 'card' && peek && run.phase === 'card' && (
        <button className="primary warpath-back-cards" onClick={() => setPeek(false)}>Back to the cards</button>
      )}

      {paused && run.phase !== 'over' && (
        <div className="warpath-menu" role="dialog" aria-label="Paused">
          <h2>Paused</h2>
          <p className="muted small">{clock(run.t)} · level {run.level} · {run.kills.toLocaleString()} kills · {bossesOf(run)} bosses</p>
          <button className="primary" onClick={() => { setQuitting(false); setPaused(false); }}><Icon name="l:play" /> Resume</button>
          <button onClick={() => setBuild(true)}><Icon name="l:file-text" /> Your build</button>
          <button onClick={() => onLeave(run)}><Icon name="l:save" /> Save and leave</button>
          {onAuto && <button onClick={() => { onAuto(); setPaused(false); }}>{auto ? 'Stop auto' : 'Auto (debug: banks nothing)'}</button>}
          {quitting
            ? <button className="danger" onClick={() => onQuit(run)}><Icon name="l:flag" /> Yes, end it here (banks what it earned)</button>
            : <button className="ghost danger" onClick={() => setQuitting(true)}><Icon name="l:flag" /> Give up the run</button>}
          <p className="muted small">Move with WASD, the arrow keys or by dragging anywhere. Scroll to zoom. P or Esc pauses, B shows your build.{` Space or the round button: ${HERO_POWERS[hud.power.power].name}.`}</p>
        </div>
      )}
      {build && run.phase !== 'over' && <WarpathBuild run={run} onClose={() => setBuild(false)} />}
    </div>
  );
}
