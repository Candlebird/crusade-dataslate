# Overnight run

Branch `overnight`, local only (never push). Small commits, each with `npx tsc -b --noEmit` and `npx vitest run` green.
Priority when short on time: bugs > journal content > UX > performance. After all six areas, keep refining until the user returns.

## Ground rules
- Fix plain bugs (incl. small rule fixes such as double payouts); anything that changes how the game plays goes under Open questions.
- Browser: Chrome on localhost with local data only. No sign-in, no real Firestore campaigns, no deploys (Worker, Pages, Firestore rules).
- Parallel agents/workflows are allowed (user chose "go wide").
- Each fix gets a regression test where practical.

## Areas
1. **Verify in browser**: Journal (deal, frame, roll, re-roll, end, pick), Duels (challenge, settle, pay), Warlord revive, player and GM views.
2. **Bug hunt**: Warlords, Duels, Journal, fog, production. Concurrent Firestore edits, auto-pay paying twice or never, a Warlord dying or a force deleted mid-journal, the round advancing while a journal is open.
3. **Tests**: panels and the sync layer, plus every bug fixed.
4. **UX**: the player view excellent on phones (the GM view only needs to work). Group the campaign page into tabs (Map, Warlord, Duels & Journal, Log) and keep the panel ids for links. Light visual polish within the current theme. Clear empty states.
5. **Performance**: code-split GM-only panels and the hex map (a brief spinner is OK), and memoise the expensive selectors.
6. **Journal variety (must not break balance)**:
   - Tables: ~40 contexts, ~40 catalysts, ~30 complications, ~80 rewards.
   - Tone: mostly grimdark sci-fi, with occasional weird, mystic or darkly funny scenes.
   - About a quarter of entries are tagged to army traits or rules (Psychic, Fast, Mechanical...); the rest are universal.
   - Contexts are weighted by the Warlord's nearby sector types; anything can still come up.
   - Per-faction memory: no repeat catalyst or context until most of the pool is seen.
   - Occasional structural variants: a hidden 4th beat, a choice with no roll, a rival Warlord beat. Most journals keep the 3-check shape.
   - Rare story threads (rival, debt, map fragment) left by an ending, which can resurface later with a payoff or a consequence.
   - Other factions' Warlords are flavour only; effects touch only your own faction or the shared threat.
   - Balance: every reward gets a hidden value in shard-equivalents, and tests keep each tier inside its band.
   - New effect kinds: next-battle buffs (one-off, recorded on the force, used up when it fights), temporary sector effects, order modifiers (a free move or a build discount next round), and Warlord quirks (mixed permanent traits).
   - Bad endings sting but never cripple: no lost sectors, no Warlord deaths.
   - Always keep at least one bad ending, even on a perfect run.
   - Update the Worker prompt and request with threads, army traits and the sector (the user redeploys tomorrow).

## Report
At the end, fill in the sections below and give a short chat summary.

## Log

## Open questions

## Test by hand
