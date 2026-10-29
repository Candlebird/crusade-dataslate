# Where the house rules live

Crusade and Nexus Wars are homebrew and get rebalanced often, so their numbers and tables are plain data. Edit them in the files below. The app reads everything from these files, so no other code needs to change.

| What | File |
| --- | --- |
| Crusade XP levels, trait/relic/scar tables, relics, requisitions, agendas, reward tables, XP and RP values | `data.ts` |
| Nexus Wars sector types and benefits, Anomaly and Void tables, Combat Manipulations, Umbra shop | `nexusData.ts` |
| Nexus Wars round values: match bonus, catch-up bonus, opening rounds, Void Echoes threat and spread, void salvage, Shard Mine roll, Relic Collector discount (`NEXUS_ROUNDS`) | `nexusData.ts` |
| Detachments: a further force's Starting Supply and the once-a-round reorganise cost (`NEXUS_DETACHMENTS`) | `nexusData.ts` |
| The map: default size, how full it is, the share of points of interest and their odds, and how many new ones appear each round (`NEXUS_MAP`). Generation and the round refresh are in `hexmap.ts` | `nexusData.ts` |
| Sector difficulty: the rating range, how distance and sector type push it up, when a sector gets a second modifier (`NEXUS_DIFFICULTY`), and the sector modifiers (`SECTOR_MODIFIERS`). The rating logic is in `difficulty.ts` | `nexusData.ts` |
| Strategic Assets earned from skirmish wins (`STRATEGIC_ASSETS`; the per-round cap and patrol threat drop are in `NEXUS_ROUNDS`), Reinforce Supply bonus (`NEXUS_REINFORCE_BONUS`) | `nexusData.ts` |
| Galactic Events, one rolled on a D16 for each round (`GALACTIC_EVENTS`; the effects are applied in `events.ts` and `rounds.ts`, and the production, research, fog, rating, nexus and zone files read its numbers) | `nexusData.ts` |
| The Nexus Crisis: how often it comes, the threat drop, Umbra Shard and MVP relic rewards, the Lord's VP (`NEXUS_CRISIS`), and the Echo Lords (`ECHO_LORDS`). The logic is in `events.ts` | `nexusData.ts` |
| Fog of war: how far a faction sees from its sectors, its home and a Watchtower (`FOG`). The logic is in `fog.ts` | `nexusData.ts` |
| Planet production: Materials banked per round, the Barracks rate, the bank cap, building slots and the Building Expansion's extra slots, Training Grounds XP, and each building's numbers (Trade Hub, Logistics Hub, Foundry, Vehicle Bay, Grand Exchange…) (`PRODUCTION`); the buildings with their tier, branch, requirements, Materials and Umbra Shard costs (`BUILDINGS`). Saved data still calls Materials `bank`. The logic is in `production.ts` | `nexusData.ts` |
| Tech tree: the branches (`TECH_BRANCHES`), Research earned per round, per research station and per Nexus Observatory, and the tier 2/3 research costs (`NEXUS_TECH`). The logic is in `tech.ts`; the UI is `components/TechTree.tsx` | `nexusData.ts` |
| Hero offers: how often one turns up, how long it waits, its level odds, relic chance and fee (`HERO_OFFERS`). The logic is in `heroes.ts` | `nexusData.ts` |
| Guardians: which sector types get one, the tier thresholds, the Tough multiplier, their XP and names, the D6 a Hero needs to take the relic (`GUARDIANS`). The logic is in `guardians.ts` | `nexusData.ts` |
| Guardian loot: the D10 table (Materials, Research, Blueprint, Building Expansion…) and the Rare/Legendary roll bonus (`GUARDIAN_LOOT`). Rolled in `nexus.ts` when the game is recorded | `nexusData.ts` |
| Warlords: the five Paths and their perks, the levels that unlock them, the wait before a new Warlord, and each perk's number (build discount, Research, move, XP, sight, Marauder weight, Umbra Shards) (`WARLORDS`). The logic is in `warlords.ts`; each perk is applied where its rule lives (`production.ts`, `tech.ts`, `movement.ts`, `fog.ts`, `rounds.ts`, `marauders.ts`, `nexus.ts`, `autoBattle.ts`) | `nexusData.ts` |
| Nexus Duels: how many settled duels the campaign keeps (`NEXUS_DUELS`). The logic (agreeing, wagers, moving faction stakes, each force paying or collecting its Umbra Shards and relics) is in `duels.ts`; the panel is `components/Duels.tsx` | `nexusData.ts` |
| Crossroads Journal: the skills, contexts, catalysts, complications and the reward tables (`JOURNAL_*`). The logic (dealing, GM framing, the checks and re-rolls, which rewards a journal may offer, applying the picked ending) is in `journal.ts`; Claude writing the four endings through the proxy (`proxy/worker.js`, route `/journal`) is in `journalAi.ts`, which falls back to the tables; the panel is `components/Journal.tsx` | `journalData.ts` |
| Downtime: the solo patrol (`SOLO_PATROL`), Expeditions and their sites (`EXPEDITION`, `EXPEDITION_SITES`), and unit tasks: Mentoring XP (`MENTORING`), Garrison against Marauders (`GARRISON`), Recon range and radius (`RECON`), and the Projects with their goals and rewards (`PROJECTS`, `PROJECT_DIE`); the training sim's tuning and enemies (`TRAINING`, `TRAINING_ENEMIES`); the Sortie's map, fights, XP caps, hauls, boons and shrines (`SORTIE`, `SORTIE_BOONS`, `SORTIE_EVENTS`). The logic is in `downtime.ts`, `tasks.ts`, `training.ts` and `sortie.ts`; the task picker is `components/UnitTaskModal.tsx`, the training game `components/TrainingModal.tsx` and the Sortie `components/SortieModal.tsx` | `downtimeData.ts` |
| The turn report's wording (the `TEXT` lines in `report.ts`, picked at random; `{sector}` and the like are filled in) | `report.ts` |
| The prose on the in-app **Rules** page (tables there come from the two files above) | `rulesText.ts` |
| Built-in battle tracker missions: the 18 OPR Advanced Rules missions, deployment styles and the example template | `missions.ts` |

**Missions.** You don't need code to add a mission. Use the in-app **Battle → Mission library**: duplicate the example or create a new mission. Custom missions sync to every player. A mission saved there with the same id as a built-in one replaces it. A battle that is already running keeps the copy of the mission it started with.

Scoring that the tracker can't work out from markers alone (Sabotage, Demolition, the Attack & Defend outcomes) uses tallies plus rules text. Deployment styles are names only; the maps are in the OPR Advanced Rules PDF.

**Rules page.** `rulesText.ts` reads its numbers from `data.ts` and `nexusData.ts`, so changing a value updates the Rules page too. Only edit it when a rule's wording changes. The round logic itself (ending a round, income, threat) is in `rounds.ts`.

**Renaming things.** Saved forces store trait and relic *names*. When you rename one, add an entry to the rename maps in `migrate.ts` and bump `RULES_VERSION`, so that existing units pick up the new name. Nexus benefits are stored by `id`, so change a benefit's `name` and keep its `id`. Units also keep a copy of a relic's weapon profile and note, so after changing those, bump `RULES_VERSION` too and add a step in `migrateForce` that runs `syncRelics`.

Run `npx vitest run` after a change. A few tests check specific values and will tell you if a rename broke something.
