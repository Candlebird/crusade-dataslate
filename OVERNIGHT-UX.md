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

## Open questions

## Test by hand
