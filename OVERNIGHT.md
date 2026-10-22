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

## Later (noted, not for tonight)
- **Force emblems.** An emblem creator on the force page: stack three shapes (e.g. shield, circle, star, chevron, skull…), pick each one's shape and colour. The emblem stands for the force on the Nexus Map instead of the plain marker. Stored on the force, so it should sync to the campaign with the detachment's position.

## Report
At the end, fill in the sections below and give a short chat summary.

## Log
- **Bug hunt (area 2)**: two agents swept the rules and the UI/sync layer.
  - `730df06`: a journal left open over a round end now carries over and blocks a new one (it used to vanish from view); no choice re-roll after the climax; a negative Umbra balance can't pay shards out; old journals and duels that still owe a force are kept longer (48 / 30) so auto-pay never misses them; reviving a Warlord whose force isn't loaded keeps the fallen record.
  - `9bdd04d`: the store applies changes at once. Before, ending a round worked on the page's copy of the campaign and could undo anything changed in between, and handlers that read a result back out of a queued update could get nothing. Faction and sector edits now find their row by id, not index.

- **Journal variety (area 6)**:
  - `9782bdb`: the tables live in `src/rules/journalTables/` (contexts, catalysts, complications, rewards, twists).
  - `3dab824`: bigger tables (about 40 contexts, 40 catalysts, 30 complications, 80+ rewards), a tone mix, and entries tagged to Warlord rules. Contexts are weighted by the sector the detachment stands in. Each faction remembers its recent contexts, catalysts, complications and endings and avoids them. Twists (15%: one more check after the climax), rival Warlords (12%: flavour only), rare story threads (a grudge, a debt, a star-chart) that pay off on their last beat, and new effect kinds: battle, order, sector and quirk marks. Every reward has a shard value, and tests keep each tier inside its band.
  - `a969f76`: the Journal panel shows twists (roll and reroll), the rival's name, the thread beat, and each faction's active marks with a "Used" button.
  - `7f6cad1`: the Claude request gets the twist step, rival, thread beat, sector, the Warlord's rules, which endings were recent, and the thread payoff that must be offered. The Worker prompt and request cleaning are updated. **Not deployed: redeploy the Worker to use it.**

- **Browser checks (area 1)**: dealt, rolled, re-rolled and ended a journal, picked an ending with a sector mark, and opened a duel, all in Chrome on local data.
  - `c63325a`: an ending whose title matched its reward showed the same text twice, and so did the toast for a mark named like its ending.
  - `2d4ab13`: every date the app writes (battles, ledger, duels, journals, log) used the UTC day, so anything recorded in the evening in the Americas was dated tomorrow. Dates now use the local day.
  - `d7862ab`: a panel now folds from its title as well as the small arrow, a bigger target on phones.
  - "LEVEL 0" on a new Warlord is right: the level comes from XP.
  - `aaa06a2`: the dates shown (updated, started, fetched) use the local day too. `05caa74`: a little room above Recent duels.
  - Full duel flow checked: wagers, agree on both sides, record the result, payout. The phone player view (390 px) has no sideways scroll.

- **UX and performance (areas 4 and 5)**:
  - `8f907ee`: the campaign page has tabs: Map, Warlord, Duels & Journal, Log. The round stays above them, and each device remembers its open tab. On the GM page, Factions and Sectors are under Map and Record a game is under Log ("Record a game here" on the map switches to it). Panel ids are unchanged, so folded panels stay folded.
  - `28ee383`: every page except the force pages, plus the hex map, loads on first use with a small spinner. The main bundle went from 982 kB to 614 kB (Firebase is its own 674 kB chunk, as before).
  - `74f5ed2`: Warlords, Duels and Journal start open, since each now has its own tab (a panel you fold stays folded). With no factions, the Warlord tab says to add them on the Map tab.
  - Phone check at 390 px: forces, force, unit, battle, books, rules and both campaign views have no sideways scroll; the tabs fit.
  - The hex map already memoises its heavy selectors (sight, cells, fronts), so there was nothing more to memoise there.

