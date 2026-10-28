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
- **Downtime modes, round 1** (5 commits): Patrol, Expedition and Unit task each say why a button or unit is greyed out.
  - Expedition picks its squad from the same cards as a Patrol.
  - Unit task no longer has the second confirm pop-up.
  - Sortie folds its fight rules away and adds a map key; "Road" is now "Map", and the two Autos are named "Auto-play" and "Auto pick".
  - Zone battles: the side panel no longer repeats the bar over the board, and there's a key for the terrain letters and objectives. The result shows VP and says nothing is recorded until you take it.
- **Forces and units, round 1** (10 commits):
  - Another player's force, lists and ledger are read-only on your device; this matches firestore.rules.
  - A new "Between games" panel on the force page launches Expedition, Unit task, Garrison XP, Patrol, Training and Sortie, each with a reason when greyed out and the best run so far.
  - A "Waiting on you" box at the top shows income to claim and units to level up. Export, Transfer and Delete are in "Manage force".
  - Signed in, your forces come first.
  - Add unit shows the points left.
  - Players don't see a greyed-out "Reset to defaults".
  - Browse on Army Books scrolls to the book.
  - The Guide covers the new panels.

## Open questions
- **Nexus: other factions' readiness.** Should players see the GM checklist, such as whose orders are locked in?
- **Nexus: income on the GM checklist.** The Income column only knows about forces on the GM's device; others read "No force here", because claims aren't in the synced campaign file.
- **Nexus: order of the merged tab.** For the GM, recording a game and the game log sit above the chronicle. Is that the order you want?
- **Patrol vs Expedition.** A patrol takes units that already went out (Battle-Worn), while an Expedition refuses them. Is that intended? Only the wording changed to match.
- **Ledger.** "Increase supply (−1 RP)" repeats the one inside Requisition…. Keep it as a shortcut?
- **Between games.** Should the panel start folded? Right now it starts open and remembers a fold.
- **Unit tasks.** They only show when the force is linked to a faction in the loaded campaign, the same as before. Is that intended?

## Test by hand
