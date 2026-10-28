# Overnight run: user flow, UI and UX

Asked on 2026-10-27: "Work overnight to improve user flow, UI and UX throughout the entire app and all of the game modes.
Try to simplify where you can and make things more clear for players and me as the GM."

Branch `overnight-ux`, local only (never pushed). Small commits, each with `npx tsc -b` and `npm test` green.

## Ground rules
- UI, flow and wording only. No rule or balance values change (data files stay as they are); anything that would change
  how the game plays, or removes a feature, goes under Open questions instead.
- Simplify: fewer clicks, fewer competing buttons, one obvious next step, consistent words for the same thing, clear
  disabled reasons ("why can't I press this?"), clear empty states. Advanced or rare controls can fold away.
- Players come first on phones (390 px, no sideways scroll); the GM view must be clear on a laptop.
- Browser checks on localhost with local data only. No sign-in, no Firestore, no deploys.

## Areas (one agent each, in its own worktree)
1. **Forces and units**: the forces list, a force page, unit sheet, add unit, lists, ledger, requisition, feats, emblem,
   tags, army books, settings, guide, the top bar.
2. **Battles**: battle tracker, battle report wizard, side sheet, missions, tables, AI activation, dice, auto-battle.
3. **Downtime modes**: Patrol, Expedition, unit tasks, zone battles, Sortie.
4. **Training**: the tower-defense sim and the Weekly Siege.
5. **Nexus Wars**: the campaign page (player and GM), map, orders, round, income, Warlords, duels, journal, tech, shops.

## Log
- **Nexus Wars, round 1** (5 commits):
  - Players get a "This round" to-do list; things lost at round end are tagged. The GM gets a "Round checklist": steps still open plus one row per faction. The logic is in `src/rules/roundStatus.ts`, with tests.
  - GM settings (difficulty, rescale, zone battles for everyone, guardians) are in a folded "Campaign settings" panel. "Update from the GM" and "Remove campaign" are in a folded "Campaign file" panel.
  - Chronicle and Log are one tab, so there are six tabs instead of seven; old links still work.
  - Renaming a faction renames its default home sector, and a blank name keeps the old one.
- **Nexus Wars, round 2** (5 commits):
  - A map seen as a faction opens zoomed on the sectors it knows. The legend now covers Echo marks, Crisis, the no-attack icon, detachments, the AI garrison number, the reach outline and seen-before sectors.
  - Sealed orders say in words what each pick will do and show "Locked in".
  - Warlords show the next perk. Disabled buttons say why. Duels end with a "Next:" line, and the Journal puts its actions first with the rules folded.
  - Ending a round scrolls to and flashes the new turn report. "Since you last looked" counts your dispatches and links straight to the report.
- **Nexus Wars, round 3** (3 commits):
  - The End round confirm is "End round N?" plus one bullet per fact, with nothing dropped. The toast is short when the turn report is on screen.
  - Game night, Research, the Umbra Shards shop, Detachments and the Nexus box each say what to do and why something is greyed out.
  - The GM's Factions and Sectors panels fold once they have content, each with a summary.
  - Remove and delete buttons are red.
  - Deleting a sector from the list now asks first, as the map's Delete already did.
- **Downtime modes, round 1** (5 commits): Patrol, Expedition and Unit task each say why a button or unit is greyed out.
  - Expedition picks its squad from the same cards as a Patrol.
  - Unit task no longer has the second confirm pop-up.
  - Sortie folds its fight rules away and adds a map key; "Road" is now "Map", and the two Autos are named "Auto-play" and "Auto pick".
  - Zone battles: the side panel no longer repeats the bar over the board, and there's a key for the terrain letters and objectives. The result shows VP and says nothing is recorded until you take it.
