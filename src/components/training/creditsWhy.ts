/** A buy's problem as the player reads it: the rules' bare "Not enough credits." says what the buy costs and how far
 *  short the run is; any other problem (or none) passes through. */
export function creditsWhy(why: string | null, cost: number | null, credits: number): string | null {
  if (why !== 'Not enough credits.' || cost === null) return why;
  const have = Math.floor(credits);
  return `Not enough credits: it costs ${cost}, you have ${have} (${cost - have} short).`;
}
