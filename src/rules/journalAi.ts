import type { Campaign, CrossroadsJournal, Force, Unit } from '../model/types';
import {
  catalystById, complicationById, contextById, eligibleRewards, journalText, localOffer, minNothing, recentRewards, requiredReward, skillById,
  successes, threadBeat, tierCap, twistById, validOffer,
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
  /** The Warlord's special rules, for endings that suit them. */
  warlordRules: string[];
  /** Where the Warlord's detachment stood when the journal was dealt. */
  sector?: string;
  scene: { context: string; catalyst: string; complication: string; note?: string; twist?: string; rival?: string; thread?: string };
  steps: { label: string; skill?: string; target?: number; rolls?: number[]; pass?: boolean }[];
  successes: number;
  tierCap: number;
  minNothing: number;
  /** A story thread's payoff that must be one of the four. */
  required?: string;
  /** `recent`: the faction had this ending lately, so pick it only if nothing else fits. */
  rewards: { id: string; name: string; desc: string; tier: number; recent?: boolean }[];
}

const rolled = (r: { skill: string; target: number; rolls: number[]; pass: boolean } | undefined) =>
  r && { skill: skillById(r.skill)?.name ?? r.skill, target: r.target, rolls: r.rolls, pass: r.pass };

export function journalRequest(c: Campaign, j: CrossroadsJournal, u: Unit, forces: Force[]): JournalRequest {
  const ctx = contextById(j.context);
  const cat = catalystById(j.catalyst);
  const comp = complicationById(j.complication);
  const approach = cat?.approaches.find((a) => a.id === j.approach?.id);
  const choice = comp?.choices.find((x) => x.id === j.choice?.id);
  const say = (s: string | undefined) => journalText(j, s ?? '');
  const steps: JournalRequest['steps'] = [
    { label: `Approach: ${approach?.label ?? '?'} — ${approach?.text ?? ''}`, ...rolled(j.approach?.roll) },
    { label: `Complication: ${say(choice?.label) || '?'} — ${say(choice?.text)}`, ...rolled(j.choice?.roll) },
    { label: `Climax: ${cat?.climax.text ?? ''}`, ...rolled(j.climax) },
  ];
  const twist = twistById(j.twist?.id);
  if (twist) steps.push({ label: `Twist: ${twist.name} — ${journalText(j, twist.text)}`, ...rolled(j.twist?.roll) });
  const sector = c.sectors.find((x) => x.id === j.sectorId);
  const beat = threadBeat(j);
  const recent = recentRewards(c, j.factionId);
  return {
    faction: c.factions.find((f) => f.id === j.factionId)?.name ?? j.factionId,
    warlord: `${j.warlord}${u.name && u.name !== j.warlord ? ` (${u.name})` : ''}`,
    warlordRules: u.rules.slice(0, 20),
    ...(sector ? { sector: `${sector.name} (${sector.type})` } : {}),
    scene: {
      context: `${ctx?.name ?? j.context}. ${ctx?.text ?? ''}`,
      catalyst: `${cat?.name ?? j.catalyst}. ${cat?.text ?? ''}`,
      complication: `${comp ? say(comp.name) : j.complication}. ${say(comp?.text)}`,
      ...(j.note ? { note: j.note } : {}),
      ...(twist ? { twist: `${twist.name}. ${journalText(j, twist.text)}` } : {}),
      ...(j.rival ? { rival: `${j.rival.name}, Warlord of ${c.factions.find((f) => f.id === j.rival!.factionId)?.name ?? 'a rival faction'}` } : {}),
      ...(beat ? { thread: `${beat.name}, beat ${beat.step + 1} of ${beat.of}: ${beat.text}` } : {}),
    },
    steps,
    successes: successes(j),
    tierCap: tierCap(j, forces),
    minNothing: minNothing(j),
    ...(requiredReward(j) ? { required: requiredReward(j) } : {}),
    rewards: eligibleRewards(j, u, forces).map((r) => ({ id: r.id, name: r.name, desc: r.desc, tier: r.tier, ...(recent.has(r.id) ? { recent: true } : {}) })),
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
  if (picks && picks.every((p) => typeof p?.rewardId === 'string') && validOffer(j, u, forces, picks.map((p) => p.rewardId))) {
    const clip = (s: unknown, n: number) => (typeof s === 'string' ? s.slice(0, n) : undefined);
    return { picks: picks.map((p) => ({ rewardId: p.rewardId, title: clip(p.title, 80), text: clip(p.text, 600) })), source: 'claude' };
  }
  return { picks: localOffer(j, u, forces, rand, recentRewards(c, j.factionId)).map((rewardId) => ({ rewardId })), source: 'tables' };
}