- **Tests (area 3)**:
  - `79002ed`: 41 tests for fog of war, turn reports, guardians and the Claude journal request (what each faction sees, who reads each report line, which sectors get guardians and relics, and that a journal request never leaks another faction's Warlord, forces or sectors).
  - `a0ecd5d`: they found that a Claude reply with a `null` ending threw, which left the journal stuck on "busy". It now falls back to the tables.

- **Battle flow bug hunt (area 2)**:
  - `0f27a23`: "Start blank instead" on the battle report dropped the patrol flag (a solo patrol then got full rewards) and re-ticked units that had already fought this round, so they could earn XP twice.
  - `50a76f5`: finishing a battle twice quickly put it in the history twice. A side whose force was deleted now says so instead of linking to "Force not found".
  - `e4011bb`: pressing Apply twice on an auto-battle doubled every fighter's kill XP.

- **Force pages bug hunt (area 2)**:
  - `3501b12`: pressing buy again in the Requisition shop charged RP twice for the same relic, a scar already removed, or a second Heroic Rise.
  - `abd3afb`: the Umbra shop could sell a sector someone took (or the GM deleted) after you picked it, and crashed on a deleted one.
  - `71e4b52`: a random Void Echoes force from a book with no units threw.
  - `81476f0`: dropping several files at once: the same force twice made two forces with one id, and a book dropped with a list wasn't used for it.

- **Turn loop bug hunt (area 2)**: round end, production, orders, detachments, events and the GM map tools checked.
  - `e4bb8b7`: deleting a game won at an unclaimed sector took the guardian's loot back but never restored the guardian (or Reinforce, bank, construction).
  - `78aef3e`: revealed orders compared the orders counter with the campaign round, so after a second set of orders in one round an attack never showed as fought.

- **Remaining pages bug hunt (area 2)**: Army Forge import, books, dice, tables.
  - `2afe5ee`: an upgrade that names the weapon in the plural or with a count ("Replace all Rifles") never matched, so the unit kept the old weapon and got the new one on top (e.g. the Recruit Squad in the bundled Spears of Dothea book; over a dozen units in the bundled books). **Lists imported before this keep the extra weapons until imported again.**
  - `31548cb`: a combined (doubled) unit lost its second half's weapons, and a hero joined to that half.
  - `670af46`: opening another army book kept the last book's search, tags and edit mode, so it could look empty; an empty book now says so.
  - `6d80381`: the dice roller kept a 6+ target after switching to a D3, so every roll showed 0 successes.
  - `ab41bb7`: rolling an empty trait table crashed.

- **Tests for saving, loading and sync (area 3)**: 51 new tests for import/export (`2523ada`), the store (`3f7c626`) and the cloud sync engine and document mapping (`ba455d1`). Firebase is never loaded in tests. Bugs they found:
  - `49cf4fb`: a force imported as a copy came out with empty battle lists (they pointed at the original's unit ids).
  - `a1ee42b`: something deleted right after it was created (before the server had seen it) came back with "Only the GM can change that" instead of being deleted.
  - `2a685d0`: saved data that failed to load was silently replaced by the starter data on the next save. It is now kept under `opr-crusade-tracker:unreadable` first.
  - `447fdaf`: restoring a backup with only some point values lost the defaults for the rest.

- **Review of tonight's own changes**: one agent read the whole overnight diff for regressions.
  - `2de78b9`: a journal on a story thread's last beat, with every check and the twist failed, could never be finished (the tables offered 5 endings instead of 4). Since unfinished journals now carry over, it also blocked that faction's later journals.
  - `4bb3820`: switching tabs on the GM page threw away a half-filled game record. The Log tab now stays loaded once opened (checked in Chrome).
  - Everything else checked out: the store's immediate updates, lazy pages, the tabs and the jump to Record a game, the Worker request, and every bug fix above.

- **Empty states and phone polish (area 4)**:
  - `f14652c`: lists that showed nothing when empty now say what goes there: no books, a datasheet/rule/spell search with no match, no duels, a unit with no special rules, no factions on the map.
  - `5901ee3`: on phones, Journal and Duels choices wrap under their button, the small "Used" and ✕ buttons are full-size, and a settled duel's relic dropdown and "Collect winnings" stay on screen. Checked at 390 px: no sideways scroll on any campaign tab.

## Open questions
- **Duel stakes when the loser can't pay.** The winner collects the full stake even if the loser has fewer shards/materials than staked (the loser is clamped at 0). Fair fix: the loser pays first and the winner gets what was actually paid, which needs a "paid" record on the duel. Want that?
- **Deleting a Warlord's force.** The Warlord stays on the faction, because a deleted force looks the same as one that just isn't loaded in this browser. Options: clear the Warlord when the owner deletes the force on their own device, or give the GM a "clear Warlord" button.
- **Lost updates in Firestore.** Every save writes the whole campaign document with a client-clock `updatedAt`, so two people saving within a second or two can overwrite each other (seen in theory with the Warlord sync, orders and journals). The fix is per-field merges or transactions with `serverTimestamp()`. I didn't touch it because it can't be tested without real Firestore. Worth doing together.
- **Firestore rules.** Players can write GM-only parts of the campaign document. Tightening needs a rules deploy, which was off-limits tonight.
- **Order marks last two rounds.** An order mark (e.g. +1 hex) is live from the round it was earned through the next, so it could cover two orders. For now the player or GM presses "Used" to strike it off. It could instead be used up automatically when an order is given. Want that?
- **Quirks and battle marks are text only.** Quirks (max 3 per Warlord) and next-battle marks are shown on the Journal panel, but nothing applies them in the battle tracker yet. They could be wired into the tracker later.
- **"Start blank instead" clears the sector.** A sector battle restarted blank becomes a skirmish. Keep the sector instead?
- **Claims for a deleted force.** In past battles, a side whose force was deleted shows "waiting for its player" forever. It could be dropped from the list, or the GM could dismiss it.
- **Deleting a force or unit leaves references behind.** Warlord, marks, duel sides, payments and list joins keep the old id. Mostly harmless (they show as missing), but a cleanup on delete would be tidier. It touches the Warlord and duel code, so I left it for a decision together with "Deleting a Warlord's force" above.
- **Closing an expedition without choosing** still records an empty expedition and marks its units used. Intended?
- **Changing a force's faction** keeps its old Nexus state (claimed round, used units, patrol round). Reset it?
- **Unclaimed income rounds expire.** Only the last few rounds are kept, so a faction that doesn't claim income for longer loses the older ones. Keep unclaimed rounds until claimed?
- **Painting a Voidspawn back** to another sector type leaves the Echoes as its owner. Echoes can hold ordinary sectors, so I left it; clear the owner instead?
- **A save that fails to load** is now kept under `opr-crusade-tracker:unreadable`, but nothing tells the player. Show a notice with a download button?
- **A force imported as a copy** keeps its campaign faction, its battle records' links to tracked battles, and its created date. Should a copy drop these?
- **Campaign import** only checks that `sectors` is a list, with no migration of older campaign files. Worth hardening?
- **Thread payoff on an all-failed journal** (`2de78b9`): the payoff now takes the place of the top-tier ending, giving payoff plus 3 bad endings. The other option is one fewer bad ending. Which do you prefer?
- **Requisition shop and held relics.** It now refuses a relic another force already holds (matching the dropdown, which greys them out). Before, it only checked that one was chosen. OK?
- **Rival Warlord in the Claude request.** The journal request sends the rival's name and faction, the only other-faction detail it sends. Intended for flavour; fine?

## Test by hand
- **Campaign tabs:** switch tabs on the player and GM pages, reload, and the tab should stay. On the GM map, "Record a game here" should open the Log tab at the record form. (My local data had no map, so this jump wasn't clicked.)
- **Journal variety:** deal a few journals for one faction over several rounds. Contexts, catalysts and endings shouldn't repeat soon, and the context should suit the Warlord's sector.
- **Twist:** after the climax, a twist section may appear (about 1 in 7). Roll it; the tally reads "of 4", and a failed twist adds a bad ending.
- **Marks:** pick an ending with a mark (e.g. a free move). It appears under the faction's cards; "Used" removes it. Only the GM and that faction's player see the button.
- **Claude endings (after redeploying the Worker):** finish a journal with a twist or a thread. The endings should mention them, and a thread's last beat must offer its payoff.
