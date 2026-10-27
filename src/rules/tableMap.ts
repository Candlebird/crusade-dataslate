// Suggested table size and a deployment map for each mission, drawn by TableMap.tsx. All sizes are in inches;
// x runs along the long edges (left to right) and y from the top long edge down.
import type { MissionDef } from './missions';

export interface TableSize { w: number; h: number; label: string; why: string }

/** The table to suggest for the biggest side's points: 4'×4' for smaller games, 6'×4' from 1250 pts a side. */
export function suggestTable(points: number): TableSize {
  if (points > 0 && points < 1250) return { w: 48, h: 48, label: `4' × 4' (48" × 48")`, why: 'for games under 1250 pts a side' };
  return { w: 72, h: 48, label: `6' × 4' (72" × 48")`, why: points ? 'for games of 1250 pts or more a side' : 'the standard table' };
}

/** Who a zone belongs to: player 1/2 on face-off maps, attacker/defender on Attack & Defend ones, or nobody. */
export type ZoneSide = 'A' | 'B' | 'none';

export type MapShape =
  | { kind: 'rect'; x: number; y: number; w: number; h: number; side: ZoneSide; label: string; dashed?: boolean }
  | { kind: 'circle'; cx: number; cy: number; r: number; side: ZoneSide; label: string; dashed?: boolean }
  /** Everything within `d` of any table edge. */
  | { kind: 'band'; d: number; side: ZoneSide; label: string }
  | { kind: 'marker'; x: number; y: number }
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number }
  /** A measurement: an arrow from (x1,y1) to (x2,y2) with its length written beside it. */
  | { kind: 'dim'; x1: number; y1: number; x2: number; y2: number; text: string };

export interface DeploymentMap {
  table: TableSize;
  shapes: MapShape[];
  /** What the drawing can't show, e.g. markers the players place themselves. */
  notes: string[];
}

const ZONE = 12;

/** Two 12" zones along the long edges, with their depth and the gap between them measured. */
function longEdges(t: TableSize, roles: boolean): MapShape[] {
  const [top, bottom] = roles ? ['Defender', 'Attacker'] : ['Player 1', 'Player 2'];
  return [
    { kind: 'rect', x: 0, y: 0, w: t.w, h: ZONE, side: roles ? 'B' : 'A', label: `${top} deployment zone` },
    { kind: 'rect', x: 0, y: t.h - ZONE, w: t.w, h: ZONE, side: roles ? 'A' : 'B', label: `${bottom} deployment zone` },
    { kind: 'dim', x1: 3, y1: 0, x2: 3, y2: ZONE, text: `${ZONE}"` },
    { kind: 'dim', x1: 3, y1: ZONE, x2: 3, y2: t.h - ZONE, text: `${t.h - 2 * ZONE}"` },
    { kind: 'dim', x1: 3, y1: t.h - ZONE, x2: 3, y2: t.h, text: `${ZONE}"` },
  ];
}

const has = (m: MissionDef, title: string, starts: string) => (m.rules ?? []).some((r) => r.title === title && r.text.startsWith(starts));

/** Markers whose spot the mission fixes, drawn on the long-edge map; anything else is a note. */
function markers(m: MissionDef, t: TableSize): { shapes: MapShape[]; notes: string[] } {
  const midY = t.h / 2;
  if (has(m, 'Placing objectives', 'Divide the area outside the deployment zones into 4')) {
    const top = ZONE + (t.h - 2 * ZONE) / 4, bottom = t.h - ZONE - (t.h - 2 * ZONE) / 4;
    return {
      shapes: [
        { kind: 'line', x1: t.w / 2, y1: ZONE, x2: t.w / 2, y2: t.h - ZONE },
        { kind: 'line', x1: 0, y1: midY, x2: t.w, y2: midY },
        ...[t.w / 4, (3 * t.w) / 4].flatMap((x) => [top, bottom].map((y): MapShape => ({ kind: 'marker', x, y }))),
        { kind: 'dim', x1: 0, y1: top, x2: t.w / 4, y2: top, text: `${t.w / 4}"` },
      ],
      notes: ['One marker in the centre of each quarter of no man\'s land.'],
    };
  }
  if (has(m, 'Placing objectives', 'Each player sets up 1 marker')) {
    return {
      shapes: [
        { kind: 'marker', x: t.w / 2, y: ZONE }, { kind: 'marker', x: t.w / 2, y: t.h - ZONE },
        { kind: 'dim', x1: t.w / 2 + 4, y1: t.h - ZONE, x2: t.w / 2 + 4, y2: t.h, text: `${ZONE}"` },
      ],
      notes: [`Each player's marker sits ${ZONE}" from their own table edge, in the middle of it.`],
    };
  }
  if (has(m, 'Placing objectives', 'Set up only 1 marker')) {
    return {
      shapes: [{ kind: 'marker', x: t.w / 2, y: midY }, { kind: 'dim', x1: 0, y1: midY + 3, x2: t.w / 2, y2: midY + 3, text: `${t.w / 2}"` }],
      notes: ['One marker in the middle of the table.'],
    };
  }
  if (m.objectives) {
    return { shapes: [], notes: [m.roles ? `Place the ${m.objectives} markers as the mission's rules say.` : `The players place the ${m.objectives} markers: outside the deployment zones and over 9" apart.`] };
  }
  return { shapes: [], notes: [] };
}

