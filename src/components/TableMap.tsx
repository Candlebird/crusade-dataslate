import { useId } from 'react';
import type { DeploymentMap, MapShape, ZoneSide } from '../rules/tableMap';

const PAD = 7;
const COLOR: Record<ZoneSide, string> = { A: 'var(--gold)', B: 'var(--cyan)', none: 'var(--muted)' };

/** A measured line: end ticks, and the length written beside it (to the right of a vertical one, above a horizontal one). */
function Dim({ s }: { s: Extract<MapShape, { kind: 'dim' }> }) {
  const vertical = s.x1 === s.x2;
  const t = 0.8;
  const ticks = vertical
    ? [[s.x1 - t, s.y1, s.x1 + t, s.y1], [s.x1 - t, s.y2, s.x1 + t, s.y2]]
    : [[s.x1, s.y1 - t, s.x1, s.y1 + t], [s.x2, s.y2 - t, s.x2, s.y2 + t]];
  const mx = (s.x1 + s.x2) / 2, my = (s.y1 + s.y2) / 2;
  return (
    <g className="tm-dim">
      <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} />
      {ticks.map(([a, b, c, d], i) => <line key={i} x1={a} y1={b} x2={c} y2={d} />)}
      <text x={vertical ? mx + 1.2 : mx} y={vertical ? my + 1 : my - 1} textAnchor={vertical ? 'start' : 'middle'}>{s.text}</text>
    </g>
  );
}

function Shape({ s, w, h }: { s: MapShape; w: number; h: number }) {
  switch (s.kind) {
    case 'rect':
      return <rect x={s.x} y={s.y} width={s.w} height={s.h} fill={COLOR[s.side]} stroke={COLOR[s.side]} className={`tm-zone${s.dashed ? ' dashed' : ''}`} />;
    case 'circle':
      return <circle cx={s.cx} cy={s.cy} r={s.r} fill={COLOR[s.side]} stroke={COLOR[s.side]} className={`tm-zone${s.dashed ? ' dashed' : ''}`} />;
    case 'band':
      return (
        <path
          d={`M0 0H${w}V${h}H0Z M${s.d} ${s.d}V${h - s.d}H${w - s.d}V${s.d}Z`}
          fillRule="evenodd" fill={COLOR[s.side]} stroke={COLOR[s.side]} className="tm-zone"
        />
      );
    case 'marker':
      return <circle cx={s.x} cy={s.y} r={1.6} className="tm-marker" />;
    case 'line':
      return <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} className="tm-guide" />;
    case 'dim':
      return <Dim s={s} />;
  }
}

/** The suggested table, drawn to scale with its deployment zones, markers and key measurements. */
export default function TableMap({ map }: { map: DeploymentMap }) {
  const { w, h } = map.table;
  const clip = `tm-clip${useId().replace(/:/g, '')}`;
  const zones = map.shapes.filter((s): s is Extract<MapShape, { label: string }> => 'label' in s);
  return (
    <figure className="table-map">
      <svg viewBox={`${-PAD} ${-PAD} ${w + 2 * PAD} ${h + 2 * PAD}`} role="img" aria-label={`Deployment map on a ${map.table.label} table`}>
        {/* A zone measured from something near an edge stops at the edge. */}
        <defs><clipPath id={clip}><rect x={0} y={0} width={w} height={h} /></clipPath></defs>
        <rect x={0} y={0} width={w} height={h} className="tm-table" />
        <g clipPath={`url(#${clip})`}>{map.shapes.map((s, i) => <Shape key={i} s={s} w={w} h={h} />)}</g>
        <Dim s={{ kind: 'dim', x1: 0, y1: -3, x2: w, y2: -3, text: `${w}"` }} />
        <g className="tm-dim">
          <line x1={-3} y1={0} x2={-3} y2={h} />
          <text x={-4} y={h / 2} textAnchor="middle" transform={`rotate(-90 -4 ${h / 2})`}>{h}"</text>
        </g>
      </svg>
      <figcaption className="small">
        {zones.map((z, i) => (
          <span key={i} className="tm-key">
            <span className={`tm-swatch${'dashed' in z && z.dashed ? ' dashed' : ''}`} style={{ borderColor: COLOR[z.side], background: `color-mix(in srgb, ${COLOR[z.side]} 25%, transparent)` }} />
            {z.label}
          </span>
        ))}
        {map.shapes.some((s) => s.kind === 'marker') && <span className="tm-key"><span className="tm-swatch dot" /> Objective marker</span>}
        {map.notes.map((n) => <span key={n} className="muted tm-note">{n}</span>)}
      </figcaption>
    </figure>
  );
}
