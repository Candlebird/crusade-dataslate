# Where the house rules live

Crusade and Nexus Wars are homebrew and get rebalanced often, so their numbers and tables are plain data. Edit them in the files below. The app reads everything from these files, so no other code needs to change.

| What | File |
| --- | --- |
| Crusade XP levels, trait/relic/scar tables, relics, requisitions, agendas, reward tables, XP and RP values | `data.ts` |
| Nexus Wars sector types and benefits, Anomaly and Void tables, Combat Manipulations, Umbra shop | `nexusData.ts` |
| Built-in battle tracker missions: the 18 OPR Advanced Rules missions, deployment styles and the example template | `missions.ts` |

**Missions.** You don't need code to add a mission. Use the in-app **Battle → Mission library**: duplicate the example or create a new mission. Custom missions sync to every player. A mission saved there with the same id as a built-in one replaces it. A battle that is already running keeps the copy of the mission it started with.

Scoring that the tracker can't work out from markers alone (Sabotage, Demolition, the Attack & Defend outcomes) uses tallies plus rules text. Deployment styles are names only; the maps are in the OPR Advanced Rules PDF.

**Renaming things.** Saved forces store trait and relic *names*. When you rename one, add an entry to the rename maps in `migrate.ts` and bump `RULES_VERSION`, so that existing units pick up the new name. Nexus benefits are stored by `id`, so change a benefit's `name` and keep its `id`.

Run `npx vitest run` after a change. A few tests check specific values and will tell you if a rename broke something.
