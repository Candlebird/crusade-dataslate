import type { Campaign, CrossroadsJournal, Force, Unit } from '../model/types';
import {
  catalystById, complicationById, contextById, eligibleRewards, localOffer, minNothing, skillById, tierCap, validOffer,
} from './journal';
import type { Rand } from './hexmap';

// Crossroads Journal endings written by Claude. The app sends the scene, the checks and the rewards the journal may
// offer to the proxy's /journal route (proxy/worker.js), which holds the API key. Claude picks four of those rewards
// and writes an ending for each; the reply is checked here with validOffer, so it can only choose among rewards the
// rules already allow. When the proxy can't be reached or the reply doesn't hold up, the tables pick (localOffer).

export interface JournalPick {
  rewardId: string;
  title?: string;
  text?: string;
}

/** What the proxy sends Claude: the story so far and the rewards it may choose from. */
export interface JournalRequest {
  faction: string;
  warlord: string;
  scene: { context: string; catalyst: string; complication: string; note?: string };
  steps: { label: string; skill?: string; target?: number; rolls?: number[]; pass?: boolean }[];
  successes: number;
  tierCap: number;
  minNothing: number;
  rewards: { id: string; name: string; desc: string; tier: number }[];
}

const rolled = (r: { skill: string; target: number; rolls: number[]; pass: boolean } | undefined) =>
  r && { skill: skillById(r.skill)?.name ?? r.skill, target: r.target, rolls: r.rolls, pass: r.pass };

export function journalRequest(c: Campaign, j: CrossroadsJournal, u: Unit, forces: Force[]): JournalRequest {
  const ctx = contextById(j.context);
  const cat = catalystById(j.catalyst);
  const comp = complicationById(j.complication);
  const approach = cat?.approaches.find((a) => a.id === j.approach?.id);
  const choice = comp?.choices.find((x) => x.id === j.choice?.id);
  const steps: JournalRequest['steps'] = [
    { label: `Approach: ${approach?.label ?? '?'} — ${approach?.text ?? ''}`, ...rolled(j.approach?.roll) },
    { label: `Complication: ${choice?.label ?? '?'} — ${choice?.text ?? ''}`, ...rolled(j.choice?.roll) },
    { label: `Climax: ${cat?.climax.text ?? ''}`, ...rolled(j.climax) },
  ];
  return {
    faction: c.factions.find((f) => f.id === j.factionId)?.name ?? j.factionId,
    warlord: `${j.warlord}${u.name && u.name !== j.warlord ? ` (${u.name})` : ''}`,
    scene: {
      context: `${ctx?.name ?? j.context}. ${ctx?.text ?? ''}`,
      catalyst: `${cat?.name ?? j.catalyst}. ${cat?.text ?? ''}`,
      complication: `${comp?.name ?? j.complication}. ${comp?.text ?? ''}`,
      ...(j.note ? { note: j.note } : {}),
    },
    steps,
    successes: steps.filter((s) => s.pass).length,
    tierCap: tierCap(j),
    minNothing: minNothing(j),
    rewards: eligibleRewards(j, u, forces).map((r) => ({ id: r.id, name: r.name, desc: r.desc, tier: r.tier })),
  };
}

/** Ask the proxy for Claude's four endings. Undefined when it can't be reached or says no. */
export async function fetchOffer(proxy: string, req: JournalRequest, signal?: AbortSignal): Promise<JournalPick[] | undefined> {
  try {
    const res = await fetch(`${proxy.replace(/\/$/, '')}/journal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
      signal,
    });
    if (!res.ok) return undefined;
    const out = (await res.json()) as { options?: JournalPick[] };
    return Array.isArray(out.options) ? out.options : undefined;
  } catch {
    return undefined;
  }
}

/** The endings to offer: Claude's when they hold up, else the tables'. */
export async function journalEndings(
  proxy: string, c: Campaign, j: CrossroadsJournal, u: Unit, forces: Force[], rand: Rand, signal?: AbortSignal,
): Promise<{ picks: JournalPick[]; source: 'claude' | 'tables' }> {
  const picks = await fetchOffer(proxy, journalRequest(c, j, u, forces), signal);
  if (picks && validOffer(j, u, forces, picks.map((p) => p.rewardId))) {
    const clip = (s: unknown, n: number) => (typeof s === 'string' ? s.slice(0, n) : undefined);
    return { picks: picks.map((p) => ({ rewardId: p.rewardId, title: clip(p.title, 80), text: clip(p.text, 600) })), source: 'claude' };
  }
  return { picks: localOffer(j, u, forces, rand).map((rewardId) => ({ rewardId })), source: 'tables' };
}
