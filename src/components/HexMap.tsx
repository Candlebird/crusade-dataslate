import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { nowIso, uid } from '../model/factory';
import { useStore } from '../model/store';
import { readImageAsDataUrl } from '../model/io';
import type { Campaign, CampaignEvent, Force, Sector, SectorType } from '../model/types';
import {
  cells, clampToMap, defaultCounts, defaultMap, frontier, generateMap, hexCorners, hexKey, isPlaced, randomSeed, rng, rollSector, toPixel,
  type GenCounts, type GenOptions, type Hex,
} from '../rules/hexmap';
import {
  BENEFITS, ECHOES, SECTOR_TYPES, SECTOR_TYPE_KEYS, activeCrisis, activeEvent, benefitOf, factionColor, factionName, homeChallengeBlock, isStronghold, lordById, sidesOf, stormed,
} from '../rules/nexus';
import { breakMark, breaksLeft, holders, markOn, pickSpread, restoreMark, spreadInto, spreadTargets } from '../rules/voidspawn';
import { aiDefended, rateSectors } from '../rules/difficulty';
import {
  bankCap, build, buildBlock, buildCost, buildingById, buildingSlots, cancelBuilding, coreBlock, demolish, exchange, exchangeBlock, freeSlots, hasBuilding, installCore,
  isReinforced, produces, productionRate, tradeBonus, type ExchangeTrade,
} from '../rules/production';
import { knows } from '../rules/tech';
import { sightMap, type Sight } from '../rules/fog';
import { positionOf, reach, setPosition } from '../rules/movement';
import { detachmentName } from '../rules/detachments';
import { emblemLayers } from '../model/emblem';
import { EmblemBadge, EmblemShapes } from './Emblem';
import { MARAUDER_ID, bandsAt, isRaided, marauderTier, recordMarauderGame } from '../rules/marauders';
import { BUILDINGS, GUARDIANS, PRODUCTION } from '../rules/nexusData';
import { href } from '../route';
import { Modal, Panel, Stepper, TextArea, TextField, confirmAction, toast } from './ui';
import SectorDanger from './SectorDanger';
import { localDate } from '../model/date';

type SetC = (fn: (c: Campaign) => void) => void;
type Tool = 'select' | 'type' | 'owner' | 'move' | 'unplace';

const SIZE = 40;
const GLYPH: Record<SectorType, string> = { home: '♜', planet: '◉', research: '⌬', void: '✠', anomaly: '✺', empty: '·', voidspawn: '☣', archive: '❖' };
const TOOLS: { key: Tool; label: string; hint: string }[] = [
  { key: 'select', label: 'Select', hint: 'Click a hex to see or edit it' },
  { key: 'type', label: 'Paint type', hint: 'Click hexes to set their type (creates a sector on empty space)' },
  { key: 'owner', label: 'Paint owner', hint: 'Click sectors to hand them to a faction' },
  { key: 'move', label: 'Move', hint: 'Click a sector, then click where it goes (swaps with an occupied hex)' },
  { key: 'unplace', label: 'Take off map', hint: 'Click sectors to take them off the map (they stay in the sector list)' },
];

/**
 * The sector map. The GM's map (gm) has the editing tools and can be seen as any faction sees it; a player's map is fogged
 * for their faction (fog: its id; none for the whole map) and only shows what they know.
 */
export default function HexMapPanel({ c, setC, onRecord, gm = true, fog, focus }: {
  c: Campaign; setC: SetC; onRecord?: (sectorId: string) => void; gm?: boolean; fog?: string;
  /** A sector to pick and scroll to (a new `n` each time it's asked for). */
  focus?: Focus;
}) {
  const [genOpen, setGenOpen] = useState(false);
  if (!c.map && !gm) {
    return (
      <div className="panel">
        <div className="panel-title"><h2>Sector map</h2></div>
        <p className="muted small">The GM hasn't laid out the map yet.</p>
      </div>
    );
  }
  if (!c.map) {
    return (
      <div className="panel">
        <div className="panel-title"><h2>Sector map</h2></div>
        <p className="muted small">Lay the sectors out on a hex map. Generate one from the factions and sectors you have, or start with an empty grid and paint it yourself.</p>
        <div className="row">
          <button className="primary" onClick={() => setGenOpen(true)}>Generate map…</button>
          <button onClick={() => setC((d) => void (d.map = defaultMap(d.factions.length)))}>Empty grid</button>
        </div>
        {genOpen && <GenerateDialog c={c} setC={setC} onClose={() => setGenOpen(false)} />}
      </div>
    );
  }
  return <MapEditor c={c} setC={setC} onRecord={onRecord} gm={gm} fog={fog} focus={focus} />;
}

export interface Focus { sectorId: string; n: number }

