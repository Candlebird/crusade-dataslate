# Training (Gem TD) module contracts

Shared shapes are in `types.ts` (the Echoes' — SpawnPlan, Enemy, Dot, NemesisState, RunNemesis, RunBeast — in `enemyTypes.ts`, re-exported from it); homebrew numbers in `TRAINING` / `SHARD_TYPES` / `TRAINING_ENEMIES` (src/rules/downtimeData.ts).
The run is plain JSON: no classes, functions or Maps on it. Card `apply` functions live in cards.ts code, never on the run.
Every action that can be refused has a `xxxProblem(...) => string | null` twin; the action itself throws on a problem.
Done already (foundation): `map.ts`, `rng.ts`, `board.ts`, `types.ts`, `economy.squadPower`, `recipes.canTrain`, `shards.shardValue`, `save.saveKey`.

## Who owns which run state

| Field(s) of TrainingRun | Owner (only this module writes it, others read) |
|---|---|
| v, forceId, seed, power, recipes, crafted, banked, log (end lines), phase, wave, t | run.ts |
| rng | rng.ts helpers (anyone may roll through `rand(run)`) |
| draft, pieces (shard / rubble add, remove, grade, draft flag) | shards.ts |
| pieces (shard → unit swap on craft) | run.ts (craft, via recipes.unitTower) |
| pieces (shard → DefaultTower swap on a default craft; key, name, slots) | emplacements.ts (craftDefault, via defaultTower) |
| UnitTower.up / cap / tough growth | economy.ts (buyLevel, applyLevel) |
| Tower combat fields (guns clocks, boost, dmgBoost, frenzy, holding, holdLeft, kills, dealt, skills cd) | combat.ts |
| UnitTower.grit, UnitTower.relics (set at craft), TowerGun.relic | recipes.unitTower (via veterans.gritOf, relics.socketsOf) |
| UnitTower.relics[].cd, Tower.rush, UnitTower.brace (set), dmgBoost from a brace ward | relics.ts (run.startWave resets via resetSockets, rush, brace 0) |
| UnitTower.brace (spent on a grab) | holds.ts |
| UnitTower.xp | run.ts (XP at wave end) |
| credits, luck, mends | economy.ts |
| baseHp | waves.ts (leaks), economy.ts (mends), cards.ts (base cards) |
| leaked, queue, enemies (add, move, leg, jumped, face) | waves.ts |
| clean (waves cleared in a row from the first with nothing through; set at each wave cleared) | run.ts |
| enemies (hp, status, dots, heldBy, regrab; removal of the dead) | combat.ts |
| cover | run.ts at create (via waves.layCover), cards.ts (cover card) |
| offer, cards, mods | cards.ts |
| fx | combat.ts pushes (relics.ts too, recoloured gold); run.step decays |
| UnitTower.quirks, UnitTower.trinket, UnitTower.coverMul; grit / tough / init / hit from habits | recipes.unitTower (via habits.habitsOf); habits.applyTrinket for a trinket card taken mid-run |
| UnitTower.tally, run.beasts, run.watch[].hit | tally.ts (from harm.hurt, holds.holds, waves.spawnOne) |
| run.watch[].passed | quirks.watchBosses |
| run.gains | quirks.rollGains (once, from endRun) |
| run.nemesis (set at create; slain by tally) | run.ts via nemesis.pickNemesis; tally.ts marks slain |
| Enemy.nem (speed, hard, free, next, regen, armed), boss SpawnPlan.nemesis / hp | nemesis.ts (nemesisPlan, nemesisTick); waves.spawnOne seeds it |
| run.trinket, CardDraw.trinket | trinkets.ts |
| run.shared | shared.bankShared (the force's Sortie layer banked once) |
| run.nexus (threat, affixes, event, lords; set at create, a JSON copy) | run.ts via nexus.nexusOf(campaign) (the UI passes it; bots pass none) |
| run.nexus.lords[].slain, .by; run.nemesis.by (the crafted unit that landed the killing blow) | tally.ts (a real lord's or the nemesis's kill) |
| run.honours (records, titles, tales, best: banked once) | records.bankHonours (from useBank.finish, before trainingBest moves) |
| Enemy.lord (i, next, ward, burst, armed), boss SpawnPlan.lord / hp | lords.ts (lordPlan, lordTick, lordDmg); waves.spawnOne seeds it |
| Enemy.hard, SpawnPlan.hard / elite / hp (affixes) | affixes.affixPlan; waves.spawnOne copies hard |
| SpawnPlan.elite, Enemy.elite (one kind a wave, every eliteEvery-th from eliteFrom) | waves.planFor via waveKinds.isElite; waves.spawnOne copies it |
| TowerGun.shard, TowerGun.air (the Shard rule and anti-air a gun carries) | shards.shardGun (Shards and default towers) |
| Enemy.surge | affixes.ts (onEchoDeath sets it, affixTick wears it) |
| Unit.trainingRecord, Force.tales | records.bankHonours |
| Unit.titles (stored ids, oldest first), Unit.title (the one shown; '-' none; unset the latest) | titles.earnTitles (records.bankHonours, downtime.applySortie); titles.pickTitle (UnitSheet via UnitRecord) |
| run.drill (luck cap, open boss cards, perks: a JSON copy of drill.drillOf(force) at create), run.siege (the ISO week) | run.ts via createRun opts (the UI's freshRun passes drill, or siege for a Weekly Siege; bots pass either or none) |
| run.rerolls (card offers re-drawn) | cards.rerollCards |
| run.auto (the Auto (debug) button was used: nothing banks) | the UI (TrainingModal, via useAuto); useBank reads it |
| run.drilled (earned: goal indexes reached so far, set by drillNews) | drillBank.bankDrill (once, from useBank.finish, before bankHonours) |
| Force.drill (DrillStats: runs, kills, bosses, lords, clean, crafted, sieges, siege {week, best}) | drillBank.bankDrill (seeded from the units' trainingRecords the first time, via drill.drillStats) |
| Campaign.siegeBoard (each force's best a week, last TRAINING.siege.weeks weeks), Campaign.siegeWins (settled weeks, last TRAINING.siege.keep) | siegeBoard.postSiege (useBank.finish), siegeBoard.settleSieges (useBank.finish, useSiegeSettle on Training open and the RoundPanel assets row) |
| run.finale (final, lord at create; dealt / slain / by from tally; through from waves.walk; victory from run.ts; banked from veterancy.bankFinale) | run.ts via finale.newFinale (createRun opts.final: freshRun passes veterancy.finaleOpen(force)) |
| Force.finale (vet, open, wins by Final, endless) | veterancy.noteVeterancy (the store, on every change), veterancy.bankFinale (useBank.finish) |
| Force.sortie.bestiary (incl. SortieBeast.drill), Unit.quirks / trinket, sortie.trinkets, sortie.bled | shared.ts (bankShared, bestiary.bankBeasts) on finish; sortie.ts / downtime.applySortie as before; applySortie clears bled[lord] once a Sortie meets it |

## run.step(dt) call order

```
run.fx = run.fx.filter(f => (f.t -= dt) > 0)
if (run.phase !== 'wave') return
run.t += dt
waves.spawnDue(run)
combat.auras(run, dt)          // boosts from auras; dmgBoost wears down
nemesis.nemesisTick(run, dt)   // the nemesis's signature and tricks (dirge -1 hit after auras; dive, tremor, brood, regen)
lords.lordTick(run, dt)        // real Echo Lords: ward up, Dread -1 hit near it, timed tricks, Surge wears off
affixes.affixTick(run, dt)     // Regenerating mends Echoes (not bosses); a Vengeful rush wears off
combat.abilities(run, dt)      // timed skills, fields, bleed fields, Vigor bleed
relics.relics(run, dt)         // rush wears down; each socket's clock; one that goes off restarts it (fx gold)
combat.holds(run, dt)          // grab / release (before walking, so held enemies stand still)
combat.fireAll(run, dt)        // volleys; hurt() pays kills, death-blasts, boss → cards.offerCards
combat.tickEnemies(run, dt)    // statuses, dots, regrab cooldowns
waves.walk(run, dt)            // move, ambush jump, leaks → baseHp, leaked
quirks.watchBosses(run)        // units a live boss walks past in reach
combat.reap(run)               // drop the dead (and leaked ones waves already removed)
if (run.finale.through) endRun(run, finale.throughText(run))   // the Final boss reached the base
else if (run.baseHp <= 0) endRun(run, 'The base falls.')   // endRun → quirks.rollGains once
else if (!run.queue.length && !run.enemies.length) → wave cleared (run.ts, private):
    run.cleared++, run.clean = run.cleared while nothing has leaked, run.credits += economy.waveCredits(run), XP to crafted units, phase 'build',
    a siege's Final ends the run (score = finale.dealt); the Final boss slain → finale.victory 'pending' (startProblem refuses until
    continueEndless or bankVictory), shards.drawDraft(run), log line. (The UI saves the run whenever it sees a new build phase.)
```

## Functions (exact signatures)

### board.ts (done)
- `dist(ax, ay, bx, by): number` — straight-line distance.
- `centreOf(p: Tile): {x, y}` — middle of a 2×2 piece.
- `BASE: {x, y, tile, radius}` — the base's middle, top-left cell, and reach-it radius.
- `pieceById(run, id): Piece | undefined`
- `pieceAt(run, x, y): Piece | undefined` — the piece covering cell (x, y).
- `towers(run): Tower[]` — kept Shards and crafted units (what fires).
- `unitTowers(run): UnitTower[]`
- `shardsOnMap(run, draft = true): ShardPiece[]` — kept Shards, plus this draft's when `draft`.
- `mapOf(run): MapState` — the maze (every piece blocks), cached by layout.
- `routeOf(run): Tile[]` — cells a walker crosses, spawn to base.
- `placeProblem(run, x, y): string | null` — legal spot for a new 2×2 piece (map, pads, spawn corner, overlap, route open).
- `inCover(run, x, y): boolean` — is the cell in a cover patch.

### rng.ts (done)
- `rand(r: Rng): number` — [0,1), advances r.rng (Rng = `{ rng: number }`, a run is one).
- `randInt(r, lo, hi): number`, `pick(r, xs): T`, `d6(r): number`, `weighted(r, weights): number`, `shuffle(r, xs): T[]`
- `hitChance(quality, mod): number` — OPR to-hit odds (6 always hits, 1 always misses).
- `saveChance(defense, ap, mod = 0): number`

### recipes.ts
- `canTrain(u: Unit): boolean` (done) — any active unit.
- `habitsOf(u: Unit): { shoot; melee; init; jumpy; myopic }` — Sortie quirks/trinket (port old habitsOf, minus def/wounds).
- `habitNames(u: Unit): string[]`
- `typeScores(u: Unit, force: Unit[]): Record<ShardType, number>` — rank-based fit of each Shard type.
- `recipesFor(units: Unit[]): Recipe[]` — one unique recipe per trainable unit; deterministic.
- `recipeUses(recipe: Recipe, shards: ShardPiece[]): number[] | null` — ids (slot order) satisfying it, lowest grades first.
- `readyRecipes(run): { unitId: string; uses: number[] }[]` — craftable now (not crafted; kept + this draft's Shards).
- `unitTower(u: Unit, id: number, at: Tile, craftedAt: number): UnitTower` — fighter() + habits + abilities skills; cap from economy.levelCap.

### shards.ts
- `shardValue(g: Grade): number` (done) — 2^(g-1).
- `gradeName(g: Grade): string`
- `draftLuck(run): number` — run.luck + nexusStart(run).luck (Shard Rush), capped at the odds table.
- `rollGrade(run, r: Rng = run): Grade` — by TRAINING.shards.odds[draftLuck(run)], on the dice given (drawDraft passes siege.draftDice).
- `drawSize(run): number` — always TRAINING.shards.draw (no perk, event or siege changes a draft's size).
- `drawDraft(run): void` — run.draft = { step: 'place', hand: drawSize× DrawnShard, placed: [] }.
- `shardPiece(id, at: Tile, type: ShardType, grade: Grade, draft: boolean): ShardPiece` — guns/Quality from SHARD_TYPES × value.
- `placeDraftProblem(run, i, x, y): string | null` — build phase, step 'place', hand[i] exists, board.placeProblem.
- `placeDraft(run, i, x, y): void` — adds a draft ShardPiece (id run.nextId++); empty hand → step 'keep'.
- `keepOptions(run): KeepOption[]` — each draft piece plain, and (grade > 1) a grade down (`down: true`, never with a merge; the bot skips these); 2 alike (type+grade) → +1, 4 alike → +2, cap 5.
- `keepProblem(run, opt: KeepOption): string | null` — keep step, and `opt` matches one of keepOptions.
- `keep(run, opt: KeepOption): void` — kept piece draft=false (new grade, guns rebuilt); rest of draft → rubble; step 'done'.
- `SHARD_KINDS: ShardType[]`; `shardGun(type, grade): TowerGun` — attacks = max(1, round(SHARD_TYPES attacks × value)).
- `shardDps(type, grade, defense = 5): number` — expected damage/s (no cover/auras/armour), for tuning and the bot.
- `toRubble(run, ids: number[]): void` — pieces become RubblePiece in place (same id and cell).
- `crumbleDraft(run, except: number[]): void` — draft ends without a keep (a craft used draft pieces): draft Shards in `except` are kept (draft=false), the rest rubble, hand dropped; draft reset to { step 'done', hand [], placed [] }.
- `clearProblem(run, id): string | null`, `clearRubble(run, id): void` — free, build phase only.

### economy.ts
- `squadPower(units: Unit[]): number` (done) — points × (1 + levelPower × level); Sortie uses it.
- `levelCap(points): number` — TRAINING.levels.caps.
- `levelCost(t: UnitTower): number` — max(base, base × points/perPoints) × growth^up.
- `levelProblem(run, id): string | null`, `buyLevel(run, id): void`
- `applyLevel(t: UnitTower): boolean` — +1 up, +1 tough (others read `up` for dmg/rate/range); false at cap.
- `luckCost(run): number | null` (less the Thrift perk), `luckProblem(run): string | null` (also refused at drill.luckCap), `buyLuck(run): void`
- `mendCost(run): number`, `mendProblem(run): string | null`, `buyMend(run): void` — +mend.hp (+ the Field mending perk), cap baseHp; run.mends++.
- `killCredits(e: Enemy): number` — max(1, round(cost × perCost)) / wave.crowd (the Lord's not divided): a fraction; the UI floors credits.
- `payKill(run, e: Enemy): void` — run.credits += killCredits × run.mods.bounty (rounded to 1e-6).
- `waveCredits(run): number` — wave + perWave × run.wave, + noLeak if run.leaked === 0.

### combat.ts
- `type Harm = 'shot' | 'melee' | 'other'`
- `reach(t: Tower, g: TowerGun): number` — cells (inches × TRAINING.rangeMul, via `rangeCells`), + levels × levels.range, + boost.range; melee meleeReach.
- `rangeCells(inches): number` — inches × rangeMul (0.5 since the playtest pass); every tower, Shard, default and relic shot, and barrage radii.
- `partsOf(t: Tower): [ShardType, Grade][]` — a Shard's own type and grade, a default's slots, nothing for a unit (auras, Vigor bleed).
- Damage to a flyer × the gun's `air` (Firepower, Swift: SHARD_TYPES.air); a Shard's or default's wound applies its gun's `shard` rule (daze, slow).
- `levelDmg(t: Tower, g: TowerGun): number` — 0 for Shards.
- `auras(run, dt): void` — recompute boost; wear dmgBoost.left.
- `abilities(run, dt): void` — heal→bleed field, shield→dmgBoost on a random other tower, barrage, frenzy, field, Vigor bleed.
- `holdTime(run, t: UnitTower, e: Enemy): number` — 0.3 s × tough (cap 1.5) × bigMul for big/boss × mods.holdMul; 0 if it can't.
- `regrabTime(run, e: Enemy): number` — regrab[0] at Def 6 … regrab[1] at Def 2, + mods.regrabAdd.
- `holds(run, dt): void` — grab one walker in meleeReach if free; release; thorns/leech/lastStand during holds.
- `fireAll(run, dt): void` — volleys and shots (port old fire(); cover: target inCover → hit −1 for shots).
- `hurt(run, by: Tower | undefined, e: Enemy, dmg: number, how: Harm): void` — kill → by.kills, economy.payKill, death-blast, boss → cards.offerCards.
- `tickEnemies(run, dt): void` — statuses, dots (hurt by their piece), regrab countdown.
- `reap(run): void` — remove hp ≤ 0 enemies, free any tower holding them.
- Also: `fire(run, t, g, extra?)` (one attack), `rateOf(run, t)` (attack-speed multiplier), `afflict(run, t, e, status)`,
  `targetFor(run, t, g)`, `FX_TIME`, `FX_COLOR`. `hurt` takes an optional 6th `chain = true` (false: its kill sets off no death-blast).
- Split (combat.ts re-exports all of it; import from combat.ts): `harm.ts` (reach, levelDmg, hurt, afflict, dots, targeting,
  fx consts, dmgMul), `holds.ts` (holdTime, regrabTime, holds), `skills.ts` (auras, abilities).

### veterans.ts (living recipes)
- `recordOf(u): RecordEntry[]` — traits (unit, then weapon), then scars (less TRAINING.veterans.notScars).
- `traitType(r): ShardType | undefined` — veterans.traitTypes, else its effect's type, else its weapon's (melee/shooting).
- `recordBudget(u): { lifts: (ShardType | undefined)[]; cracks: number }` — traits − scars, capped ±veterans.cap.
- `adjustSlots(slots, budget): RecipeSlot[]` — a copy: each lift +1 grade (own type, else lowest; all Pristine → a new grade-1 slot, up to maxSlots), each crack −1 on the dearest (floor 1).
- `gritOf(u): { hold; tough; atk; init }` — what the record does beyond fighter(): veterans.grit, redeploy/revive traits, liftDmg/crackDmg a grade.
- `rangeBonus(u, gun): number` — cells from +6" range weapon traits.
- `recordBadges(u): RecordBadge[]` — {name, kind, type?, text} for PieceInfo and RecipeBook. `hereText(e)` — an effect in Training words.
- recipes.recipesFor adjusts each unit's raw best recipe by its record before the uniqueness check (adjusted signatures stay unique).

### relics.ts (relic sockets)
- `relicKind(name): 'wargear' | 'armour' | 'artefact' | 'banner'` — by name, then RELICS desc, else wargear.
- `socketOf(r): RelicSocket` — act: 'shot' for a profiled relic (gun = its name), a mapped effect's act, else its kind's (pulse / brace / mark / rally); every = cd[tier] × actMul[act]; cd = every × first.
- `socketsOf(u): RelicSocket[]`; `socketRuns(s, source, kind)` — a timed relic skill (barrage/shield/frenzy) the socket runs (dropped from skills).
- `relics(run, dt): void` — wear Tower.rush; tick every socket; a go that finds nothing to do tries again next step.
- `resetSockets(t)` — every clock back to its first go (startWave). `relicText(s): string` — for the tower card.
- New fields: `UnitTower.relics?: RelicSocket[]`, `UnitTower.grit?` (hold-time share), `UnitTower.brace?` (next hold ×), `Tower.rush?: {mul, left}` (rateOf × (1 + mul)), `TowerGun.relic?` (fires gold).

### habits.ts (Sortie quirks and trinkets in Training)
- `interface Habits { shoot; melee; init; jumpy; myopic; hold; tough; cover }`; `quirkHabit(id)`, `trinketHabit(k)` — every SORTIE_QUIRKS id (region ones by prefix) and SORTIE_TRINKETS entry, numbers in TRAINING.habits.
- `habitsOf(u)`, `coverMulOf(h)` (cover hit × this, floor 0), `habitText(h)`, `habitBadges(u): HabitBadge[]` ({name, kind, good, text}), `habitNames(u)`.
- `applyTrinket(t, id)` — a trinket taken mid-run straight onto the tower.

### tally.ts
- `tallyHarm(run, by, e, dealt, how, killed)` — UnitTower.tally shot/melee, watch[boss].hit, beasts slain, nemesis / real lord slain (with `by` = the killing unit). `tallyHold(t)`.
- `noteMet(run, e)` — beasts[kind].met once a wave. `beastOf(e)` ('nemesis' for one with nem), `watchOf(run, e)`.

### nemesis.ts (the Sortie nemesis as wave TRAINING.shared.nemesis.wave's boss)
- `pickNemesis(story?): RunNemesis | undefined` — highest grudge (ties in SORTIE_BOSSES order); rematch = min(tricks, bestiary lord slain).
- `isNemesisWave(run, w)`, `nemesisPlan(run, plans)` — the boss plan marked nemesis, hp × (1 + hp × grudge), a log line.
- `nemesisTricks(n)`, `sigText(sig)`, `dirgeOn(run, e)`.
- `nemesisTick(run, dt)` — arms clocks; speed (rage × vengeful), hard (Hardened), free (dread: no holds), dirge −1 hit near it, dive out of a hold, tremor base damage, brood Swarmlings (spawnOne), regen with the third trick.

### quirks.ts (quirk gains)
- `watchBosses(run)`, `topStat(t)`, `snubbed(run): Set<unitId>` (passed, never hit).
- `rollGains(run): QuirkGain[]` — idempotent via run.gains: the MVP of a run reaching quirks.goodFrom a good quirk (goods[topStat]) at `good`; each snubbed unit a bad one (bads[topStat]) at `bad`; addQuirk rules (max 3).

### bestiary.ts
- `beastKey(run, k)` — kind → Echo name (TRAINING.shared.beasts), 'nemesis' → `lord:<id>`. `loreKnown(b)` — slain or drill.
- `bankBeasts(story, run): string[]` — met / slain added (a lord killed here → drill, not slain); lines for first meetings and lore.

### Nexus (F3): nexusTypes.ts, nexus.ts, lordPick.ts, lords.ts, affixes.ts
Numbers in `TRAINING.nexus`. Outside a campaign run.nexus is undefined: threat 0, no affixes or event, every boss the generic lord.
- nexusTypes.ts: `NexusAffixId`, `LordTrick`, `RunLord {key, name, tier, trick, from, slain?, by?}`, `RunNexus {threat, affixes, event?, lords}`, `LordState`; re-exported from types.ts.
- nexus.ts: `nexusOf(c?): RunNexus | undefined` — threat (+ Rising Dark), affixes (one a `affixes.per` levels, at most `affixes.max`, dice seeded by campaign id and round), this round's event only, lords via lordPick.campaignLords.
  `threatOf`, `hasAffix`, `eventIs`, `eventMapped(id)`, `creditMul(run)` (1 + credit × threat), `budgetMul(run)` (Fierce, Echo Surge, Void Lull),
  `nexusStart(run)` → {credits, baseHp, cover, luck, xp} (Convoys, Bleed, Derelicts, Shard Rush, Glory), `affixInfo(id, threat)`, `shroudFrom(threat)`,
  `eventEffect(id)`, `eventInfo(id)` → {name, desc, effect ('' = flavour)}, `nexusLines(nx, nemesis, final?)` → {threat, affixes[], event, lords[]} for the start screen and HUD.
- lordPick.ts (pure, no engine imports): `campaignLords(c, r)` — sector guardians (by name, at most lords.max − crisis slot, tier order), then the unwon crisis lord as Legendary;
  keys `nexus:g:<name>` / `nexus:<ECHO_LORDS id>`; tricks by ECHO_LORDS id (tricks.byLord), a guardian's rules (byRule), else one of `plain` by its name.
  `guardianTrick(g)`, `TRICK_NAMES`, `trickText(k)`, `lordWaves(nx, nemesis, final = finale.from)` (boss waves from lords.from, skipping the nemesis wave and the Final; the crisis lord, if last, takes the Final at finale.to), `lordIndex(run, w)`, `nextLord(run, w?)`, `lordLine(l, wave?)`, `lordsSlain(run)`, `GENERIC_LORD`.
- lords.ts: `lordOf(run, e)` (i −1: run.finale.lord), `lordPlan(run, plans)` (boss plan not the nemesis's → lord i, hp × lords.hp[tier]), `lordTick(run, dt)`,
  `lordHit(run, g, e)` (Mirror Veil −1 to shots; combat.fire), `lordDmg(run, by, e, dmg, how)` (Umbral Hide, Ward; harm.hurt).
- affixes.ts: `affixPlan(r, run, plans)` (Frenzied hp, Proud elites, Armoured hard), `affixPace(run, e)` (Swift, Warp Currents, a Vengeful surge; waves.speedOf),
  `affixTick(run, dt)`, `onEchoDeath(run, dead)` (Vengeful; harm.hurt after payKill), `affixHit(run, g, d, reach)` (Shrouded, Ion Storm; combat.fire, never melee).
- Elsewhere: harm.unsaved − Enemy.hard; economy payKill / waveCredits × creditMul; shards.`drawSize(run)`; run.`runXpCap(run)` (xpCap + Glory);
  tally beastOf → `real:<i>`, marks slain; bestiary.beastKey `real:<i>` → the lord's key (banked slain, not drill); sortie.beastInfo knows `nexus:` keys
  (Sortie goals and rematches ignore them); feats.trainingFeats(cleared, lords) → 'trainLord' (Lordfall).

### Names, records and titles (F4): titles.ts, records.ts, tales.ts, taleText.ts
Numbers in `TRAINING.titles` (each `{name, n}`, Unbowed also `scars`) and `TRAINING.records` (`tales` a run, `keep` on the force). `SORTIE.veteran` is gone.
- titles.ts (pure: no engine imports; sortie.ts and downtime.ts use it): `TitleId`, `TitleDef {id, name, where, text}`, `TITLES` (20, one list with Sorties), `titleInfo(id)`.
  `TrainDeed {cleared, kills, holds, lords, nemesis, mvp, scars, clean}`, `SortieDeed {up, won, deep, top, ascension, heat, nemesis, alone}`.
  `recordTitles(u)` (from sortieRecord / trainingRecord, so old saves hold theirs unstored), `trainingTitles(d)`, `sortieTitles(d)`,
  `heldTitles(u)` (stored, then record ones), `titlesOf(u)`, `earnTitles(u, ids, before): TitleId[]` (stores, returns the new ones in list order),
  `shownTitle(u)`, `pickTitleProblem(u, id)`, `pickTitle(u, id)`. sortie.`veteranTitle(u)` = shownTitle's name.
- records.ts: `blankRecord()`, `deedOf(run, t, u?)` (lords: real ones it landed the killing blow on; mvp: run.mvp with kills > 0; scars less veterans.notScars),
  `recordAfter(rec, d)` (lords + 1 for the nemesis), `runHonours(run, force, best?)` (pure: records, titles, `best`, tales; RunSummary shows it before banking),
  `bankHonours(f, run, date, newId, round?): string[]` (once via run.honours; tales prepended, `records.keep` kept, `round` = campaign round), `recordLine(r)`, `talesFor(f, unitId)`.
- tales.ts: `Highlight {kind, units, vars}`, `taleText(h, seed, i)` (seeded pick from taleText.TALE_TEXT), `talesOf(hs, seed)` — priority victory, nemesis, best, lord, title; at most `records.tales`.
- Sortie side: downtime.applySortie builds a SortieDeed per party member (heat = sortie.markHeat when the lord fell; nemesis = a lord slain with grudgeBefore > 0; alone = the only one standing at a win) and earns titles with a line each.
- Chronicle: chronicle.`chronicle(c, viewer?, forces = [])` adds kind 'training' (🎖) entries for tales with a round, from forces linked to the campaign's factions (a viewer sees only its own).
- UI: training/RunHonours.tsx (record table, titles, tales in RunSummary once over), training/UnitRecord.tsx (title picker, records, the title list, tales on UnitSheet).

### Drill Honours and the Weekly Siege (F5): drill.ts, drillBank.ts, siege.ts, siegeBoard.ts
Numbers in `TRAINING.drill` (luckAtStart, cardsAtStart, groups of boss cards, perks, 22 goals `{goal, n, unlock}`; goal 'final' = the highest Final won) and `TRAINING.siege` (weeks on the board, wins kept). Types `DrillGoal`, `DrillPerk`, `DrillUnlock` in downtimeData.ts; `DrillStats`, `SiegeBoardEntry`, `SiegeWin` in model/types.ts; `RunDrill {luck, cards, perks}` in types.ts.
- drill.ts (pure): `DRILL_GOALS`, `blankDrill()`, `drillStats(f)` (Force.drill, else seeded from the units' trainingRecords), `drillProgress(f, goal)` (best wave, titles and lore from the force; the rest from DrillStats), `goalReached(f, i)`, `drillEarned(f): number[]`,
  `drillFrom(earned): RunDrill`, `drillOf(f)`; on a run (no run.drill = all open, no perks): `luckCap`, `cardOpen(run, id)`, `perkOf(run, p)`, `purseOf`, `thrifty(run, cost)`, `mendPerk`, `rerollsOf`; `drillGoalText(goal, n)`, `unlockText(u): {name, text}`.
- drillBank.ts: `statsAfter(st, run)` (kills from pieces; bosses = generic, nemesis and real lords slain; lords = real lords + nemesis; clean and crafted the best; a siege counts once a week and keeps that week's best),
  `drillPreview(f, run)` (goals reached once this run banks; RunSummary), `bankDrill(f, run): number[] | null` (once via run.drilled; returns the goals reached before), `drillNews(f, run, before): string[]` (after every other bank, so best, titles and lore count; sets run.drilled.earned).
- siege.ts (types only): `isSiege`, `siegeDice(run, 'draft' | 'wave', w)` (seed salted by wave: never moves run.rng), `draftDice(run)`, `waveDice(run, w, own)`, `siegeScore(run)` = max(wave, cleared), `siegeDmg(run)` (damage to the Final boss once the run reached it, else undefined), `siegeOrder(a, b)` (damage-holders first by dmg, then score, then cleared). The cover and first draft come from the week's seed; later drafts and every wave from these dice, so every force meets the same ones (scaled by its points) however it plays.
- siegeBoard.ts (pure, no engine imports): `weekSettled`, `postSiege(c, force, run, date)` (a force's best a week, refused once settled), `siegeRanking(board, week)` (siegeOrder, then earliest; entries from before dmg rank by score, below every damage), `weeksDue(c, nowWeek)`, `settleSieges(c, nowWeek, date): SiegeWin[]` (mutates c: winner of each past week, round = c.round),
  `siegeAssets(c, factionId)` (wins settled this round; rounds.assetsOf adds them to skirmish wins within NEXUS_ROUNDS.assetsMax), `lastSiegeWin(c?)`.
- UI: training/freshRun.ts (`freshRun(force, c, siege)`: a drill run with story and Nexus, or a siege on the week's seed), training/useSiegeSettle.ts (`thisWeek()`, `useSiegeSettle(c)`), training/DrillTrack.tsx, training/SiegePanel.tsx; StartScreen toggles Your own / Weekly Siege; CardOffer's Re-draw; useBank.finish banks the drill, posts the siege and settles.

### Final waves (finaleCore.ts, finale.ts, veterancy.ts)
Numbers in `TRAINING.finale` (from, step, to, bars, climb, endless, rise, riseEvery, escorts, lords, bossHp, trick, siegeHp). Types `RunFinale` (nexusTypes.ts), `ForceFinale` (model/types.ts).
- finaleCore.ts (no imports): `finalOf(run)`, `inEndless(run)`, `endlessDepth(run)` (waves cleared past the Final in Endless).
- finale.ts: `SIEGE_BOSS`, `finalSteps()`, `finalLord(final)`, `newFinale(final, siege)`, `isFinalWave(run, w)`, `finalBoss(run)` (name: colossus, nemesis on its wave, a campaign lord, else finale.lord),
  `finalePlan(run, plans)` (boss marked final, × bossHp[final], a named lord lord −1 × lords.hp[tier]; a siege's a lone boss of siegeHp), `throughText(run)`. lords.ts: a Final boss's Ward and Regrowth are finale.trick as much.
- veterancy.ts: `unitXp(f)`, `veterancyOf(f)` (max of stored and Σ unit XP), `stepBar(n)`, `finalWon(f)`, `finaleOpen(f)`, `noteVeterancy(f)`, `runWon(run)`, `finaleAfter(f, run, date)`, `bankFinale(f, run, date): string[]` (once via run.finale.banked), `finaleTrack(f)`.
- UI: training/FinaleTrack.tsx (StartScreen), HudBar's Final / Endless chip, TrainingModal's Victory card (Bank and end / Continue into Endless; useAuto goes on), RunSummary's Victory and siege damage lines.

### trinkets.ts
- `TRINKET_CARD`, `isTrinketCard(d)`, `trinketDice(run)` (its own dice from seed and wave: never moves run.rng).
- `trinketOffer(run)` — each boss kill at trinkets.odds until one is offered (then never again); to the crafted unit with most kills and none, else spares. `trinketCardText`, `takeTrinket`.

### shared.ts
- `bankShared(f, run): string[]` — once (run.shared): gains via addQuirk, the trinket (equipped, else spares within SORTIE.trinkets.spares), the bestiary, a slain nemesis → sortie.bled[id]++. Called inside useBank's updateForce.
- `sharedPreview(run)` — {text, good} lines for RunSummary.
- Sortie side: sortie.createRun opts.bled → `bleed(run, n)`: weaken += n × nemesis.bled (capped), tricks dropped, the rest as known omens (need − 1 max), a journal note.

### waveKinds.ts
- `kindPool(w, flies)` — kinds out by wave w with a TRAINING.wave.kinds weight, never the boss, a flying wave's only main-spawn ones.
- `waveKind(r, w, flies)` — weighted draw from kindPool (swarm if none). `costOf(kind)` — cost / wave.crowd (what one costs a wave's budget; waves are crowd times as thick as costs say). `countFor(kind, budget, max)` — { n: round(budget/costOf) in 1..max, hpMul: budget/(n × costOf) }.
- `isElite(w, i)` — i-th spawn (from 0) of wave w: w ≥ eliteFrom and (i + 1) % eliteEvery === 0.

### emplacements.ts (default towers)
- `DEFAULTS` (TRAINING.defaults.recipes: 13 sets covering each of the 40 Shard kinds once, exact grades), `defaultByKey(key)`, `defaultValue(d)`.
- `emplacementUses(d, shards)` — ids in slot order, exact type and grade, kept Shards first; null if they can't.
- `defaultHidden(run, d)` — a unit recipe of the run fills from d's exact Shards (recipes.recipeUses). `defaultsFor(run)`, `readyDefaults(run)` (as readyRecipes).
- `defaultTower(d, id, at): DefaultTower` — each Shard's gun and rule; Quality best of theirs − qualityBonus (2+ best); attacks × k so dps.towerDps = dpsShare × unitDps × value at dpsDefense. No XP, levels, traits or relics (not a UnitTower: economy, XP and records skip it).
- `craftDefaultProblem(run, key, uses, onId)`, `craftDefault(run, key, uses, onId)` — as run.craft: stands on onId, other uses → rubble, a draft craft is the keep; any number of each; not in run.crafted.

### dps.ts
- `gunDps(t, g, defense = 5)`, `towerDps(t, defense = 5)` — expected damage/s (hit, save, Deadly, Blast, atkBonus; no cover, auras, levels or skills). Tuning and default towers.

### clock.ts
- `gameSeconds(real, speed)` — real × speed × TRAINING.timeScale (0.5: 1× is half the old pace). Only useRunLoop reads it; the engine and bot count sim seconds.

### flightLane.ts
- `LANE: Leg[]` (spawn → pads → base, centres), `legDist(l, x, y)`, `laneDist(x, y)`, `laneCells()` (cells within flightLane.width, drawn faintly while building before a flying wave), `antiAir(type)`, `spotsBy(l, r)` (buildable spots within r of a leg). Building beside the lane is open (only pads, base and spawn corner are barred).

### waves.ts
- `isFlyWave(w)`, `isBossWave(w)`, `isFlyBossWave(w): boolean`
- `planWave(run, w: number): SpawnPlan[]` — one kind a wave (waveKinds.waveKind; a boss wave the lord + one escort kind; a flying wave one main-spawn kind), as many as countFor buys (the rest of the budget in their wounds), every eliteEvery-th from eliteFrom an elite (×eliteHp, gold outline); on siege.waveDice (a siege's own dice for wave w, else the run's); via `nexusWave`: planFor(power × nexus.budgetMul) then affixes.affixPlan; budget base × (power/perPoints) × w^curve × growth^(w-1) (count capped at maxCount, flyMax flying); flyers (×flyHpAt(w)); boss + escorts (the boss's wounds × max(bossMin, (budget − escorts) / costOf(lord)), ×bossHpAt(w); a sky boss alone flies, ×flyHpAt × flyBossHp, its escorts walk); scouts at pad scoutAt (scoutHp); ambush hp; hp ×lateHp(w) ×groundHpAt(w) (minions and boss); staggered by gap; sorted by `at`.
- `previewWave(run): SpawnPlan[]` — planWave(run.wave + 1) on a copy of the dice.
- `layCover(r: Rng, n: number, route: Tile[]): Tile[]` — n patches, onRoute share centred on route cells, clear of pads/base/spawn.
- `spawnDue(run): void` — queue entries with at ≤ run.t → enemies (id run.nextId++).
- `speedOf(run, e: Enemy): number` — cells/s: def.speed × walkMul × slow/daze.
- `leakCost(e: Enemy): number` — def.leak, or leak.elite for an elite if more; a boss ceil(leak × hp/maxHp), never below leak.bossMin.
- `walk(run, dt): void` — skip held (heldBy) / stunned; walkers by flow field, flyers pad to pad; ambush jump on reaching pad ambushFrom → pad ambushAt; reaching base: remove, baseHp −= leakCost, leaked++.
- Also (waves agent): `waveTags(w): string[]` ('Flying'/'Boss' for the HUD), `waveBudget(power, w)`, `lateHp(w)` (hpGrowth from hpFrom to hpTo, lateGrowth after), `groundHpAt(w)` (1 on flying and sky-boss waves; groundGrowth a wave from groundFrom to groundTo, groundLate after), `flyHpAt(w)`, `bossHpAt(w)`,
  `planFor(r: Rng, power, w, final = finale.from)` (planWave on any dice; past finale.from at `levelOf(w)` × `climbAt(w, final)`, a boss wave's escorts finale.escorts of the budget), `levelOf(w)`, `climbAt(w, final)`, `climbHp(w, final)`, `previewGroups(plans): PreviewGroup[]` ({kind, n, elites, hp, flies}
  for WavePreview), `mainKind(plans)` (the wave's one kind, for the preview and log), `runCover(r, extra = 0): Tile[]` (createRun's cover, + extra patches for Derelicts: patches range on the empty map's route), `layCover` takes an
  optional 4th `taken: Tile[]` to keep clear of, `atBase(e)`, `move(m, e, step)`. New TRAINING keys: `dazeMul`, `wave.bossMin`.
- `spawnOne(run, plan): Enemy` — one spawn (spawnDue and the nemesis's brood); a nemesis plan gets `nem`; noteMet. speedOf × nem.speed × the lord's Surge × affixes.affixPace; a real lord's plan gets `lord`, an Armoured one `hard`.

### cards.ts
- `interface TrainingCard { id; name; rarity; text; unit?(t); apply(run, t?) }`, `CARDS: TrainingCard[]`
- `drawCards(run): CardDraw[]` (only drill.cardOpen cards; offer + the Wider choice perk), `cardById(id)`
- `rerollsLeft(run)`, `rerollProblem(run)`, `rerollCards(run)` — the Second thoughts perk: re-draw the offer (a trinket card stays), run.rerolls++.
- `offerCards(run): void` — sets run.offer unless one is on offer; trinkets.trinketOffer may add a 4th (trinket) card. cardText / pickCard branch on isTrinketCard.
- `cardText(run, d: CardDraw): { name; text }`
- `pickCard(run, i: number): void` — apply, push to run.cards, clear offer, log.
- `autoCardIndex(run): number`

### save.ts
- `saveKey(forceId): string` (done) — `trainingRun:<forceId>`.
- `serialize(run): string`, `deserialize(s: string): TrainingRun | null` — JSON; null on bad/old version. fx may be dropped.
- `saveRun(run): void`, `loadRun(forceId): SavedRun | null` (null for a run already 'over'), `clearSave(forceId): void` — localStorage wrapped in try/catch.
- `SAVE_VERSION` (9: the Final wave and Endless (run.finale); 8: crowded waves, fast guns and the base at 80 HP; 7: the playtest pass, default towers and one-kind waves; 6: Drill Honours and the Weekly Siege; 5: names, records and titles; 4: the Nexus; 3 was the Sortie layer; 2 living recipes and relics); run.v and SavedRun.v must match it. `staleSave(forceId): boolean` — drops an older version's save and says so (true) until `ackStale(forceId)`, which TrainingModal calls once the start screen has shown its note (a StrictMode double render still sees true).

### run.ts
- `createRun(forceId: string, units: Unit[], seed: number, story?: ForceSortie, nexus?: RunNexus, opts: { drill?: RunDrill; siege?: string; final?: number } = {}): TrainingRun` — run.finale = finale.newFinale(opts.final ?? finale.from, siege); — run.drill = a copy of opts.drill (unset: everything open), credits + drill.purseOf; run.siege = opts.siege (the UI then passes no story, nexus or drill, and seed = sortie.weekSeed(week)); run.nemesis = nemesis.pickNemesis(story) (no story, no nemesis: bots); run.nexus = a copy of `nexus` with nexusStart's credits, base and cover; power = Σ points of trainable units; recipes; cover; credits.start; drawDraft; phase 'build'.
- `startProblem(run): string | null` — build phase, draft step 'done', no card offer pending, no Victory pending.
- `victoryProblem(run)`, `continueEndless(run)` (victory 'endless'), `bankVictory(run)` (victory 'banked', endRun).
- `startWave(run): void` — wave++, phase 'wave', t 0, leaked 0, queue = finale.finalePlan(run, lords.lordPlan(run, nemesis.nemesisPlan(run, waves.planWave(...)))); gun clocks reset.
- `step(run, dt): void` — see the order above.
- `craftProblem(run, unitId, uses: number[], onId: number): string | null` — build phase, not crafted, `uses` satisfy the recipe (recipeUses-style check), onId ∈ uses; if any of `uses` is a draft piece the draft must be at step 'keep' (the craft is then this draft's keep).
- `craft(run, unit: Unit, uses: number[], onId: number): void` — Shard onId becomes recipes.unitTower (same id/cell); other uses → rubble; draft pieces used → shards.crumbleDraft(run, []) after; push unitId to crafted.
- `runXp(run): Record<string, number>` — xp by unitId (> 0 only).
- `takeXp(run): Record<string, number>` — xp − banked, marks banked. The UI banks it (bankOffTableXp) as it lands.
- `mvp(run): UnitTower | undefined` — most kills, then dealt.
- `endRun(run, why): void`, `quitRun(run): void` — endRun is a no-op once 'over' (also clears any card offer).
- `score(run): number` — waves cleared (trainingBest, trainingFeats).

### testForces.ts (test-only; not in index.ts)
- `bookUnits(file)`, `FORCES` (two ~750 pt sample forces a book), `SEEDS` — shared by training.test.ts and veteranBalance.test.ts.

### testRun.ts (test-only; not in index.ts)
- `blankRun(seed = 1): TrainingRun` — an empty build-phase run (no recipes, cover or draft; mods bounty 1, holdMul 1) for module tests.
- `testUnit(o)`, `testEnemy(o)` — a UnitTower at 20,30 (12-cell rifle) and a 100 hp drone at 21.5,31.5.

### bot.ts (not in index.ts: the tests, and the app's Auto (debug) button via components/training/useAuto, import it directly)
- `interface MazeSpot { n; x; y }`
- `botBuild(run, units: Unit[], maze: MazeSpot[], cursor: number): number` — place hand at next legal spots, keep (recipe progress, then grade), craft when ready (unit on the used Shard nearest the route), then ready default towers none of whose Shards an uncrafted unit could still use, spend (levels cheapest first, then luck, mend when low), pick card 0 (`BOT_CARD`).
- `botMoves(run, units, maze, cursor): Generator<string, number>` — botBuild a move at a time (each yield one move, a few words saying it; returns the cursor); botBuild runs it straight through, so headless results are the same.
- `playRun(units: Unit[], seed: number, opts?: { maze?; maxWaves?; dt?; nexus?; drill?; siege? }): TrainingRun`

### nexusTest.ts (test-only; not in index.ts)
- `guardian(name, tier, rules?)`, `campaign(threat, guardians?, o?)` — a round-2 campaign for the Nexus tests.

### index.ts
Re-exports types, map, board, rng, recipes, shards, economy, combat, waves, cards, save, veterans, relics, habits, tally, run, nemesis, quirks, bestiary, trinkets, shared, nexus, lordPick, lords, affixes, titles, records, tales, drill, drillBank, siege, siegeBoard, dps, clock, emplacements, waveKinds, flightLane (keeps `squadPower`, `canTrain` for sortie.ts / ForceView).

### probe.ts (test-only)
- `probeRun(units, seed, {maxWaves?, nexus?}): Probe` — a bot run with bot.playRun's `watch` hook: cleared, fell, fellFlying, leaks by wave, each boss's death pad (LEGS if through). Also `flies(w)`, `mean`, `median`. Used by balance.test.ts; never imported by the app.
