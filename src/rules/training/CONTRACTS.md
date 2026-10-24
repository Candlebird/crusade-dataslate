# Training (Gem TD) module contracts

Shared shapes are in `types.ts`; homebrew numbers in `TRAINING` / `SHARD_TYPES` / `TRAINING_ENEMIES` (src/rules/downtimeData.ts).
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
| UnitTower.up / cap / tough growth | economy.ts (buyLevel, applyLevel) |
| Tower combat fields (guns clocks, boost, dmgBoost, frenzy, holding, holdLeft, kills, dealt, skills cd) | combat.ts |
| UnitTower.xp | run.ts (XP at wave end) |
| credits, luck, mends | economy.ts |
| baseHp | waves.ts (leaks), economy.ts (mends), cards.ts (base cards) |
| leaked, queue, enemies (add, move, leg, jumped, face) | waves.ts |
| enemies (hp, status, dots, heldBy, regrab; removal of the dead) | combat.ts |
| cover | run.ts at create (via waves.layCover), cards.ts (cover card) |
| offer, cards, mods | cards.ts |
| fx | combat.ts pushes; run.step decays |

## run.step(dt) call order

```
run.fx = run.fx.filter(f => (f.t -= dt) > 0)
if (run.phase !== 'wave') return
run.t += dt
waves.spawnDue(run)
combat.auras(run, dt)          // boosts from auras; dmgBoost wears down
combat.abilities(run, dt)      // timed skills, fields, bleed fields, Vigor bleed
combat.holds(run, dt)          // grab / release (before walking, so held enemies stand still)
combat.fireAll(run, dt)        // volleys; hurt() pays kills, death-blasts, boss → cards.offerCards
combat.tickEnemies(run, dt)    // statuses, dots, regrab cooldowns
waves.walk(run, dt)            // move, ambush jump, leaks → baseHp, leaked
combat.reap(run)               // drop the dead (and leaked ones waves already removed)
if (run.baseHp <= 0) endRun(run, 'The base falls.')
else if (!run.queue.length && !run.enemies.length) → wave cleared (run.ts, private):
    run.cleared++, run.credits += economy.waveCredits(run), XP to crafted units, phase 'build',
    shards.drawDraft(run), log line. (The UI saves the run whenever it sees a new build phase.)
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
- `rollGrade(run): Grade` — by TRAINING.shards.odds[run.luck].
- `drawDraft(run): void` — run.draft = { step: 'place', hand: draw× DrawnShard, placed: [] }.
- `shardPiece(id, at: Tile, type: ShardType, grade: Grade, draft: boolean): ShardPiece` — guns/Quality from SHARD_TYPES × value.
- `placeDraftProblem(run, i, x, y): string | null` — build phase, step 'place', hand[i] exists, board.placeProblem.
- `placeDraft(run, i, x, y): void` — adds a draft ShardPiece (id run.nextId++); empty hand → step 'keep'.
- `keepOptions(run): KeepOption[]` — each draft piece plain; 2 alike (type+grade) → +1, 4 alike → +2, cap 5.
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
- `luckCost(run): number | null`, `luckProblem(run): string | null`, `buyLuck(run): void`
- `mendCost(run): number`, `mendProblem(run): string | null`, `buyMend(run): void` — +mend.hp, cap baseHp; run.mends++.
- `killCredits(e: Enemy): number` — max(1, round(cost × perCost)).
- `payKill(run, e: Enemy): void` — run.credits += killCredits × run.mods.bounty.
- `waveCredits(run): number` — wave + perWave × run.wave, + noLeak if run.leaked === 0.

### combat.ts
- `type Harm = 'shot' | 'melee' | 'other'`
- `reach(t: Tower, g: TowerGun): number` — cells (inches = cells), + levels × levels.range, + boost.range; melee meleeReach.
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

### waves.ts
- `isFlyWave(w)`, `isBossWave(w)`, `isFlyBossWave(w): boolean`
- `planWave(run, w: number): SpawnPlan[]` — budget base × (power/perPoints) × growth^(w-1); flyers; boss + escorts; scouts at pad scoutAt (scoutHp); ambush hp; hp ×hpGrowth past hpFrom; staggered by gap; sorted by `at`.
- `previewWave(run): SpawnPlan[]` — planWave(run.wave + 1) on a copy of the dice.
- `layCover(r: Rng, n: number, route: Tile[]): Tile[]` — n patches, onRoute share centred on route cells, clear of pads/base/spawn.
- `spawnDue(run): void` — queue entries with at ≤ run.t → enemies (id run.nextId++).
- `speedOf(run, e: Enemy): number` — cells/s: def.speed × walkMul × slow/daze.
- `leakCost(e: Enemy): number` — def.leak, or leak.vet for a veteran if more.
- `walk(run, dt): void` — skip held (heldBy) / stunned; walkers by flow field, flyers pad to pad; ambush jump on reaching pad ambushFrom → pad ambushAt; reaching base: remove, baseHp −= leakCost, leaked++.
- Also (waves agent): `waveTags(w): string[]` ('Flying'/'Boss' for the HUD), `waveBudget(power, w)`, `lateHp(w)`,
  `planFor(r: Rng, power, w)` (planWave on any dice), `previewGroups(plans): PreviewGroup[]` ({kind, n, vets, hp, flies}
  for WavePreview), `runCover(r): Tile[]` (createRun's cover: patches range on the empty map's route), `layCover` takes an
  optional 4th `taken: Tile[]` to keep clear of, `atBase(e)`, `move(m, e, step)`. New TRAINING keys: `dazeMul`, `wave.bossMin`.

### cards.ts
- `interface TrainingCard { id; name; rarity; text; unit?(t); apply(run, t?) }`, `CARDS: TrainingCard[]`
- `drawCards(run): CardDraw[]`, `cardById(id)`
- `offerCards(run): void` — sets run.offer unless one is on offer.
- `cardText(run, d: CardDraw): { name; text }`
- `pickCard(run, i: number): void` — apply, push to run.cards, clear offer, log.
- `autoCardIndex(run): number`

### save.ts
- `saveKey(forceId): string` (done) — `trainingRun:<forceId>`.
- `serialize(run): string`, `deserialize(s: string): TrainingRun | null` — JSON; null on bad/old version. fx may be dropped.
- `saveRun(run): void`, `loadRun(forceId): SavedRun | null` (null for a run already 'over'), `clearSave(forceId): void` — localStorage wrapped in try/catch.

### run.ts
- `createRun(forceId: string, units: Unit[], seed: number): TrainingRun` — power = Σ points of trainable units; recipes; cover; credits.start; drawDraft; phase 'build'.
- `startProblem(run): string | null` — build phase, draft step 'done', no card offer pending.
- `startWave(run): void` — wave++, phase 'wave', t 0, leaked 0, queue = waves.planWave; gun clocks reset.
- `step(run, dt): void` — see the order above.
- `craftProblem(run, unitId, uses: number[], onId: number): string | null` — build phase, not crafted, `uses` satisfy the recipe (recipeUses-style check), onId ∈ uses; if any of `uses` is a draft piece the draft must be at step 'keep' (the craft is then this draft's keep).
- `craft(run, unit: Unit, uses: number[], onId: number): void` — Shard onId becomes recipes.unitTower (same id/cell); other uses → rubble; draft pieces used → shards.crumbleDraft(run, []) after; push unitId to crafted.
- `runXp(run): Record<string, number>` — xp by unitId (> 0 only).
- `takeXp(run): Record<string, number>` — xp − banked, marks banked. The UI banks it (bankOffTableXp) as it lands.
- `mvp(run): UnitTower | undefined` — most kills, then dealt.
- `endRun(run, why): void`, `quitRun(run): void` — endRun is a no-op once 'over' (also clears any card offer).
- `score(run): number` — waves cleared (trainingBest, trainingFeats).

### testRun.ts (test-only; not in index.ts)
- `blankRun(seed = 1): TrainingRun` — an empty build-phase run (no recipes, cover or draft; mods bounty 1, holdMul 1) for module tests.

### bot.ts (test-only; not in index.ts)
- `interface MazeSpot { n; x; y }`
- `botBuild(run, units: Unit[], maze: MazeSpot[], cursor: number): number` — place hand at next legal spots, keep (recipe progress, then grade), craft when ready (unit on the used Shard nearest the route), spend (levels cheapest first, then luck, mend when low), pick card 0.
- `playRun(units: Unit[], seed: number, opts?: { maze?; maxWaves?; dt? }): TrainingRun`

### index.ts
Re-exports types, map, board, rng, recipes, shards, economy, combat, waves, cards, save, run (keeps `squadPower`, `canTrain` for sortie.ts / ForceView).