function MapEditor({ c, setC, onRecord, gm, fog, focus }: { c: Campaign; setC: SetC; onRecord?: (sectorId: string) => void; gm: boolean; fog?: string; focus?: Focus }) {
  const map = c.map!;
  const [tools, setTool] = useState<Tool>('select');
  const tool: Tool = gm ? tools : 'select';
  const [paintType, setPaintType] = useState<SectorType>('planet');
  const [paintOwner, setPaintOwner] = useState('');
  const [gmView, setViewAs] = useState('');
  // Whose eyes the map is seen through: that faction's fog of war, and where its detachments can reach this round.
  const viewAs = gm ? gmView : fog ?? '';
  const sight = useMemo(() => sightMap(c, viewAs || undefined), [c, viewAs]);
  const [sel, setSel] = useState<Hex | null>(null);
  useEffect(() => {
    const s = focus?.n ? c.sectors.find((x) => x.id === focus.sectorId) : undefined;
    if (!s || !isPlaced(s)) return;
    setSel({ q: s.q!, r: s.r! });
    setEditing(false);
    document.getElementById('sector-map')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [focus?.n]);
  const [moving, setMoving] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [genOpen, setGenOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number; px: number; py: number; moved: boolean } | null>(null);

  const all = useMemo(() => cells(map), [map.cols, map.rows]);
  const bounds = useMemo(() => {
    const pts = all.map((h) => toPixel(h, SIZE));
    const pad = SIZE * 1.2;
    const x0 = Math.min(...pts.map((p) => p.x)) - pad, y0 = Math.min(...pts.map((p) => p.y)) - pad;
    return { x0, y0, w: Math.max(...pts.map((p) => p.x)) + pad - x0, h: Math.max(...pts.map((p) => p.y)) + pad - y0 };
  }, [all]);
  const stars = useMemo(() => {
    const rand = rng(map.seed);
    const n = Math.round((bounds.w * bounds.h) / 900);
    return Array.from({ length: n }, () => ({ x: bounds.x0 + rand() * bounds.w, y: bounds.y0 + rand() * bounds.h, r: rand() < 0.08 ? 1.4 : 0.4 + rand() * 0.6, o: 0.25 + rand() * 0.6 }));
  }, [map.seed, bounds]);
  const nebulae = useMemo(() => {
    const rand = rng(map.seed + '-neb');
    const hues = ['#5fb3b3', '#8e44ad', '#b3352b', '#c9a24a'];
    return Array.from({ length: 3 }, () => ({ x: bounds.x0 + rand() * bounds.w, y: bounds.y0 + rand() * bounds.h, r: (0.25 + rand() * 0.3) * Math.max(bounds.w, bounds.h), c: hues[Math.floor(rand() * hues.length)] }));
  }, [map.seed, bounds]);

  const bySector = new Map(c.sectors.filter(isPlaced).map((s) => [hexKey(s.q, s.r), s]));
  const forces = useStore().state.forces;
  // Where the detachments stand, and where the viewer's can get to this round (the sectors bordering its territory if it has none).
  const posted = useMemo(() => detachmentsBySector(c, forces), [c, forces]);
  const front = useMemo(() => {
    if (!viewAs) return null;
    const mine = forces.filter((f) => f.nexus?.factionId === viewAs);
    if (!mine.length) return frontier(c, viewAs);
    return new Set(mine.flatMap((f) => [...reach(c, f).keys()]));
  }, [c, forces, viewAs]);
  const unplaced = c.sectors.filter((s) => !isPlaced(s));
  const color = (id?: string) => factionColor(c, id);
  const selSector = sel ? bySector.get(hexKey(sel.q, sel.r)) : undefined;
  const selSight = selSector && sight(selSector);

  const vw = bounds.w / zoom, vh = bounds.h / zoom;
  const vx = bounds.x0 + (bounds.w - vw) / 2 + pan.x, vy = bounds.y0 + (bounds.h - vh) / 2 + pan.y;

  const setSector = (id: string, fn: (s: Sector) => void) => setC((d) => { const s = d.sectors.find((x) => x.id === id); if (s) fn(s); });

  const clickHex = (h: Hex) => {
    const s = bySector.get(hexKey(h.q, h.r));
    switch (tool) {
      case 'select':
        setSel(h);
        setEditing(false);
        break;
      case 'type':
        if (s) setSector(s.id, (d) => {
          d.type = paintType;
          if (!BENEFITS.some((b) => b.type === d.type && b.id === d.benefit)) d.benefit = undefined;
          if (d.type === 'voidspawn') d.owner = ECHOES.id;
        });
        else setC((d) => void d.sectors.push({ id: uid(), type: paintType, q: h.q, r: h.r, ...rollSector(paintType) }));
        setSel(h);
        break;
      case 'owner':
        if (s && !isStronghold(s)) setSector(s.id, (d) => void (d.owner = paintOwner || undefined));
        else if (s) toast(s.type === 'home' ? 'Home sectors always belong to their faction.' : `Voidspawns always belong to the ${ECHOES.name}.`, 'error');
        break;
      case 'move':
        if (!moving) {
          if (s) setMoving(s.id);
          return;
        }
        setC((d) => {
          const m = d.sectors.find((x) => x.id === moving);
          const other = d.sectors.find((x) => x.q === h.q && x.r === h.r);
          if (!m) return;
          if (other && other !== m) [other.q, other.r] = [m.q, m.r];
          m.q = h.q;
          m.r = h.r;
        });
        setMoving(null);
        setSel(h);
        break;
      case 'unplace':
        if (s) setSector(s.id, (d) => void (d.q = d.r = undefined));
        break;
    }
  };

  // Drag to pan; a press that doesn't move is a click on the hex under it.
  const onDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y, moved: false };
  };
  const onMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d || !svgRef.current) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 5) return;
    if (!d.moved) svgRef.current.setPointerCapture(e.pointerId);
    d.moved = true;
    const k = vw / svgRef.current.getBoundingClientRect().width;
    setPan({ x: d.px - dx * k, y: d.py - dy * k });
  };
  const onUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved) return;
    const hex = (e.target as Element).closest('[data-q]');
    if (hex) clickHex({ q: Number(hex.getAttribute('data-q')), r: Number(hex.getAttribute('data-r')) });
  };

  const resize = (cols: number, rows: number) =>
    setC((d) => {
      d.map = { ...d.map!, cols, rows };
      clampToMap(d);
    });

  const exportPng = () => {
    const svg = svgRef.current;
    if (!svg) return;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    const scale = 2;
    clone.setAttribute('viewBox', `${bounds.x0} ${bounds.y0} ${bounds.w} ${bounds.h}`);
    clone.setAttribute('width', String(bounds.w * scale));
    clone.setAttribute('height', String(bounds.h * scale));
    clone.querySelectorAll('.hex-sel, .hex-front').forEach((n) => n.classList.remove('hex-sel', 'hex-front'));
    const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    style.textContent = MAP_EXPORT_CSS;
    clone.insertBefore(style, clone.firstChild);
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }));
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = bounds.w * scale;
      canvas.height = bounds.h * scale;
      canvas.getContext('2d')!.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob((b) => {
        if (!b) return;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(b);
        a.download = `${c.name.replace(/[^\w-]+/g, '_')}-map.png`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      toast('Could not render the map image.', 'error');
    };
    img.src = url;
  };

  const hint = tool === 'move' && moving ? `Moving ${c.sectors.find((s) => s.id === moving)?.name} — click its new hex.` : TOOLS.find((t) => t.key === tool)!.hint;

  return (
    <>
      <Panel id={gm ? 'campaign.map' : 'campaign.playerMap'} domId="sector-map" title="Sector map" extra={
        <div className="row">
          {gm && <button onClick={() => setGenOpen(true)}>Generate…</button>}
          {gm && <SpreadButton c={c} setC={setC} />}
          <button onClick={exportPng} title="Download the whole map as a picture">Export PNG</button>
        </div>
      }>

        {gm && <><div className="map-toolbar">
          <div className="seg">
            {TOOLS.map((t) => (
              <button key={t.key} className={tool === t.key ? 'on' : ''} title={t.hint} onClick={() => { setTool(t.key); setMoving(null); }}>{t.label}</button>
            ))}
          </div>
          {tool === 'type' && (
            <select value={paintType} onChange={(e) => setPaintType(e.target.value as SectorType)} aria-label="Type to paint">
              {SECTOR_TYPE_KEYS.map((t) => <option key={t} value={t}>{GLYPH[t]} {SECTOR_TYPES[t].label}</option>)}
            </select>
          )}
          {tool === 'owner' && (
            <select value={paintOwner} onChange={(e) => setPaintOwner(e.target.value)} aria-label="Owner to paint">
              <option value="">Unclaimed</option>
              {sidesOf(c).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          )}
          <span className="spacer" />
          <label className="row small">
            View as
            <select value={viewAs} onChange={(e) => setViewAs(e.target.value)} title="See the map as that faction does: its fog of war, and where its detachments can reach this round">
              <option value="">Everything (GM)</option>
              {c.factions.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </label>
          <span className="row small">
            Size <Stepper value={map.cols} min={3} onChange={(n) => resize(Math.min(n, 30), map.rows)} /> × <Stepper value={map.rows} min={3} onChange={(n) => resize(map.cols, Math.min(n, 30))} />
          </span>
        </div>
        <p className="muted small" style={{ margin: '0.25rem 0' }}>{hint}</p></>}
        {!gm && viewAs && <p className="muted small" style={{ margin: '0 0 0.25rem' }}>Fog of war: you see what your sectors can see. Dimmed sectors are ones you've seen before; who holds them now is unknown.</p>}

        <div className="map-wrap">
          <div className="map-view">
            <svg
              ref={svgRef}
              className={`hexmap tool-${tool}`}
              viewBox={`${vx} ${vy} ${vw} ${vh}`}
              xmlns="http://www.w3.org/2000/svg"
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerLeave={() => (drag.current = null)}
              onWheel={(e) => setZoom((z) => Math.min(4, Math.max(0.5, z * (e.deltaY < 0 ? 1.15 : 1 / 1.15))))}
            >
              <defs>
                {nebulae.map((n, i) => (
                  <radialGradient key={i} id={`neb${i}`}>
                    <stop offset="0" stopColor={n.c} stopOpacity="0.22" />
                    <stop offset="1" stopColor={n.c} stopOpacity="0" />
                  </radialGradient>
                ))}
                {c.sectors.filter((s) => isPlaced(s) && s.image).map((s) => {
                  const p = toPixel(s as Hex, SIZE);
                  return <clipPath key={s.id} id={`clip-${s.id}`}><polygon points={hexCorners(p.x, p.y, SIZE - 1)} /></clipPath>;
                })}
              </defs>
              <rect x={bounds.x0 - bounds.w} y={bounds.y0 - bounds.h} width={bounds.w * 3} height={bounds.h * 3} fill="#07080b" />
              {nebulae.map((n, i) => <circle key={i} cx={n.x} cy={n.y} r={n.r} fill={`url(#neb${i})`} />)}
              {stars.map((s, i) => <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#fff" opacity={s.o} />)}

              {all.map((h) => {
                const p = toPixel(h, SIZE);
                const s = bySector.get(hexKey(h.q, h.r));
                const isSel = !!sel && sel.q === h.q && sel.r === h.r;
                const known: Sight = s ? sight(s) : 'hidden';
                if (!s || known === 'hidden') {
                  return <polygon key={hexKey(h.q, h.r)} data-q={h.q} data-r={h.r} className={`hex hex-blank${isSel ? ' hex-sel' : ''}`} points={hexCorners(p.x, p.y, SIZE - 1)} />;
                }
                if (known === 'remembered') {
                  // Seen before: its type and name, nothing of who holds it now.
                  return (
                    <g key={s.id} data-q={h.q} data-r={h.r} className={`hex hex-${s.type}${isSel ? ' hex-sel' : ''}`} opacity={0.45}>
                      <polygon points={hexCorners(p.x, p.y, SIZE - 1)} className="hex-base" fill="#121418" />
                      <polygon points={hexCorners(p.x, p.y, SIZE - 1)} fill="none" className="hex-edge" stroke="#4a525c" strokeWidth={1} strokeDasharray="3 3" />
                      <text x={p.x} y={p.y + 3} className="hex-glyph">{GLYPH[s.type]}</text>
                      <text x={p.x} y={p.y + 21} className="hex-name">{s.name.length > 16 ? s.name.slice(0, 15) + '…' : s.name}</text>
                    </g>
                  );
                }
                const col = color(s.owner);
                const dim = front && s.owner !== viewAs && !front.has(s.id);
                return (
                  <g key={s.id} data-q={h.q} data-r={h.r} className={`hex hex-${s.type}${isSel ? ' hex-sel' : ''}${front?.has(s.id) ? ' hex-front' : ''}${moving === s.id ? ' hex-moving' : ''}`} opacity={dim ? 0.45 : 1}>
                    <polygon points={hexCorners(p.x, p.y, SIZE - 1)} className="hex-base" fill={s.type === 'empty' ? '#0e1014' : '#1a1d22'} />
                    {s.image && <image href={s.image} x={p.x - SIZE} y={p.y - SIZE} width={SIZE * 2} height={SIZE * 2} preserveAspectRatio="xMidYMid slice" clipPath={`url(#clip-${s.id})`} opacity="0.75" />}
                    {col && <polygon points={hexCorners(p.x, p.y, SIZE - 1)} fill={col} fillOpacity={s.image ? 0.15 : 0.3} />}
                    <polygon points={hexCorners(p.x, p.y, SIZE - (col ? 3 : 1))} fill="none" className="hex-edge" stroke={col ?? (front?.has(s.id) ? '#5fb3b3' : '#4a525c')} strokeWidth={col || front?.has(s.id) ? 3 : 1} />
                    <text x={p.x} y={p.y + 3} className="hex-glyph">{GLYPH[s.type]}</text>
                    <text x={p.x} y={p.y + 21} className="hex-name">{s.name.length > 16 ? s.name.slice(0, 15) + '…' : s.name}</text>
                    {isReinforced(s) && <text x={p.x - 15} y={p.y - 17} className="hex-mark"><title>Reinforced</title>⛨</text>}
                    {s.type === 'void' && s.rewardClaimed && <text x={p.x + 15} y={p.y - 17} className="hex-mark"><title>Reward claimed</title>✓</text>}
                    {stormed(c, s.id) && <text x={p.x} y={p.y - 17} className="hex-mark"><title>{activeEvent(c)?.name}: can't be attacked this round</title>🌀</text>}
                    {activeCrisis(c)?.sectorId === s.id && <text x={p.x - 15} y={p.y - 17} className="hex-mark"><title>Nexus Crisis: {lordById(activeCrisis(c)!.lord)?.name}</title>☠</text>}
                    {s.guardian && <text x={p.x + 15} y={p.y - 17} className="hex-mark"><title>Guardian: {s.guardian.name} ({s.guardian.tier})</title>♛</text>}
                    {markOn(c, s.id) && !markOn(c, s.id)!.brokenBy && (
                      <text x={p.x + 19} y={p.y + 13} className="hex-mark hex-echo"><title>{MARK_TIP}</title>⚠</text>
                    )}
                    {s.difficulty !== undefined && aiDefended(s) && <text x={p.x} y={p.y + 32} className="hex-diff"><title>AI garrison: {s.difficulty} Supply</title>{s.difficulty}</text>}
                    {/* Detachments: your own always, anyone else's only while you can see the sector. */}
                    {(() => {
                      const here = (posted.get(s.id) ?? []).filter((f) => !viewAs || known === 'visible' || f.nexus?.factionId === viewAs);
                      return here.length > 0 && (
                        <g className="hex-force" transform={`translate(${p.x - 19}, ${p.y + 9})`}>
                          <title>{here.map((x) => detachmentName(c, forces, x)).join(', ')}</title>
                          {(() => {
                            // The first detachment's emblem if it has one, ringed in its faction's colour; else the plain marker.
                            const layers = emblemLayers(here[0].emblem);
                            const col = color(here[0].nexus?.factionId) ?? '#888';
                            if (!layers) return <>
                              <circle r={6.5} fill={col} stroke="#07080b" strokeWidth={1.5} />
                              <text y={3} className="hex-force-n">{here.length > 1 ? here.length : '⚑'}</text>
                            </>;
                            return <>
                              <circle r={9} fill="#07080b" stroke={col} strokeWidth={1.6} />
                              <g transform="translate(-7 -7) scale(0.14)"><EmblemShapes layers={layers} /></g>
                              {here.length > 1 && <>
                                <circle cx={7} cy={-7} r={4.2} fill={col} stroke="#07080b" strokeWidth={1} />
                                <text x={7} y={-5} className="hex-force-n" style={{ fontSize: 6 }}>{here.length}</text>
                              </>}
                            </>;
                          })()}
                        </g>
                      );
                    })()}
                  </g>
                );
              })}
              {/* Marauders: everyone sees them, fog or not. */}
              {(c.marauders ?? []).map((m, i, all) => {
                const s = c.sectors.find((x) => x.id === m.sectorId);
                if (!s || !isPlaced(s)) return null;
                const p = toPixel(s as Hex, SIZE);
                const n = all.slice(0, i).filter((x) => x.sectorId === m.sectorId).length;
                return (
                  <g key={m.id} data-q={s.q} data-r={s.r} className="hex-band" transform={`translate(${p.x + 19 - n * 9}, ${p.y + 9})`}>
                    <title>{m.name}: Marauders, {m.strength} Supply</title>
                    <circle r={6.5} />
                    <text y={3}>🏴</text>
                  </g>
                );
              })}
            </svg>
            <div className="map-zoom">
              <button className="icon" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(4, z * 1.25))}>+</button>
              <button className="icon" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.5, z / 1.25))}>−</button>
              <button className="icon" aria-label="Reset view" title="Reset view" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>⟲</button>
            </div>
          </div>

          <div className="map-side">
            {!sel && <SideIntro c={c} unplaced={gm ? unplaced : []} />}
            {sel && selSector && selSight !== 'hidden' && (editing && gm
              ? <SectorEditor c={c} s={selSector} setSector={(fn) => setSector(selSector.id, fn)} setC={setC} onDone={() => setEditing(false)} onDeleted={() => setSel(null)} />
              : <SectorView c={c} s={selSector} sight={selSight!} gm={gm} viewer={viewAs} setC={setC}
                onEdit={() => setEditing(true)} onRecord={onRecord && (() => onRecord(selSector.id))} />)}
            {sel && (selSector ? selSight === 'hidden' : !gm) && <Uncharted />}
            {selSector && <MarauderBox c={c} s={selSector} gm={gm} setC={setC} />}
            {sel && !selSector && gm && <EmptyHex c={c} h={sel} unplaced={unplaced} setC={setC} />}
          </div>
        </div>

        <div className="map-legend small muted">
          {SECTOR_TYPE_KEYS.map((t) => <span key={t} title={SECTOR_TYPES[t].desc}>{GLYPH[t]} {SECTOR_TYPES[t].label}</span>)}
          <span>⛨ Reinforced</span>
          <span>✓ Reward claimed</span>
          <span>♛ Guardian</span>
          <span>🏴 Marauders</span>
          {sidesOf(c).map((f) => <span key={f.id}><i className="swatch" style={{ background: f.color }} /> {f.name}</span>)}
        </div>

      </Panel>
      {/* Outside the panel so Generate… still opens it while the map is collapsed. */}
      {genOpen && <GenerateDialog c={c} setC={setC} onClose={() => setGenOpen(false)} />}
    </>
  );
}