- **Downtime modes, round 2** (6 commits):
  - Sortie setup no longer repeats the line tags, and the region intro shows once.
  - The zone battle start leads with the stakes, with the board rules folded.
  - Expedition, Unit task, Sortie and Zone battle result screens now all say "Recorded on <force>" and list what was recorded. Sortie gets one line per item. Practice says nothing is recorded. A tracked zone battle explains that you then record it from the tracker.
  - Unit tasks with no worlds held, or no Recon targets, say so.
- **Forces and units, round 1** (10 commits):
  - Another player's force, lists and ledger are read-only on your device; this matches firestore.rules.
  - A new "Between games" panel on the force page launches Expedition, Unit task, Garrison XP, Patrol, Training and Sortie, each with a reason when greyed out and the best run so far.
  - A "Waiting on you" box at the top shows income to claim and units to level up. Export, Transfer and Delete are in "Manage force".
  - Signed in, your forces come first.
  - Add unit shows the points left.
  - Players don't see a greyed-out "Reset to defaults".
  - Browse on Army Books scrolls to the book.
  - The Guide covers the new panels.
- **Forces and units, round 2** (4 commits):
  - Top bar: Settings, Rules and Guide sit under a "More" menu. On a phone, Dice and Sign in sit beside the title, and nothing scrolls sideways.
  - Unit sheet:
    - Each trait says what it does.
    - Experience shows the XP left to the next level, "N of M upgrades used" and a gold "N to pick" tag.
    - Scars count "n of 3".
    - Comatose and fallen units get a banner.
  - A brand-new player gets "Your first force in three steps" on Forces (import a book, create a force, add units). It disappears once a force has a unit.
  - One search box covers all the rules pages, including Nexus Wars and the relic tabs, and highlights matches.
- **Training, round 1** (3 commits):
  - The build phase shows three steps (Place 5 / Keep 1 / Start wave N). After the keep, links point to Recipes (ready count) and the Shop (credits to spend).
  - The keep table names each Shard's type. The HUD labels Base, Credits and Luck on wide screens and no longer jumps when a wave starts.
  - Each piece's Level up or Upgrade says what it does or why it can't be bought.
  - The Shop explains luck and shows the Shard grade odds.
  - A live count shows enemies left and how many got through.
  - The run summary opens with how the run ended and the total XP. The boss card offer says the card lasts the run.
- **Training, round 2** (3 commits):
  - Flying and Boss waves say what the tag means before they start.
  - A buy you can't afford says how many credits you're short.
  - A cleared wave's log line shows the base HP it cost (display only, this sitting).
  - Narrow desktop windows lose the black bands.
  - Recipes list ready ones first, then the closest, with "Needs X and Y" and a fold-out "What it does". Each defence shows its text under its Shards.
  - The Victory dialog explains Bank vs Endless (credits carried, records).
  - The run summary keeps what the run banked: Final ladder, feats, units held back by the off-table XP limit, and where it all shows later.
- **Battles, round 1** (6 commits):
  - Starting a battle goes Players → Forces → Mission. A force taken by one side is greyed out for the others, and the randomizer folds away. Start battle sits in a bar at the bottom.
  - The tracker shows each side's units first, with side settings folded. A note names sides with no units, and End battle only turns gold on the last round.
  - On phones, units show as compact cards.
  - The result panel reads "1. Record it for each force · N to go" then "2. Finish". The record wizard leads back to the battle.
  - The Mission library shows one tappable line per mission, with "Duplicate to edit" on built-ins.
  - Auto-battle folds its explanation away.
- **Battles, round 2** (3 commits):
  - Each step of the record wizard opens with one line on what it decides and what applying changes. Apply names the force.
  - A reward that needs fixing shows a To do under its table.
  - "Battle recorded" lists what changed and which forces still have to record.
  - An ended battle shows "Battle over" instead of the round buttons.
  - The Battle page flags past battles still waiting for one of your forces to claim, and their rows get a gold edge.
  - The dice roller has one-tap "Success on" buttons and sorts dice against a target.
  - The AI activation hint counts the units left and explains Roll vs Decide.
