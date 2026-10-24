import { useEffect, useRef, useState } from 'react';
import type { EmblemLayer } from '../../model/types';
import { N, placeProblem, type DrawnShard, type Tile, type TrainingRun } from '../../rules/training';
import { drawBoard, drawVeil, type Overlay } from './draw';
import { drawEnemies, drawFx } from './drawLive';
import { burstsLive, drawBursts, trackBursts } from './fxBursts';

// The Training map on a canvas: fit to its box, wheel zoom about the cursor, drag to pan, pinch and one-finger pan on
// touch, and a click or tap reports the cell. The run is read live every frame it redraws (the shell mutates it).
// Placing by touch takes two taps: the first shows the ghost there (zooming in if the map is small), a second tap on
// it or Place puts it down.

export interface MapViewProps {
  run: TrainingRun;
  /** Each unit's Emblem, by unit id (model/emblem unitPortrait). */
  portraits: Record<string, EmblemLayer[]>;
  /** Shard ids that count toward a ready recipe: they glow. */
  glow?: ReadonlySet<number>;
  /** A piece to rim, with rings for its weapons' reach. */
  selected?: number;
  /** Placing: the Shard about to go down (or true for a bare footprint). The hover shows its 2×2 ghost, green or red. */
  placing?: DrawnShard | true;
  /** A click or tap: the cell under it, and the top-left cell of a 2×2 piece centred there (where a ghost stands). */
  onCell: (cell: Tile, place: Tile) => void;
  /** The pointer moved to another cell (null: off the map). */
  onHover?: (cell: Tile | null, place: Tile | null) => void;
  /** The wave is paused: the map dims with "Paused". Left out, a wave whose clock stops for a moment counts as paused. */
  paused?: boolean;
  className?: string;
}

/** Most it zooms in, times the fit; and how far a press moves (pixels) before it is a drag, not a click. */
const MAX_ZOOM = 8;
const DRAG_PX = 6;
/** Below this many pixels a cell, a first tap to place zooms in to TAP_ZOOM_PX a cell around it. */
const TAP_ZOOM_BELOW = 9;
const TAP_ZOOM_PX = 14;
/** A wave clock still for this long (ms) shows as paused. */
const STILL_MS = 300;
const NONE = new Set<number>();

interface View { k: number; ox: number; oy: number; w: number; h: number; fit: number }

/** The cell under a map point, and the top-left of a 2×2 centred there (both null off the map). */
function cellsAt(wx: number, wy: number): { cell: Tile; place: Tile } | null {
  if (wx < 0 || wy < 0 || wx >= N || wy >= N) return null;
  const clampTL = (v: number) => Math.max(0, Math.min(N - 2, Math.round(v - 1)));
  return { cell: { x: Math.floor(wx), y: Math.floor(wy) }, place: { x: clampTL(wx), y: clampTL(wy) } };
}

/** Keep the zoom in range and the map on screen (centred along an axis it doesn't fill). */
function clamp(v: View): View {
  const k = Math.max(v.fit, Math.min(v.fit * MAX_ZOOM, v.k));
  const side = N * k;
  const fix = (o: number, room: number) => (side <= room ? (room - side) / 2 : Math.min(0, Math.max(room - side, o)));
  return { ...v, k, ox: fix(v.ox, v.w), oy: fix(v.oy, v.h) };
}