function SideIntro({ c, unplaced }: { c: Campaign; unplaced: Sector[] }) {
  return (
    <>
      <h3>{c.name}</h3>
      <p className="muted small">Click a hex to see its sector. Drag to pan; scroll or use the buttons to zoom.</p>
      {!c.factions.length && <p className="muted small">No factions on the map yet.</p>}
      {sidesOf(c).map((f) => {
        const n = c.sectors.filter((s) => s.owner === f.id).length;
        if (f.id === ECHOES.id && !n) return null;
        return <div key={f.id} className="row small"><i className="swatch" style={{ background: f.color }} /> <b>{f.name}</b> <span className="muted">{n} sector{n === 1 ? '' : 's'}</span></div>;
      })}
      {unplaced.length > 0 && <p className="small" style={{ color: 'var(--warn)' }}>{unplaced.length} sector{unplaced.length === 1 ? ' is' : 's are'} not on the map: {unplaced.map((s) => s.name).join(', ')}. Click an empty hex to place one.</p>}
    </>
  );
}

function Uncharted() {
  return (
    <>
      <h3>Uncharted space</h3>
      <p className="muted small">Beyond your sight: nothing is known of this hex. Take a sector nearby, or raise a Watchtower, to see further.</p>
    </>
  );
}

function SectorView({ c, s, sight, gm, viewer, setC, onEdit, onRecord }: {
  c: Campaign; s: Sector; sight: Sight; gm: boolean; viewer: string; setC: SetC; onEdit: () => void; onRecord?: () => void;
}) {
  const forces = useStore().state.forces;
  const benefit = benefitOf(s);
  const games = c.log.filter((e) => e.sectorId === s.id).slice(-4).reverse();
  const blocked = homeChallengeBlock(c, s);
  const ownerColor = factionColor(c, s.owner);
  const running = useStore().state.battle;
  if (sight === 'remembered') {
    return (
      <>
        {s.image && <img className="sector-art" src={s.image} alt="" />}
        <h3 style={{ marginBottom: 0 }}>{s.name}</h3>
        <div className="small"><span className="tag">{GLYPH[s.type]} {SECTOR_TYPES[s.type].label}</span><span className="tag">Out of sight</span></div>
        <p className="small muted">You've seen this sector before, but it's beyond your sight now: who holds it, and what guards it, is unknown.</p>
        {s.notes && <p className="small lore">{s.notes}</p>}
      </>
    );
  }
  const g = s.guardian;
  const manage = produces(s) && !!s.owner && c.factions.some((f) => f.id === s.owner) && (gm || viewer === s.owner);
  return (
    <>
      {s.image && <img className="sector-art" src={s.image} alt="" />}
      <h3 style={{ marginBottom: 0 }}>{s.name}</h3>
      <div className="small">
        <span className="tag">{GLYPH[s.type]} {SECTOR_TYPES[s.type].label}</span>
        <span className="tag" style={ownerColor ? { borderColor: ownerColor, color: ownerColor } : undefined}>{factionName(c, s.owner)}</span>
        {isReinforced(s) && <span className="tag">⛨ Reinforced{hasBuilding(s, 'walls') ? ' (Walls)' : ''}</span>}
        {s.type === 'void' && s.rewardClaimed && <span className="tag">✓ Reward claimed</span>}
        {stormed(c, s.id) && <span className="tag red">🌀 {activeEvent(c)?.name}: can't be attacked this round</span>}
        {activeCrisis(c)?.sectorId === s.id && <span className="tag red">☠ Nexus Crisis: {lordById(activeCrisis(c)!.lord)?.name} rises here</span>}
        {isRaided(c, s) && <span className="tag red">🏴 Raided: produces nothing this round</span>}
        <EchoMarkTag c={c} s={s} gm={gm} viewer={viewer} setC={setC} />
      </div>
      <p className="small">{benefit ? <><b>{benefit.name}:</b> {benefit.desc}</> : SECTOR_TYPES[s.type].desc}</p>
      <SectorDanger s={s} />
      {g && (
        <p className="small" title={g.unit.notes}>
          <span className={`tag${g.tier === 'Legendary' ? ' gold' : g.tier === 'Rare' ? ' red' : ''}`}>♛ {g.tier} guardian</span>{' '}
          <b>{g.name}</b>, a {g.unit.unitType} ({g.unit.points} pts) with doubled Tough{g.unit.relics[0] ? <>, carrying <b>{g.unit.relics[0].name}</b></> : ''}.
          {' '}It leads the garrison{s.difficulty !== undefined ? <>: <b>{s.difficulty} Supply</b> in all</> : ''}. Slay it with a Hero and roll {GUARDIANS.stealRoll}+ to take its relic.
        </p>
      )}
      {manage && <ProductionBox s={s} />}
      <DetachmentsHere c={c} s={s} forces={forces} gm={gm} setC={setC} />
      {s.notes && <p className="small lore">{s.notes}</p>}
      {games.length > 0 && (
        <div className="small">
          <b>Recent games</b>
          {games.map((e) => <div key={e.id} className="muted">{e.date}: {e.crisis ? `Nexus Crisis — ${e.winner === ECHOES.id ? 'the Echo Lord prevailed' : 'the Echo Lord fell'}` : `${factionName(c, e.attacker)} vs ${factionName(c, e.defender)} — ${e.winner ? `${factionName(c, e.winner)} won` : 'draw'}`}</div>)}
        </div>
      )}
      {blocked && <p className="small"><span className="tag red">{blocked}</span></p>}
      {running?.sectorId === s.id && <p className="small">⚔ <a href={href.tracker()}>{running.mission.name}</a> is being fought here, round {running.round}.</p>}
      <div className="row" style={{ marginTop: '0.75rem' }}>
        <a className="btn primary" href={href.tracker(s.id)} title="Open the battle tracker set up for this sector; finishing the battle updates the map">⚔ Start a battle here</a>
        {gm && onRecord && <button onClick={onRecord} title="Log a game you didn't track">Record a game here</button>}
        {gm && <button onClick={onEdit}>Edit</button>}
      </div>
    </>
  );
}

/** The Marauder bands in a sector, and (for the GM) logging a game against one. */
function MarauderBox({ c, s, gm, setC }: { c: Campaign; s: Sector; gm: boolean; setC: SetC }) {
  const bands = bandsAt(c, s.id);
  const [by, setBy] = useState('');
  if (!bands.length) return null;
  const who = by || s.owner && c.factions.some((f) => f.id === s.owner) && s.owner || c.factions[0]?.id || '';
  const fight = (bandId: string, won: boolean) => setC((d) => {
    const e: CampaignEvent = { id: uid(), date: localDate(), sectorId: s.id, attacker: who, defender: MARAUDER_ID, winner: won ? who : MARAUDER_ID, notes: '' };
    recordMarauderGame(d, e, bandId);
    toast(won ? `${factionName(d, who)} broke the band${e.loot ? ` and found ${e.loot.name}` : ''}.` : 'The Marauders held.');
  });
  return (
    <div className="marauder-box small">
      {bands.map((m) => {
        const tier = marauderTier(m);
        return (
          <div key={m.id}>
            <span className="tag red">🏴 Marauders</span> <b>{m.name}</b>: <b>{m.strength} Supply</b>, about since round {m.since}.
            {' '}Beat them and roll <span className={`tag${tier === 'Legendary' ? ' gold' : tier === 'Rare' ? ' red' : ''}`}>{tier}</span> Guardian loot.
            {gm && c.factions.length > 0 && (
              <div className="row" style={{ marginTop: '0.35rem' }}>
                <select value={who} onChange={(e) => setBy(e.target.value)} aria-label="Faction fighting the band">
                  {c.factions.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
                <button onClick={() => fight(m.id, true)} title="Log the game: the band is broken and the winner rolls loot">Beat them</button>
                <button onClick={() => fight(m.id, false)} title="Log the game: the band stays">Lost</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Each placed sector's detachments (forces linked to a faction), where they stand. */
function detachmentsBySector(c: Campaign, forces: Force[]) {
  const out = new Map<string, Force[]>();
  for (const f of forces) {
    if (!f.nexus || !c.factions.some((x) => x.id === f.nexus!.factionId)) continue;
    const at = positionOf(c, f);
    if (at) out.set(at.id, [...(out.get(at.id) ?? []), f]);
  }
  return out;
}

/** The detachments in a sector (the viewer's own, or anyone's it can see), and the GM moving one here by hand. */
function DetachmentsHere({ c, s, forces, gm, setC }: { c: Campaign; s: Sector; forces: Force[]; gm: boolean; setC: SetC }) {
  const all = detachmentsBySector(c, forces);
  const here = all.get(s.id) ?? [];
  const elsewhere = [...all.entries()].filter(([id]) => id !== s.id).flatMap(([, fs]) => fs);
  const move = (f: Force) => setC((d) => setPosition(d, f.id, { sectorId: s.id, factionId: f.nexus!.factionId }));
  if (!here.length && !gm) return null;
  return (
    <div className="small">
      {here.length > 0 && (
        <p style={{ margin: '0.4rem 0' }}>
          <b>Detachments here:</b>{' '}
          {here.map((f) => (
            <span key={f.id} className="tag" style={{ borderColor: factionColor(c, f.nexus?.factionId) }}>
              {emblemLayers(f.emblem) ? <EmblemBadge emblem={f.emblem} size={14} /> : '⚑'} {detachmentName(c, forces, f)}
            </span>
          ))}
        </p>
      )}
      {gm && elsewhere.length > 0 && (
        <select value="" aria-label="Move a detachment here" title="Put a detachment here by hand, outside the orders"
          onChange={(e) => { const f = elsewhere.find((x) => x.id === e.target.value); if (f) move(f); }}>
          <option value="">Move a detachment here…</option>
          {elsewhere.map((f) => <option key={f.id} value={f.id}>{detachmentName(c, forces, f)} ({positionOf(c, f)?.name})</option>)}
        </select>
      )}
    </div>
  );
}

/** A held planet's production: its bank, its buildings, and starting a new one. */
function ProductionBox({ s }: { s: Sector }) {
  const { state, update } = useStore();
  const [pick, setPick] = useState('');
  const [payerId, setPayer] = useState('');
  const forces = state.forces.filter((f) => f.nexus?.factionId === s.owner);
  const b = pick ? buildingById(pick) : undefined;
  // Shards come from the chosen force, or the richest one.
  const payer = forces.find((f) => f.id === payerId) ?? [...forces].sort((x, y) => y.umbraShards - x.umbraShards)[0];
  const c = state.campaign;
  const owner = c?.factions.find((f) => f.id === s.owner);
  const block = pick ? buildBlock(s, pick, payer, c) : undefined;
  // What the owner can build here: researched, and home-only ones at home.
  const options = BUILDINGS.filter((x) => !hasBuilding(s, x.id) && knows(owner, x) && (!x.homeOnly || s.type === 'home'));
  const locked = BUILDINGS.filter((x) => !knows(owner, x)).length;
  const k = s.construction;
  const going = k ? buildingById(k.id) : undefined;
  const built = s.buildings ?? [];
  const free = freeSlots(s, c ?? undefined);
  const today = localDate();
  const edit = (fn: (x: Sector, c: Campaign, forces: Force[]) => void) => update((d) => {
    const x = d.campaign?.sectors.find((y) => y.id === s.id);
    if (!x || !d.campaign) return;
    fn(x, d.campaign, d.forces);
    d.campaign.updatedAt = nowIso();
  });
  const price = (x: { cost: number; shards: number }) => `${x.cost} Materials${x.shards ? ` + ${x.shards} US` : ''}`;
  // What a building costs here: an Architect Warlord's faction pays less.
  const priced = (x: { cost: number; shards: number }) => ({ ...x, cost: buildCost(x, s, c ?? undefined) });
  const rate = productionRate(s, c ?? undefined);
  const cap = bankCap(s, c ?? undefined);
  const trade = tradeBonus(s, c ?? undefined);
  const X = PRODUCTION.exchange;
  const coreBlocked = c ? coreBlock(c, s) : 'No campaign';
  const trade1 = (t: ExchangeTrade) => (c ? exchangeBlock(c, s, t, payer) : 'No campaign');
  return (
    <div className="small" style={{ margin: '0.5rem 0' }}>
      <div>
        <b>⚒ Production</b>{' '}
        <span className="muted" title={`Banks ${rate} Materials each round${trade ? ` (${trade} from its Trade Hub)` : ''}, up to ${cap}. Lost if the sector is taken.`}>
          {s.bank ?? 0}/{cap} Materials banked · +{rate} a round
        </span>
      </div>
      <div className="muted" style={{ marginTop: '0.25rem' }}>
        Buildings: {built.length + (k ? 1 : 0)} of {buildingSlots(s, c ?? undefined)} slots used{s.core && <> · <span className="tag gold" title="Building Expansion: one more building slot">✦ Building Expansion</span></>}
      </div>
      {built.map((id) => {
        const x = buildingById(id);
        return (
          <div key={id} className="row" title={x?.desc}>
            <span className="grow">
              {x?.icon} {x?.name ?? id} {x?.rule === 'table' && <span className="tag" title="The app doesn't apply this one: remember it at the table">at the table</span>}{' '}
              <span className="muted">— {x?.desc}</span>
            </span>
            <button className="ghost icon" aria-label={`Tear down ${x?.name ?? id}`} title="Tear down (no refund)"
              onClick={() => confirmAction(`Tear down the ${x?.name ?? id} at ${s.name}? There's no refund.`) && edit((y) => demolish(y, id))}>✕</button>
          </div>
        );
      })}
      {k && (
        <div className="row" title={going?.desc}>
          <span className="grow">
            🏗 {going?.name ?? k.id} <span className="tag gold">building</span>{' '}
            <span className="muted">— finished when round {k.round} ends. Paid {price({ cost: k.supply, shards: k.shards })}.</span>
          </span>
          <button className="ghost" title="Stop building; everything paid comes back"
            onClick={() => confirmAction(`Stop building the ${going?.name ?? k.id}? The ${price({ cost: k.supply, shards: k.shards })} paid comes back.`)
              && edit((y, _c, fs) => cancelBuilding(y, fs, today, uid))}>Cancel</button>
        </div>
      )}
      {!k && free > 0 && (
        <>
          <div className="row" style={{ marginTop: '0.25rem' }}>
            <select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Building to start" style={{ minWidth: 0, flex: 1 }}>
              <option value="">Start a building…</option>
              {options.map((x) => (
                <option key={x.id} value={x.id}>{x.icon} {x.name} — {price(priced(x))}</option>
              ))}
            </select>
            <button className="primary" disabled={!pick || !!block} title={block} onClick={() => {
              edit((y, c, fs) => void build(c, y, pick, fs.find((f) => f.id === payer?.id), today, uid));
              toast(`${b!.name} started at ${s.name}: finished when the round ends.`);
              setPick('');
            }}>Start</button>
          </div>
          {b && (
            <div className="muted" style={{ marginTop: '0.25rem' }}>
              {b.desc}{' '}
              {b.shards > 0 && forces.length > 1 && (
                <label>Shards from{' '}
                  <select value={payer?.id ?? ''} onChange={(e) => setPayer(e.target.value)} aria-label="Force paying the Umbra Shards">
                    {forces.map((f) => <option key={f.id} value={f.id}>{f.name} ({f.umbraShards} US)</option>)}
                  </select>
                </label>
              )}
            </div>
          )}
          {b && <div className={block ? '' : 'muted'}>{block ? <span className="tag red">{block}</span>
            : <>Costs {buildCost(b, s, c ?? undefined)} of the {s.bank ?? 0} banked Materials{b.shards ? <> and {b.shards} of {payer?.name}'s {payer?.umbraShards} Umbra Shards</> : ''}, now. Finished when the round ends.</>}</div>}
        </>
      )}
      {!k && free > 0 && locked > 0 && <div className="muted">{locked} more building{locked === 1 ? '' : 's'} to research in the tech tree (the Research panel).</div>}
      {!k && free <= 0 && <div className="muted">Every slot is built. Tear one down (✕) to build something else.</div>}
      {hasBuilding(s, 'exchange') && (
        <div className="row" style={{ marginTop: '0.25rem' }}>
          <span className="grow">⇄ Grand Exchange{s.exchanged === (c?.round ?? 1) ? <span className="muted"> — traded this round</span> : <span className="muted"> — once a round, with {payer?.name ?? 'a force'}</span>}</span>
          {([['buyShard', `${X.materials} Materials → ${X.shards} US`], ['sellShard', `${X.shards} US → ${X.back} Materials`]] as [ExchangeTrade, string][]).map(([t, label]) => (
            <button key={t} disabled={!!trade1(t)} title={trade1(t)} onClick={() => {
              edit((y, cc, fs) => {
                const f = fs.find((x) => x.id === payer?.id);
                if (f) exchange(cc, y, t, f, today, uid);
              });
              toast(`Traded ${label} at ${s.name}.`);
            }}>{label}</button>
          ))}
        </div>
      )}
      {s.type === 'planet' && !s.core && (owner?.cores ?? 0) > 0 && (
        <div className="row" style={{ marginTop: '0.25rem' }}>
          <span className="grow">✦ {owner?.name} has {owner?.cores} Building Expansion{owner?.cores === 1 ? '' : 's'}: install one here for a building slot more, for good.</span>
          <button disabled={!!coreBlocked} title={coreBlocked} onClick={() => confirmAction(`Install a Building Expansion at ${s.name}? It can't be moved again, and stays if the planet is taken.`)
            && edit((y, cc) => void installCore(cc, y))}>Install</button>
        </div>
      )}
      <details className="muted" style={{ marginTop: '0.25rem' }}>
        <summary>How building works</summary>
        <ul style={{ margin: '0.25rem 0', paddingLeft: '1.2rem' }}>
          <li>A sector builds <b>one building at a time</b>. Pay when you start it; it's <b>finished when the round ends</b> and works from the next round.</li>
          <li>Every building costs banked Materials from this sector. The stronger ones also cost Umbra Shards from one of your forces.</li>
          <li>Tier 1 buildings are known from the start; the others are researched in the tech tree first. Some can only be built at a home.</li>
          <li>Buildings marked <i>at the table</i> aren't applied by the app: remember them when you play here.</li>
          <li>Changed your mind? Cancel before the round ends and everything paid comes back.</li>
          <li>If the sector is taken, its bank and anything still being built are lost; finished buildings stay, for the new owner.</li>
          <li>New units are produced here from the force page, paid from the same bank.</li>
        </ul>
      </details>
    </div>
  );
}

function SectorEditor({ c, s, setSector, setC, onDone, onDeleted }: {
  c: Campaign; s: Sector; setSector: (fn: (s: Sector) => void) => void; setC: SetC; onDone: () => void; onDeleted: () => void;
}) {
  const benefits = BENEFITS.filter((b) => b.type === s.type);
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div className="fields">
      <label className="field span-all">Name<TextField value={s.name} onCommit={(v) => setSector((d) => void (d.name = v || d.name))} /></label>
      <label className="field">
        Type
        <select value={s.type} onChange={(e) => setSector((d) => {
          d.type = e.target.value as SectorType;
          if (!BENEFITS.some((b) => b.type === d.type && b.id === d.benefit)) d.benefit = undefined;
          if (d.type === 'voidspawn') d.owner = ECHOES.id;
        })}>
          {SECTOR_TYPE_KEYS.map((t) => <option key={t} value={t}>{SECTOR_TYPES[t].label}</option>)}
        </select>
      </label>
      <label className="field">
        Controlled by
        <select value={s.owner ?? ''} disabled={s.type === 'voidspawn'} onChange={(e) => setSector((d) => void (d.owner = e.target.value || undefined))}>
          <option value="">Unclaimed</option>
          {sidesOf(c).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      </label>
      {benefits.length > 0 && (
        <label className="field span-all">
          Benefit
          <select value={s.benefit ?? ''} onChange={(e) => setSector((d) => void (d.benefit = e.target.value || undefined))}>
            <option value="">— choose —</option>
            {benefits.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
      )}
      <div className="span-all row small">
        <label className="row"><input type="checkbox" checked={!!s.reinforced} onChange={(e) => setSector((d) => void (d.reinforced = e.target.checked || undefined))} /> Reinforced</label>
        {s.type === 'void' && <label className="row"><input type="checkbox" checked={!!s.rewardClaimed} onChange={(e) => setSector((d) => void (d.rewardClaimed = e.target.checked || undefined))} /> Reward claimed</label>}
      </div>
      <label className="field span-all">Lore<TextArea value={s.notes} rows={4} placeholder="Lore, terrain, rumours…" onCommit={(v) => setSector((d) => void (d.notes = v))} /></label>
      <div className="span-all row">
        <button onClick={() => setSector((d) => { const r = rollSector(d.type); d.name = r.name; d.notes = r.notes; })} title="Random name and lore">🎲 Reroll name &amp; lore</button>
      </div>
      <div className="span-all row">
        {s.image && <img className="sector-art thumb" src={s.image} alt="" />}
        <button onClick={() => fileRef.current?.click()}>{s.image ? 'Replace art' : 'Add art'}</button>
        {s.image && <button className="ghost" onClick={() => setSector((d) => void (d.image = undefined))}>Remove art</button>}
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          try {
            const url = await readImageAsDataUrl(file, 384);
            setSector((d) => void (d.image = url));
          } catch (err) {
            toast((err as Error).message, 'error');
          }
        }} />
      </div>
      <div className="span-all row">
        <button className="primary" onClick={onDone}>Done</button>
        <span className="spacer" />
        <button className="ghost" onClick={() => setSector((d) => void (d.q = d.r = undefined))} title="Keeps the sector in the list">Take off map</button>
        <button className="danger" onClick={() => {
          if (!confirmAction(`Delete ${s.name}? Its log entries stay but will show "Deleted sector".`)) return;
          setC((d) => void (d.sectors = d.sectors.filter((x) => x.id !== s.id)));
          onDeleted();
        }}>Delete</button>
      </div>
    </div>
  );
}

function EmptyHex({ c, h, unplaced, setC }: { c: Campaign; h: Hex; unplaced: Sector[]; setC: SetC }) {
  const [type, setType] = useState<SectorType>('planet');
  const [place, setPlace] = useState('');
  const col = h.q + Math.floor(h.r / 2) + 1;
  return (
    <>
      <h3>Open space</h3>
      <p className="muted small">Column {col}, row {h.r + 1}.</p>
      <div className="fields">
        <label className="field span-all">
          New sector
          <span className="row">
            <select value={type} onChange={(e) => setType(e.target.value as SectorType)}>
              {SECTOR_TYPE_KEYS.map((t) => <option key={t} value={t}>{SECTOR_TYPES[t].label}</option>)}
            </select>
            <button className="primary" onClick={() => setC((d) => void d.sectors.push({ id: uid(), type, q: h.q, r: h.r, ...rollSector(type) }))}>Create</button>
          </span>
        </label>
        {unplaced.length > 0 && (
          <label className="field span-all">
            Place an existing sector
            <span className="row">
              <select value={place} onChange={(e) => setPlace(e.target.value)}>
                <option value="">— choose —</option>
                {unplaced.map((s) => <option key={s.id} value={s.id}>{s.name} ({factionName(c, s.owner)})</option>)}
              </select>
              <button disabled={!place} onClick={() => setC((d) => { const s = d.sectors.find((x) => x.id === place); if (s) [s.q, s.r] = [h.q, h.r]; })}>Place</button>
            </span>
          </label>
        )}
      </div>
    </>
  );
}

function GenerateDialog({ c, setC, onClose }: { c: Campaign; setC: SetC; onClose: () => void }) {
  const forces = useStore().state.forces;
  // Never smaller than the default, so an old small map grows to fit the default sector counts.
  const fit = defaultMap(c.factions.length);
  const base = { cols: Math.max(fit.cols, c.map?.cols ?? 0), rows: Math.max(fit.rows, c.map?.rows ?? 0) };
  const [o, setO] = useState<GenOptions>({
    cols: base.cols, rows: base.rows, seed: randomSeed(), counts: defaultCounts(c.factions.length, base.cols, base.rows), startingSectors: 1,
    replace: c.sectors.some((s) => !isStronghold(s)),
  });
  const set = (p: Partial<GenOptions>) => setO({ ...o, ...p });
  // A new size resets the counts to fill the same share of it.
  const resize = (cols: number, rows: number) => set({ cols, rows, counts: defaultCounts(c.factions.length, cols, rows) });
  const setCount = (t: keyof GenCounts, n: number) => set({ counts: { ...o.counts, [t]: n } });
  const total = c.factions.length + Object.values(o.counts).reduce((a, b) => a + b, 0);
  const tooSmall = total > o.cols * o.rows;
  const keep = c.sectors.filter((s) => !isStronghold(s)).length;

  const run = () => {
    if (o.replace && keep && !confirmAction(`Replace mode deletes ${keep} sector${keep === 1 ? '' : 's'} (with their lore and art). Continue?`)) return;
    setC((d) => {
      generateMap(d, o);
      rateSectors(d, forces, rng(o.seed + ':mods'), { reroll: true });
    });
    toast('Map generated.');
    onClose();
  };

  return (
    <Modal title="Generate sector map" onClose={onClose} wide
      footer={<><span className="muted small grow">{tooSmall ? `${total} sectors won't fit on a ${o.cols}×${o.rows} grid.` : `${total} sectors on a ${o.cols}×${o.rows} grid.`}</span><button onClick={onClose}>Cancel</button><button className="primary" onClick={run}>Generate</button></>}>
      {c.factions.length === 0 && <p className="small" style={{ color: 'var(--warn)' }}>Add the factions first — each one's home sector is spread across the map.</p>}
      <div className="cols-2">
        <div className="fields">
          <label className="field">Columns<Stepper value={o.cols} min={3} onChange={(n) => resize(Math.min(n, 30), o.rows)} /></label>
          <label className="field">Rows<Stepper value={o.rows} min={3} onChange={(n) => resize(o.cols, Math.min(n, 30))} /></label>
          <label className="field span-all">
            Seed
            <span className="row"><input value={o.seed} onChange={(e) => set({ seed: e.target.value })} /><button onClick={() => set({ seed: randomSeed() })} title="New seed">🎲</button></span>
            <span className="muted small">The same seed and settings give the same map.</span>
          </label>
          <label className="field span-all">
            Starting sectors per faction
            <Stepper value={o.startingSectors} min={0} onChange={(n) => set({ startingSectors: n })} />
            <span className="muted small">Each faction takes its nearest unclaimed sectors (never void sectors).</span>
          </label>
        </div>
        <div className="fields">
          {(Object.keys(o.counts) as (keyof GenCounts)[]).map((t) => (
            <label key={t} className="field" title={SECTOR_TYPES[t].desc}>{GLYPH[t]} {SECTOR_TYPES[t].label}<Stepper value={o.counts[t]} min={0} onChange={(n) => setCount(t, n)} /></label>
          ))}
          <label className="span-all row small">
            <input type="checkbox" checked={o.replace} onChange={(e) => set({ replace: e.target.checked })} />
            Replace existing sectors (keeps home sectors and Voidspawns)
          </label>
          {!o.replace && <p className="span-all muted small" style={{ margin: 0 }}>Existing sectors stay where they are and count toward the totals; only the gaps are filled.</p>}
        </div>
      </div>
    </Modal>
  );
}

/** Styles inlined into the exported PNG, which can't see the page's stylesheet. */
const MAP_EXPORT_CSS = `
  .hex-blank { fill: rgba(255,255,255,0.015); stroke: rgba(255,255,255,0.09); }
  .hex-glyph { fill: #c9a24a; font: 20px Georgia, serif; text-anchor: middle; }
  .hex-research .hex-glyph { fill: #8fc1e3; }
  .hex-void .hex-glyph { fill: #5fb3b3; }
  .hex-archive .hex-glyph { fill: #e3c97a; }
  .hex-anomaly .hex-glyph { fill: #b583d6; }
  .hex-empty .hex-glyph { fill: #666; }
  .hex-name { fill: #d9d4c7; font: 600 7.5px 'Segoe UI', sans-serif; text-anchor: middle; paint-order: stroke; stroke: #07080b; stroke-width: 2.5px; }
  .hex-mark { fill: #d9d4c7; font: 11px sans-serif; text-anchor: middle; }
  .hex-echo { fill: #e05a4a; font-size: 13px; }
  .hex-force-n { fill: #07080b; font: 700 8px sans-serif; text-anchor: middle; }
`;

const MARK_TIP = `The ${ECHOES.name} are massing here. It falls when the round ends unless a detachment of yours stands here `
  + `or someone wins a Battle against the ${ECHOES.name} and breaks the mark.`;

/** A sector the Echoes have marked: who's holding the line, and a way to break the mark with a Battle won against them. */
function EchoMarkTag({ c, s, gm, viewer, setC }: { c: Campaign; s: Sector; gm: boolean; viewer: string; setC: SetC }) {
  const forces = useStore().state.forces;
  const m = markOn(c, s.id);
  if (!m || s.owner === ECHOES.id) return null;
  const held = holders(c, s, forces);
  // The GM breaks for whoever has a break to spend; a player only for their own faction.
  const can = c.factions.filter((f) => (gm || f.id === viewer) && breaksLeft(c, f.id) > 0);
  const breakIt = (factionId: string) => {
    setC((d) => void breakMark(d, s.id, factionId));
    toast(`${factionName(c, factionId)} broke the ${ECHOES.name}' mark on ${s.name}.`);
  };
  if (m.brokenBy)
    return <>
      <span className="tag green">🛡 Mark broken by {factionName(c, m.brokenBy)}: the {ECHOES.name} won't take it this round</span>
      {gm && <button className="small" onClick={() => setC((d) => restoreMark(d, s.id))} title="Undo the break">Restore mark</button>}
    </>;
  return <>
    <span className={`tag ${held.length ? 'green' : 'red'}`} title={MARK_TIP}>
      ⚠ The {ECHOES.name} are massing here{held.length ? `: ${held.map((id) => factionName(c, id)).join(', ')} hold${held.length === 1 ? 's' : ''} the line` : ': it falls when the round ends'}
    </span>
    {!held.length && can.map((f) => (
      <button key={f.id} className="small" onClick={() => breakIt(f.id)}
        title={`${f.name} won a Battle against the ${ECHOES.name} this round: spend it to keep them out of ${s.name}`}>
        Break this mark{gm && can.length > 1 ? ` (${f.name})` : ''}
      </button>
    ))}
  </>;
}

/** Let the Void Echoes spread one sector by hand (the Echoes also spread when the GM ends a round). */
function SpreadButton({ c, setC }: { c: Campaign; setC: SetC }) {
  if (!c.sectors.some((s) => s.owner === ECHOES.id)) return null;
  const options = spreadTargets(c);
  const spread = () => {
    if (!confirmAction(`Let the ${ECHOES.name} spread into a random neighbouring sector?`)) return;
    const target = pickSpread(c);
    if (!target) return;
    setC((d) => void spreadInto(d, target.id));
    toast(`The ${ECHOES.name} spread to ${target.name}.`);
  };
  return (
    <button onClick={spread} disabled={!options.length}
      title={options.length ? `Spread into one of ${options.length} neighbouring sector${options.length === 1 ? '' : 's'} at random` : 'No sector next to their territory to spread into'}>
      ☣ {ECHOES.name} spread
    </button>
  );
}
