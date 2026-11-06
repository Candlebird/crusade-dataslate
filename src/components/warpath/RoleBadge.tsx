import type { CSSProperties } from 'react';
import { ROLES, type SquadRole } from '../../rules/warpath';
import { Icon } from '../Icon';

/** An archetype's colour, for a `--role` style. */
export const roleTint = (r: SquadRole) => ({ '--role': ROLES[r].color }) as CSSProperties;

/** A unit's archetype: its icon and name (`bare`: the icon alone), with what it does on hover. */
export function RoleBadge({ role, bare }: { role: SquadRole; bare?: boolean }) {
  const r = ROLES[role];
  return (
    <span className={`warpath-role${bare ? ' bare' : ''}`} style={roleTint(role)} title={`${r.name}: ${r.text}`}>
      <Icon name={r.icon} />{!bare && <span>{r.name}</span>}
    </span>
  );
}