/**
 * The map for each mission whose deployment it can draw; undefined for a custom deployment it can't read.
 * `table` overrides the suggested table (the zone battle's deep board is 48" × 72").
 */
export function deploymentMap(m: MissionDef, points: number, table?: TableSize): DeploymentMap | undefined {
  const t = table ?? suggestTable(points);
  const cx = t.w / 2, cy = t.h / 2;
  const centre = (label: string, side: ZoneSide, dashed = false): MapShape[] => [
    { kind: 'circle', cx, cy, r: ZONE, side, label, dashed },
    { kind: 'marker', x: cx, y: cy },
    { kind: 'dim', x1: cx, y1: cy, x2: cx + ZONE, y2: cy, text: `${ZONE}"` },
  ];
  const edgeBand = (label: string): MapShape[] => [
    { kind: 'band', d: ZONE, side: 'A', label },
    { kind: 'dim', x1: t.w - 6, y1: 0, x2: t.w - 6, y2: ZONE, text: `${ZONE}"` },
  ];
  switch (m.id) {
    case 'opr-the-raid':
      return { table: t, shapes: [...edgeBand('Attacker: within 12" of any edge'), ...centre('Defender: half its units', 'B')],
        notes: ['The defender places the marker within 12" of the centre (drawn at the centre).', 'The rest of the defenders deploy after the attacker, over 12" from enemy units and from the marker.'] };
    case 'opr-last-stand':
      return { table: t, shapes: [...edgeBand('Attacker: within 12" of any edge'), ...centre('Defender: whole army', 'B')],
        notes: ['The defender places the marker within 12" of the centre (drawn at the centre).', 'Attacking reserves come back within 12" of any edge.'] };
    case 'opr-the-rescue':
      return { table: t, shapes: [...edgeBand('Reserves arrive within 12" of any edge'), ...centre('Marker within 12" of centre', 'none', true)],
        notes: ['Each side deploys at most half its units; the rest arrive from reserve, over 12" from enemy units and from the marker.'] };
    case 'opr-vip-escort': {
      const my = t.h - 6;
      return {
        table: t,
        shapes: [
          ...edgeBand('Attacker: within 12" of any edge'),
          { kind: 'rect', x: 0, y: 0, w: t.w, h: 6, side: 'none', label: 'VIP goal: within 6" of the far edge', dashed: true },
          { kind: 'circle', cx, cy: my, r: ZONE, side: 'B', label: 'Defender' },
          { kind: 'marker', x: cx, y: my },
          { kind: 'dim', x1: cx + 3, y1: my, x2: cx + 3, y2: t.h, text: '6"' },
          { kind: 'dim', x1: cx - ZONE, y1: my, x2: cx, y2: my, text: `${ZONE}"` },
          { kind: 'dim', x1: 3, y1: 0, x2: 3, y2: 6, text: '6"' },
        ],
        notes: ['The defender picks the starting edge; the attacker deploys over 12" from enemy units.'],
      };
    }
    case 'opr-ambush':
      return {
        table: t,
        shapes: [
          { kind: 'rect', x: 0, y: t.h - ZONE, w: t.w, h: ZONE, side: 'B', label: 'Defender: half its units' },
          { kind: 'dim', x1: 3, y1: t.h - ZONE, x2: 3, y2: t.h, text: `${ZONE}"` },
        ],
        notes: ['The attacker deploys anywhere over 12" from enemy units and within 6" of another friendly unit.', 'The rest of the defenders then deploy anywhere over 12" from enemy units.'],
      };
  }
  // Everything else uses the core-rules zones along the long edges, unless a custom mission says otherwise.
  if (m.deployment && !/12" (deep )?zones along (each|the) long edges?|12" deep along each long edge/i.test(m.deployment)) return undefined;
  const mk = markers(m, t);
  return { table: t, shapes: [...longEdges(t, !!m.roles), ...mk.shapes], notes: mk.notes };
}
