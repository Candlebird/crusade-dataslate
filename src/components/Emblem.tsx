import type { EmblemLayer, EmblemShape } from '../model/types';
import { EMBLEM_PALETTE, EMBLEM_SHAPES, LAYER_NAMES, LAYER_SCALE, SHAPE_IDS, emblemLayers, randomEmblem } from '../model/emblem';

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

/** Building the emblem: a shape and a colour for each of the three layers. */
export function EmblemEditor({ emblem, onChange, readOnly }: { emblem: unknown; onChange: (e: EmblemLayer[] | undefined) => void; readOnly?: boolean }) {
  const layers = emblemLayers(emblem);
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
        <div className="emblem-map-size" title="About how big it is on the Nexus Map"><EmblemBadge emblem={layers} size={22} /></div>
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
            <button className="ghost" onClick={() => onChange(undefined)}>Remove emblem</button>
          </div>
        </>
      )}
    </div>
  );
}