export function MapView(props: MapViewProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const live = useRef(props);
  live.current = props;
  const view = useRef<View>({ k: 1, ox: 0, oy: 0, w: 0, h: 0, fit: 1 });
  const hover = useRef<{ x: number; y: number } | null>(null);
  const dirty = useRef(true);
  const [zoomed, setZoomed] = useState(false);
  /** A touch placement waiting to be confirmed: where, and whether it may go there. */
  const [pending, setPending] = useState<{ cell: Tile; place: Tile; ok: boolean } | null>(null);
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  /** The spot a piece just went down on: no ghost there until the pointer moves on. */
  const justPlaced = useRef('');
  dirty.current = true;

  // A new thing to place, a new layout or the end of placing drops a waiting touch placement.
  const layout = `${props.run.pieces.length},${props.run.nextId},${props.run.phase}`;
  useEffect(() => { setPending(null); }, [props.placing, layout]);

  const setView = (v: View) => {
    view.current = clamp(v);
    dirty.current = true;
    setZoomed(view.current.k > view.current.fit * 1.01);
  };
  const zoomAt = (px: number, py: number, f: number) => {
    const v = view.current;
    const k = Math.max(v.fit, Math.min(v.fit * MAX_ZOOM, v.k * f));
    setView({ ...v, k, ox: px - ((px - v.ox) * k) / v.k, oy: py - ((py - v.oy) * k) / v.k });
  };
  const fit = () => {
    const v = view.current;
    setView({ ...v, k: v.fit, ox: 0, oy: 0 });
  };
  const toMap = (px: number, py: number) => ({ x: (px - view.current.ox) / view.current.k, y: (py - view.current.oy) / view.current.k });
  const local = (e: { clientX: number; clientY: number }) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  // Size the canvas to its box (and the screen's pixel density); refit unless zoomed in.
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const size = () => {
      const w = el.clientWidth;
      const h = el.clientHeight || w;
      const dpr = window.devicePixelRatio || 1;
      const cv = canvas.current!;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      const v = view.current;
      const fitK = Math.min(w, h) / N;
      const wasFit = v.k <= v.fit * 1.01;
      setView({ ...v, w, h, fit: fitK, k: wasFit ? fitK : v.k * (fitK / v.fit) });
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Redraw on every frame something may have moved: a re-render, a wave, fx fading, a glow pulsing.
  useEffect(() => {
    let raf = 0;
    let ghostKey = '';
    let ghostOk = false;
    let clock = { t: -1, at: 0 };
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const p = live.current;
      const run = p.run;
      const glow = p.glow ?? NONE;
      const sec = now / 1000;
      trackBursts(run, sec);
      if (!dirty.current && run.phase !== 'wave' && !run.fx.length && !glow.size && !burstsLive(run, sec)) return;
      dirty.current = false;
      const cv = canvas.current;
      const ctx = cv?.getContext('2d');
      if (!cv || !ctx) return;
      const v = view.current;
      const dpr = cv.width / Math.max(1, v.w);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#0c0d0f';
      ctx.fillRect(0, 0, v.w, v.h);
      ctx.translate(v.ox, v.oy);
      let ghost: Overlay['ghost'];
      const at = p.placing && run.phase !== 'over' && hover.current ? cellsAt(hover.current.x, hover.current.y) : null;
      if (at && `${at.place.x},${at.place.y}` !== justPlaced.current) {
        // Legality walks the whole maze, so only ask again when the spot or the pieces change.
        const key = `${at.place.x},${at.place.y},${run.pieces.length},${run.nextId}`;
        if (key !== ghostKey) { ghostKey = key; ghostOk = !placeProblem(run, at.place.x, at.place.y); }
        ghost = { at: at.place, ok: ghostOk, shard: p.placing === true ? undefined : p.placing };
      }
      const s = v.k;
      drawBoard(ctx, run, s, { portraits: p.portraits, glow, selected: p.selected, ghost, time: sec });
      drawEnemies(ctx, run, s, sec);
      drawFx(ctx, run, s);
      drawBursts(ctx, run, s, sec);
      if (run.t !== clock.t || run.phase !== 'wave') clock = { t: run.t, at: now };
      const paused = p.paused ?? now - clock.at > STILL_MS;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (run.phase === 'over') drawVeil(ctx, v.w, v.h, 'Run over');
      else if (paused && run.phase === 'wave') drawVeil(ctx, v.w, v.h, 'Paused', 0.4);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Wheel zoom has to be a non-passive listener to keep the page from scrolling.
  useEffect(() => {
    const cv = canvas.current!;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const at = local(e);
      zoomAt(at.x, at.y, Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015)));
      // The same spot on screen is another cell now: move the ghost with it.
      if (!pendingRef.current) reportHover(at);
    };
    cv.addEventListener('wheel', wheel, { passive: false });
    return () => cv.removeEventListener('wheel', wheel);
  }, []);

  // Pointers: one drags (or clicks if it barely moved), two pinch.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const press = useRef({ x: 0, y: 0, moved: false, pinched: false });
  const pinch = useRef({ d: 0, mx: 0, my: 0 });
  const lastCell = useRef('');

  const reportHover = (pt: { x: number; y: number } | null) => {
    hover.current = pt ? toMap(pt.x, pt.y) : null;
    dirty.current = true;
    const at = hover.current ? cellsAt(hover.current.x, hover.current.y) : null;
    if (`${at?.place.x},${at?.place.y}` !== justPlaced.current) justPlaced.current = '';
    const key = at ? `${at.cell.x},${at.cell.y},${at.place.x},${at.place.y}` : '';
    if (key === lastCell.current) return;
    lastCell.current = key;
    live.current.onHover?.(at?.cell ?? null, at?.place ?? null);
  };
  const pinchState = () => {
    const [a, b] = [...pointers.current.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  };

  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const at = local(e);
    pointers.current.set(e.pointerId, at);
    if (pointers.current.size === 1) press.current = { ...at, moved: false, pinched: false };
    if (pointers.current.size === 2) { pinch.current = pinchState(); press.current.pinched = true; }
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const at = local(e);
    const prev = pointers.current.get(e.pointerId);
    if (!prev) {
      if (e.pointerType === 'mouse') reportHover(at);
      return;
    }
    pointers.current.set(e.pointerId, at);
    const v = view.current;
    if (pointers.current.size >= 2) {
      const now = pinchState();
      const was = pinch.current;
      const k = Math.max(v.fit, Math.min(v.fit * MAX_ZOOM, v.k * (now.d / Math.max(1, was.d))));
      // Zoom about the old midpoint, then follow the midpoint's move.
      setView({ ...v, k, ox: was.mx - ((was.mx - v.ox) * k) / v.k + (now.mx - was.mx), oy: was.my - ((was.my - v.oy) * k) / v.k + (now.my - was.my) });
      pinch.current = now;
      return;
    }
    const p = press.current;
    if (!p.moved && Math.hypot(at.x - p.x, at.y - p.y) > DRAG_PX) p.moved = true;
    if (p.moved) setView({ ...v, ox: v.ox + at.x - prev.x, oy: v.oy + at.y - prev.y });
    if (e.pointerType === 'mouse') reportHover(at);
  };
  const up = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!pointers.current.delete(e.pointerId)) return;
    if (pointers.current.size === 1) {
      // A pinch ended with one finger still down: carry on as a drag from where it is.
      const [rest] = pointers.current.values();
      press.current = { ...rest, moved: true, pinched: true };
      return;
    }
    if (pointers.current.size || press.current.moved || press.current.pinched || e.type === 'pointercancel') return;
    const at = local(e);
    const m = toMap(at.x, at.y);
    const hit = cellsAt(m.x, m.y);
    if (!hit) return;
    const p = live.current;
    if (p.placing && e.pointerType !== 'mouse' && p.run.phase !== 'over') {
      const was = pendingRef.current;
      // A second tap on the waiting ghost confirms it; anywhere else moves it there.
      if (was && hit.cell.x >= was.place.x && hit.cell.x <= was.place.x + 1 && hit.cell.y >= was.place.y && hit.cell.y <= was.place.y + 1) {
        confirm();
        return;
      }
      setPending({ ...hit, ok: !placeProblem(p.run, hit.place.x, hit.place.y) });
      const v = view.current;
      // Zoom in on it, with the ghost brought to the middle (an edge tap would leave it under the bar).
      if (v.k < TAP_ZOOM_BELOW) {
        const k = Math.min(v.fit * MAX_ZOOM, TAP_ZOOM_PX);
        setView({ ...v, k, ox: v.w / 2 - (hit.place.x + 1) * k, oy: v.h / 2 - (hit.place.y + 1) * k });
      }
      // Aim the ghost at the middle of the footprint, wherever the view went.
      hover.current = { x: hit.place.x + 1, y: hit.place.y + 1 };
      dirty.current = true;
      return;
    }
    reportHover(at);
    place(hit.cell, hit.place);
  };
  const place = (cell: Tile, at: Tile) => {
    if (live.current.placing) justPlaced.current = `${at.x},${at.y}`;
    live.current.onCell(cell, at);
  };
  const confirm = () => {
    const was = pendingRef.current;
    if (!was) return;
    setPending(null);
    hover.current = null;
    place(was.cell, was.place);
  };
  const cancel = () => {
    setPending(null);
    hover.current = null;
    dirty.current = true;
  };
  const leave = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'mouse' && !pointers.current.size) reportHover(null);
  };

  return (
    <div ref={wrap} className={`training-map${props.className ? ` ${props.className}` : ''}`}>
      <canvas
        ref={canvas}
        aria-label="Training map"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onPointerLeave={leave}
        onContextMenu={(e) => e.preventDefault()}
      />
      {zoomed && <button type="button" className="training-map-fit small" onClick={fit}>Fit</button>}
      {pending && (
        <div role="group" aria-label="Place here?" style={barAt(pending.place, view.current)}>
          {pending.ok ? (
            <button type="button" className="primary small" onClick={confirm}>Place</button>
          ) : (
            <span className="small" style={{ color: '#ff9d92' }}>Can't go there</span>
          )}
          <button type="button" className="small" onClick={cancel}>Cancel</button>
        </div>
      )}
    </div>
  );
}

/** The touch Place / Cancel bar along the map's foot, or its head when the ghost sits low (styled inline: it is the
 *  map's own control). */
const barAt = (at: Tile, v: View): React.CSSProperties => ((at.y + 2) * v.k + v.oy > v.h - 64 ? { ...BAR, bottom: undefined, top: 8 } : BAR);
const BAR: React.CSSProperties = {
  position: 'absolute', left: '50%', bottom: 8, transform: 'translateX(-50%)', display: 'flex', gap: 8, alignItems: 'center',
  padding: '6px 8px', borderRadius: 6, background: 'rgba(12,13,15,0.88)', border: '1px solid #2c333d', whiteSpace: 'nowrap',
};
