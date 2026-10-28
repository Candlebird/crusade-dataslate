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

## Open questions
- **Nexus: other factions' readiness.** Should players see the GM checklist, such as whose orders are locked in?
- **Nexus: income on the GM checklist.** The Income column only knows about forces on the GM's device; others read "No force here", because claims aren't in the synced campaign file.
- **Nexus: order of the merged tab.** For the GM, recording a game and the game log sit above the chronicle. Is that the order you want?
- **Patrol vs Expedition.** A patrol takes units that already went out (Battle-Worn), while an Expedition refuses them. Is that intended? Only the wording changed to match.
- **Ledger.** "Increase supply (−1 RP)" repeats the one inside Requisition…. Keep it as a shortcut?
- **Between games.** Should the panel start folded? Right now it starts open and remembers a fold.
- **Training: smaller merges.** Should Combine offer smaller merges, such as 2 of a set of 4 alike? That would be a rules change.
- **Battle tracker: Nexus effects** are now hidden outside a campaign unless one was already added. Is that OK?
- **Battle result: Finish & save** turns gold once every force has recorded, but it can still be pressed before that, as it could before. Should it be blocked?
- **Battle: Prev round** is hidden once a battle ends too (Resume brings both back). OK?
- **Battle rewards for non-campaign forces.** They can roll Nexus-only reward results, which must be re-rolled or changed by hand. The wizard now flags them as a To do. Should the roll skip them instead? That would be a rules change.
- **Expedition Materials with no bank.** With no bank they seem to be lost ("no bank had room"). Warn before setting out?
- **"US" for Umbra Shards** is used everywhere. Spell it out for new players?
- **Buy a relic with 0 RP** is allowed, because the relic picker offers a free relic. Is that intended?
- **Unit sheet order.** Should the Profile panel move below Experience and Traits, so what changed comes first? Units also keep no XP history, so the sheet can't show what changed after each battle without a change to the saved data.
- **Unit tasks.** They only show when the force is linked to a faction in the loaded campaign, the same as before. Is that intended?
- **Nexus: GM panels fold.** Factions and Sectors fold once they have content. Is that right for you, or should they stay open?
- **Nexus: End round toast.** The toast is short when the turn report is on screen. Is that enough?
- **Battle: "Back to past battles"** scrolls to the list. Is that where you expect to land?
- **Dice: sort with "Any".** Dice only sort against a target once one is picked. Should they sort high to low otherwise?
- **Training: the "Base −N HP" note** only covers waves played in this sitting. Showing it after a reload would need saved data.
- **Training HUD labels.** Base, Credits and Luck only have words above 1200 px wide; below that they're icons. Lower it?
- **Search hits on the Traits page** scroll to the section (for example Trait tables), not to the single trait.

## Test by hand
- **Phone width.** Chrome on a desktop won't go below 500 px, where nothing scrolls sideways. Check 390 px on a real phone: the force page, the unit sheet, the battle start, the campaign tabs and Rules.
- **Training (long runs, not reached in the browser):** the Victory dialog, the banked block in the run summary, and the "Base −N HP." log line.
- **Sealed orders (needs sign-in, which was off-limits overnight):**
  - Check that the "what it will do" line reads right for hold, move, attack on an AI sector, attack on a faction and a target out of reach, with zone battles both on and off.
  - Check that "Locked in" shows after saving.