- **Review** (2 commits): a separate pass over the whole diff found no ground-rule breaks and checked the new on-screen rule text against src/rules. It found and fixed one bug: clicking the "Success on" caption in the dice roller pressed "Any". The older "Type" caption had the same problem and is fixed too.
  - Left as notes:
    - A sealed-order attack line doesn't say that an attack not played at the table becomes a siege.
    - The Game night intro doesn't mention the patrol fallback.
    - "Back to past battles" goes to the Battle page, which shows any battle in progress first.
    - The AI side's Army sheet link now sits inside the folded side settings.
    - The Training "Flying" tag says "they fly", but a flying boss's escorts walk.

## Decisions (2026-10-28)
Done on overnight-ux (tsc, 944 tests and the build pass):
- **Nexus:**
  - Players see one row per faction saying whether its orders are locked in. They don't see what the orders are. It shows only when signed in, and it reads the order declarations every player can already read, so the campaign file is unchanged.
  - The GM checklist drops the Income column.
  - Factions and Sectors start folded but remember if you open them. This already worked, so no change was needed.
- **Battles:**
  - Pressing Finish & save before every force has recorded asks first. The other forces can still claim the battle later.
  - Outside a campaign, the reward roll rerolls Nexus-only results. This is a small rules change.
  - "Back to past battles" scrolls to the Past battles list.
- **Dice:** with "Any" selected, dice sort high to low.
- **Rules search:** a hit scrolls to and flashes the exact entry, not just its section.
- **Expedition:** with no bank, the setup screen warns "No bank: any Materials found are lost."
- **Unit task** is always listed in Between games. Without a link to a Nexus faction it is greyed out and says why.
- **Ledger:** the duplicate "Increase supply" button is removed; it stays under Requisition….
- **Relics:** at 0 RP with a free relic due, the button reads "Pick your free relic". The Requisition shop's forged relic button now says the same instead of "Buy (forged: free)", and the relic picker marks those relics "Free".
- **Umbra Shards:** spelled out in sentences and headings. "US" stays only in stat tiles and costs, with a tooltip.
- **Unit sheet:** Experience and Traits come before Profile.
- **Training:**
  - The HUD shows words down to 900 px wide.
  - The Flying tag says who flies: the boss flies and its escorts walk.

Kept as they are:
- **Nexus:** the merged tab keeps the GM's Record form and game log first, and the End round toast stays short.
- **Battles:** Nexus effects stay hidden outside a campaign, and Prev round stays hidden once a battle ends.
- **Downtime:** Patrol still takes Battle-Worn units while Expedition refuses them, which is intended. Between games starts open.
- **Training:** merges stay full sets only, and the base HP note covers this sitting only.
- **Not fixing:**
  - The siege line on attack orders.
  - The patrol fallback in the Game night intro.
  - The AI Army sheet link stays inside the fold.
- **Dice:** the "Type" caption fix stays.

## Test by hand
- **Decisions round:**
  - Finish & save with one force still to record: the confirm should ask first.
  - Claim a past battle for a force outside a campaign and press Roll: it never lands on a Nexus-only reward.
  - A force with no Nexus Wars faction: Unit task is greyed out with a reason.
  - A faction with no bank room: Expedition warns.
  - A unit with a free relic waiting: the button reads "Pick your free relic".
  - The Training top bar at 900–1199 px wide shows words.
  - Signed in: the "locked in" rows for each faction.
- **Phone width.** Chrome on a desktop won't go below 500 px, where nothing scrolls sideways. Check 390 px on a real phone: the force page, the unit sheet, the battle start, the campaign tabs and Rules.
- **Training (long runs, not reached in the browser):** the Victory dialog, the banked block in the run summary, and the "Base −N HP." log line.
- **Sealed orders (needs sign-in, which was off-limits overnight):**
  - Check that the "what it will do" line reads right for hold, move, attack on an AI sector, attack on a faction and a target out of reach, with zone battles both on and off.
  - Check that "Locked in" shows after saving.
