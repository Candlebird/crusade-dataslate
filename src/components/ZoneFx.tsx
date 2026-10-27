import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { FX_COLOR } from '../rules/training/harm';
import type { ZBattle } from '../rules/zone/state';

// The zone board's fx, as in Training: a shot's line with a spark where it lands, a melee blow's slash with sparks,
// the wounds floating over the target, and a burst where a unit is destroyed. Moved units glide to their new square.
// All found from the log lines a step added and the tokens' places on screen ([data-zu]), so nothing here touches the battle.

/** How long a blow stays up, and the gap between blows that land together (ms). */
const FX_MS = 900;
const FX_GAP = 140;
const GLIDE_MS = 320;

type Pt = { x: number; y: number };
interface Fx { n: number; kind: 'shot' | 'melee' | 'bolt' | 'burst'; a: Pt; b: Pt; r: number; dmg?: number; miss: boolean; mine: boolean; delay: number; stack: number }

const SPARKS = [[-1, -0.7], [0.9, -0.9], [0.2, 1]];
const BITS = Array.from({ length: 6 }, (_, i) => [Math.cos((i * Math.PI) / 3), Math.sin((i * Math.PI) / 3)]);

/** The fx over the board in `field`; `mine` says whose a side is, for the colour of the numbers and bursts. */
export function ZoneFx({ z, field, mine }: { z: ZBattle; field: React.RefObject<HTMLDivElement | null>; mine: (side: 0 | 1) => boolean }) {
  const seen = useRef(z.log.length);
  const dead = useRef(new Set(z.units.filter((u) => u.destroyed).map((u) => u.id)));
  // Where each token stood last time: a unit the blow destroyed is already gone from the board.
  const last = useRef(new Map<string, Pt & { r: number }>());
  const count = useRef(0);
  const timers = useRef<number[]>([]);
  const [shown, setShown] = useState<Fx[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  useLayoutEffect(() => {
    const el = field.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    const now = new Map<string, Pt & { r: number }>();
    const tokens = new Map<string, HTMLElement>();
    el.querySelectorAll<HTMLElement>('[data-zu]').forEach((t) => {
      const r = t.getBoundingClientRect();
      now.set(t.dataset.zu!, { x: r.left - box.left + r.width / 2, y: r.top - box.top + r.height / 2, r: r.width / 2 });
      tokens.set(t.dataset.zu!, t);
    });
    const before = last.current;
    last.current = now;
    const at = (id?: string) => (id ? now.get(id) ?? before.get(id) : undefined);

    // A battle started over (or loaded afresh) counts its lines from the start again.
    if (z.log.length < seen.current) seen.current = 0;
    const fresh = z.log.slice(seen.current);
    seen.current = z.log.length;

    // Units that moved glide from where they stood.
    const moved = new Set(fresh.filter((l) => l.path || l.kind === 'move' || l.kind === 'melee').map((l) => l.unit));
    for (const id of moved) {
      const p = id && now.get(id);
      const q = id && before.get(id);
      const t = id && tokens.get(id);
      if (!p || !q || !t || Math.hypot(p.x - q.x, p.y - q.y) < 3) continue;
      t.animate?.([{ transform: `translate(${q.x - p.x}px, ${q.y - p.y}px)` }, { transform: 'none' }], { duration: GLIDE_MS, easing: 'ease-out' });
    }

    const add: Fx[] = [];
    const onto = new Map<string, number>();
    const lag = moved.size ? GLIDE_MS * 0.6 : 0;
    for (const l of fresh) {
      const kind = l.kind === 'shoot' ? 'shot' : l.kind === 'melee' ? 'melee' : l.kind === 'ability' && l.wounds !== undefined ? 'bolt' : undefined;
      if (!kind || !l.target || l.wounds === undefined) continue;
      const a = at(l.unit);
      const b = at(l.target);
      if (!b) continue;
      const stack = onto.get(l.target) ?? 0;
      onto.set(l.target, stack + 1);
      add.push({ n: ++count.current, kind, a: a ?? b, b, r: b.r, dmg: l.wounds, miss: !l.wounds, mine: l.side !== undefined && mine(l.side), delay: lag + add.length * FX_GAP, stack });
    }
    for (const u of z.units) {
      if (!u.destroyed || dead.current.has(u.id)) continue;
      dead.current.add(u.id);
      const p = at(u.id);
      if (p) add.push({ n: ++count.current, kind: 'burst', a: p, b: p, r: p.r, miss: false, mine: mine(u.side), delay: lag + add.length * FX_GAP, stack: 0 });
    }
    if (!add.length) return;
    setShown((xs) => [...xs, ...add]);
    const done = new Set(add.map((f) => f.n));
    timers.current.push(window.setTimeout(() => setShown((xs) => xs.filter((f) => !done.has(f.n))), FX_MS + add[add.length - 1].delay + 50));
  }, [z]);

  if (!shown.length) return null;
  return (
    <>
      <svg className="zfx" aria-hidden="true">
        {shown.map((f) => {
          const style = { animationDelay: `${f.delay}ms` };
          const R = Math.max(8, f.r * 1.3);
          if (f.kind === 'burst') {
            const color = f.mine ? '#e8c55a' : '#e0533f';
            return (
              <g key={f.n}>
                <circle className="zfx-ring" cx={f.b.x} cy={f.b.y} r={R} stroke={color} style={style} />
                {BITS.map(([dx, dy], i) => <circle key={i} className="zfx-bit" cx={f.b.x} cy={f.b.y} r={2.5} fill={color} style={{ ...style, ['--dx' as string]: `${dx * R * 1.6}px`, ['--dy' as string]: `${dy * R * 1.6}px` }} />)}
              </g>
            );
          }
          const color = FX_COLOR[f.kind === 'melee' ? 'melee' : f.kind === 'bolt' ? 'bolt' : 'shot'];
          const miss = f.miss ? ' miss' : '';
          if (f.kind === 'melee') {
            const { x, y } = f.b;
            return (
              <g key={f.n} className={`zfx-blow${miss}`} style={style}>
                <path className="zfx-slash" d={`M ${x - R} ${y + R * 0.45} Q ${x - R * 0.1} ${y - R * 1.15} ${x + R} ${y - R * 0.35}`} stroke={color} style={style} />
                {!f.miss && SPARKS.map(([dx, dy], i) => <circle key={i} className="zfx-bit" cx={x} cy={y} r={2} fill={color} style={{ ...style, ['--dx' as string]: `${dx * R}px`, ['--dy' as string]: `${dy * R}px` }} />)}
              </g>
            );
          }
          return (
            <g key={f.n} className={`zfx-blow${miss}`} style={style}>
              <line className={`zfx-shot${f.kind === 'bolt' ? ' bolt' : ''}`} x1={f.a.x} y1={f.a.y} x2={f.b.x} y2={f.b.y} stroke={color} style={{ ...style, color }} />
              {!f.miss && <circle className="zfx-spark" cx={f.b.x} cy={f.b.y} r={Math.max(3, R * 0.3)} fill={color} style={style} />}
            </g>
          );
        })}
      </svg>
      {shown.filter((f) => f.kind !== 'burst').map((f) => (
        <span key={f.n} className={`sortie-dmg${f.mine ? ' mine' : ' foe'}${f.miss ? ' miss' : ''}`}
          style={{ left: f.b.x, top: f.b.y - f.stack * 20, animationDelay: `${f.delay}ms` }} aria-hidden="true">
          {f.dmg ? `-${f.dmg}` : 'saved'}
        </span>
      ))}
    </>
  );
}
