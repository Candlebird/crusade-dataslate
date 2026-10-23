import { useState, type ReactNode } from 'react';
import type { EmblemLayer, EmblemShape, Unit } from '../model/types';
import { Modal } from './ui';
import { EMBLEM_PALETTE, EMBLEM_SHAPES, LAYER_NAMES, LAYER_SCALE, SHAPE_IDS, emblemLayers, randomEmblem, unitPortrait } from '../model/emblem';

/** The emblem's layers as SVG, in a 100 × 100 box; for drawing inside another SVG (the Nexus Map). */
export function EmblemShapes({ layers }: { layers: EmblemLayer[] }) {
  return (
    <>
      {layers.map((l, i) => {
        if (l.shape === 'none') return null;
        const s = LAYER_SCALE[i];
        return (
          <path key={i} d={EMBLEM_SHAPES[l.shape].path} fill={l.color} fillRule="evenodd"
            stroke="rgba(0,0,0,0.55)" strokeWidth={1} strokeLinejoin="round" vectorEffect="non-scaling-stroke"
            transform={`translate(${50 - 50 * s} ${50 - 50 * s}) scale(${s})`} />
        );
      })}
    </>
  );
}

/** A force's emblem on its own, or nothing if it has none. */
export function EmblemBadge({ emblem, size = 32, title }: { emblem: unknown; size?: number; title?: string }) {
  const layers = emblemLayers(emblem);
  if (!layers) return null;
  return (
    <svg className="emblem" width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={title ?? 'Emblem'}>
      {title && <title>{title}</title>}
      <EmblemShapes layers={layers} />
    </svg>
  );
}

function ShapeIcon({ shape }: { shape: EmblemShape }) {
  return (
    <svg width={22} height={22} viewBox="0 0 100 100" aria-hidden>
      <path d={EMBLEM_SHAPES[shape].path} fill="currentColor" fillRule="evenodd" />
    </svg>
  );
}

/** A unit's portrait: its own, or the default rolled from its id. */
export function Portrait({ unit, size = 32, title }: { unit: Pick<Unit, 'id' | 'category' | 'portrait'> & { name?: string }; size?: number; title?: string }) {
  return <EmblemBadge emblem={unitPortrait(unit)} size={size} title={title ?? unit.name ?? 'Portrait'} />;
}

/**
 * Building an emblem (a force's) or a portrait (a unit's): a shape and a colour for each of the three layers. A portrait
 * has a `fallback` (its default), so it's never empty, and resetting goes back to that.
 */
export function EmblemEditor({ emblem, onChange, readOnly, fallback }: {
  emblem: unknown; onChange: (e: EmblemLayer[] | undefined) => void; readOnly?: boolean; fallback?: EmblemLayer[];
}) {
  const layers = emblemLayers(emblem) ?? fallback;
  if (!layers) {
    return readOnly ? <p className="muted small">No emblem. The Nexus Map shows a plain marker.</p> : (
      <div>
        <p className="muted small">No emblem yet. The Nexus Map shows a plain marker until you make one.</p>
        <button className="primary" onClick={() => onChange(randomEmblem())}>Create emblem</button>
      </div>
    );
  }
  const setLayer = (i: number, patch: Partial<EmblemLayer>) => onChange(layers.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  return (
    <div className="emblem-editor">
      <div className="emblem-preview">
        <EmblemBadge emblem={layers} size={112} />
        <div className="emblem-map-size" title={fallback ? 'About how big it is in the games' : 'About how big it is on the Nexus Map'}><EmblemBadge emblem={layers} size={22} /></div>
      </div>
      {!readOnly && (
        <>
          {layers.map((l, i) => (
            <fieldset key={i} className="emblem-layer">
              <legend>{LAYER_NAMES[i]}</legend>
              <div className="emblem-shapes" role="radiogroup" aria-label={`${LAYER_NAMES[i]} shape`}>
                {i > 0 && (
                  <button type="button" role="radio" aria-checked={l.shape === 'none'} className={l.shape === 'none' ? 'on' : ''}
                    title="None" onClick={() => setLayer(i, { shape: 'none' })}>∅</button>
                )}
                {SHAPE_IDS.map((s) => (
                  <button key={s} type="button" role="radio" aria-checked={l.shape === s} className={l.shape === s ? 'on' : ''}
                    title={EMBLEM_SHAPES[s].name} aria-label={EMBLEM_SHAPES[s].name} onClick={() => setLayer(i, { shape: s })}>
                    <ShapeIcon shape={s} />
                  </button>
                ))}
              </div>
              <div className="emblem-colors">
                {EMBLEM_PALETTE.map((c) => (
                  <button key={c} type="button" className={`emblem-swatch${l.color.toLowerCase() === c ? ' on' : ''}`} style={{ background: c }}
                    title={c} aria-label={`Colour ${c}`} onClick={() => setLayer(i, { color: c })} />
                ))}
                <input type="color" value={l.color} aria-label={`${LAYER_NAMES[i]} colour`} title="Any colour"
                  onChange={(e) => setLayer(i, { color: e.target.value })} />
              </div>
            </fieldset>
          ))}
          <div className="row">
            <button onClick={() => onChange(randomEmblem())}>🎲 Random</button>
            {fallback
              ? <button className="ghost" disabled={!emblemLayers(emblem) || JSON.stringify(emblem) === JSON.stringify(fallback)} onClick={() => onChange(undefined)}>Back to default</button>
              : <button className="ghost" onClick={() => onChange(undefined)}>Remove emblem</button>}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * An emblem or portrait that opens its editor in a pop-up when clicked. Read-only, the pop-up just shows it larger;
 * `children` go above the editor (a line on what it's for, or why it can't be changed).
 */
export function EmblemButton({ emblem, onChange, readOnly, fallback, size = 40, title, children }: {
  emblem: unknown; onChange: (e: EmblemLayer[] | undefined) => void; readOnly?: boolean; fallback?: EmblemLayer[];
  size?: number; title: string; children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <>
      <button type="button" className="emblem-button" title={readOnly ? title : `Edit ${title.toLowerCase()}`} aria-label={readOnly ? title : `Edit ${title.toLowerCase()}`}
        onClick={() => setOpen(true)}>
        <EmblemBadge emblem={emblemLayers(emblem) ?? fallback} size={size} />
        {!readOnly && <span className="emblem-button-hint" aria-hidden>✎</span>}
      </button>
      {open && (
        <Modal title={title} onClose={close} footer={<button className="primary" onClick={close}>Done</button>}>
          {children}
          <EmblemEditor emblem={emblem} fallback={fallback} readOnly={readOnly} onChange={onChange} />
        </Modal>
      )}
    </>
  );
}

const paths = new Map<string, Path2D>();

/** Draw an emblem or portrait on a canvas, in the square at (x, y) of side `size`. */
export function drawEmblem(ctx: CanvasRenderingContext2D, layers: EmblemLayer[], x: number, y: number, size: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 100, size / 100);
  ctx.lineWidth = 100 / size;
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  layers.forEach((l, i) => {
    if (l.shape === 'none') return;
    const d = EMBLEM_SHAPES[l.shape].path;
    let p = paths.get(d);
    if (!p) paths.set(d, (p = new Path2D(d)));
    const s = LAYER_SCALE[i];
    ctx.save();
    ctx.translate(50 - 50 * s, 50 - 50 * s);
    ctx.scale(s, s);
    ctx.lineWidth = 100 / size / s;
    ctx.fillStyle = l.color;
    ctx.fill(p, 'evenodd');
    ctx.stroke(p);
    ctx.restore();
  });
  ctx.restore();
}
