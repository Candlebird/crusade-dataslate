# Overnight log: Warpath (2026-11-04)

Built to the spec (https://claude.ai/artifact/AQpvNeX41vJQAuvqxNF5uC) and the design answers. Everything is pushed to `main`. Warpath is **GM-only** for now (it also opens in local dev).

| Commit | What |
|---|---|
| a97d332 | Step 1: Training's volley clock and OPR shot maths move to `rules/shots.ts`. Training plays exactly as before. |
| 85c0778 | Step 2: the sim core (hero, squads, swarm, bosses, levels, cards, doctrines, forts). Not on screen yet. |
| 2d9ce4f | Step 3: on screen. Start screen, canvas play, cards, pause, summary, local and cloud save, XP and feats. |
| a739e78 | 5 balance passes over the 6 live forces and 12 visual passes. |

Checks: `tsc` is clean and `npx vitest run` passes (1046 tests).

## Decisions I made where the spec was silent

**Rendering and save**
- Sprites are drawn with Canvas2D, not WebGL2. It holds 60 fps at 1,400 enemies on this PC, and one sim step takes about 0.75 ms.
- Enemies are plain JSON with a shared spatial grid, so a run saves and resumes as it is.
- The cloud copy lives at `shared/warpathrun-<force>`. A run grown too big to sync stays on the device, with a toast.

**Terrain and firing**
- Blocking terrain only stops movement. Cover gives −1 to ranged hits.
- Guns fire from the squad's anchor. Big guns pick the toughest enemy in reach.

**Abilities**
- Heal and Shield from called-in units land on the hero.
- A rule I haven't mapped gives +4% fire rate.
- Forts count at their real points, with no surcharge.

**Damage**
- Each wound is 3 HP. The hero has 40 + 5×Tough HP.
- Bosses hit ×2 (lords ×3) on a ×1.5 clock.

**Feats**
- Kill feats count lifetime kills per mode.
- Full Muster means at least 1,450 pts on the field.
- One True Weapon means the hero plus at most one unit.
- Feat rewards are small Umbra Shard grants.

**Access and records**
- The weekly board is worked out from each force's Warpath record, with no write to the campaign.
- **GM Auto** lets the bot play. It banks nothing and never syncs.

## Balance (5 passes, all 6 live forces)

The bot plays every force against Void Echoes and Alien Armada, on 2 Normal seeds and 1 Hard seed per theme, up to 32 minutes. Target: the 15-minute Echo Lord falls about half the time on Normal.

| Pass | Change | Normal: median fall | Lord kill (Normal) |
|---|---|---|---|
| 1 | Baseline from step 3 | Every run reached 32 min, the bot never hurt | every run |
| 2 | More spawns. A lone Hero or Caster (e.g. "The High King") only comes as a boss, after one-shotting a fresh hero at 7 s. Tiers weighted per tier, top tier after minute 5. Deadly on the hero capped at 2. | ~14 min, from full HP to dead in a few seconds | 7/24 |
| 3 | 0.3 s grace after a hit (was 0.12) | ~14 min | 8/24 |
| 4 | Spawns grow 0.95/min (was 1.2) | ~18 min | 13/24 |
| 5 | No single blow takes more than 35% of the hero's HP. A 5-min captain did 62 damage to a 55 HP hero in one swing. New seeds. | ~17 min (12 to 32+) | **12/24** |

Pass 5, lord kills on Normal per force:

| Force | Lord kills |
|---|---|
| Cobalt Knights | 4/4 (three ran the full 32 min) |
| Dragos | 2/4 |
| Spears | 2/4 |
| Hive fleet | 2/4 |
| Beasts | 1/4 |
| Warhost | 1/4 |

Hard ends at 9–12 min for most runs (up to 22) and kills a lord 1 in 6.

**Caveat:** this is a bot, and it kites well but never dodges blast markers. A person may do better or worse.

## Visual passes (12, PC and phone 420×860)

1. **Start screen:** the hero list showed blank names. It now shows unit names.
2. **Early play:** a dark square showed behind the hero, because the glow blur was scaled wrongly. Fixed. The page also scrolled under the run; it no longer does.
3. **Level-up cards (PC):** fine.
4. **Pause menu:** Auto looked like a link. It now looks like a button.
5. **Auto play:** fine.
6. **5-minute captain:** bosses off screen now get a pulsing edge pointer with their skull. Squad strength bars sat inside the models; they now sit above them.
7. **Summary (PC):** the damage meter's numbers were out of line. Fixed.
8. **Phone, 15-minute lord:** the hero flashed salmon when hit, the same colour as the enemies, and vanished into the swarm. It now flashes white.
9. **Phone summary:** names wrapped onto two lines unevenly. Each row now has the name, with level and kills on a second line. The sections are spaced out, and the points line reads "x / 1,500 pts on the field".
10. **Phone level-up cards:** the three cards needed a scrollbar, because Training's phone rule made each one 160 px tall. They are now compact and fit.
11. **Phone HUD in play:** fine. The thumbstick and pause button are clear of the bars.
12. **Phone summary with no boss:** the "No XP" note reads fine.

## Questions for you

1. **Hard mode** is quite a bit harder than Normal: runs mostly end at 9–12 min, and a lord dies 1 time in 6. Is that what you want, or should Hard aim for the lord about a third of the time?
2. **The local test force** (Headhunter Spears, 1,385 pts with no veterans) falls at 3–10 min. Fresh, small forces will find Warpath hard until they call in more units. Is that fine?
3. **Opening Warpath to players** is a one-line change in `DowntimePanel.tsx` once you've played it.

## Follow-up (2026-11-05)

- Damage numbers are bigger, with a dark outline.
- A captain comes every 3 minutes (was 5). The Echo Lord still comes at 15.
- Early levels are slower: XP need is 10 + 1.5n + 0.55n² (was 4 + 2.2n + 0.55n²). From level 10 on, it's about the same as before.
- Call-in cards come only on every third level-up (the 3rd, 6th, 9th…). On those level-ups, at least one unit is always offered if one fits.
- Your units, forts and hero are drawn with the emblems you made. Units without one keep the stock icon.
- Re-probed all 6 forces. Lord HP went down from 420 to 350. On Normal, the lord falls 11 of 24 times and runs fall at about 16 min (median). Hive fleet hasn't killed a lord yet.

## Follow-up 2 (2026-11-05)

- 10% more enemies: spawns are 2.75/s (was 2.5).
- Bosses have 25% more HP: captains 175 (was 140), lords 440 (was 350).
- **Elites**, as in Training: from minute 1, 3% of spawns, rising 1.2% a minute to 17%. Elites have ×3 HP, deal ×1.5 damage, are ×1.35 size and drop ×5 XP. They have a gold rim and a gold HP bar.
- **Hordes**: the first comes at 1:15, then one every 50–95 s. A banner gives 3 s of warning. Then either a two-deep ring closes in from every side, or a column charges from one direction. Each horde is one kind, about 9 s of spawns in one go, at least 24.
- **Sites**: one turns up every 35 s (the first at 0:20), 34–60" away, with up to 3 at once. Edge pointers show the off-screen ones.
  - **Shrine:** stand in it for 4 s for Battle Hymn, +40% fire rate for 40 s.
  - **Supply cache:** a free level-up, but 8 elites spring an ambush.
  - **Aid station:** heals 60%.
  - **Champion:** the book's toughest kind, as an elite with ×6 HP. It holds its ground until the hero comes close, and drops 60 XP.
  - Sites you leave 110" behind are gone.
- Probe after these changes, Normal: the median run falls at about 12.5 min (was 16), and the lord falls 3 of 24 times (was 11). Hard ends at 6–13 min. I left it here because you asked for harder. The bot rarely uses sites well, so a person should do better.

## Follow-up 3 (2026-11-05)

- Free rations are gone. They used to turn up every 45 s and heal 25%. Healing now comes only from cards, Field Medics, aid stations and units with Heal.
- The Heal rule gives half as much: 3 HP per wound (was 6).
- Sites take longer:
  - **Shrine:** hold for 8 s (was 4).
  - **Aid station:** hold for 3 s (was instant).
  - **Supply cache:** hold for 5 s. The ambush springs as soon as you step on it: 8 of the book's toughest kind, as elites with ×2.5 HP on top.
  - Progress drains at half speed while you're off a site.
- Enemy HP grows 11% a minute (was 7%). Bosses grow with it.
- The thumbstick stays where you first press. It no longer slides after your thumb.
- Probe, Normal: runs end at about 11.8 min on average, and the lord falls 3 of 24 times. A few Hard runs end at 2–5 min.
- Later fix: the cache ambush now grows with the run. It's 8 elites from the current mix, with +10% HP a minute (up to ×2.5 at 15 min). The book's toughest kind only joins from minute 10, when the top tier is in.

## Meta-progression: Armoury and prestige (2026-11-05)

Each force has its own progression, and it only affects Warpath. It sits on the Warpath start screen.
- **Renown:** every run earns it, except Auto runs. A run pays 8 a minute, 1 per 100 kills, 15 a captain and 60 a lord, ×1.5 on Hard.
- **Armoury:** Renown buys upgrade levels, and each level costs more than the last (×1.35–2.5 per level).
  - **Open from the start:** Vigour (hero HP +4%/lv), Drill Sergeants (rate +3%), Honed Edge (damage +3%), Forced March (speed +2%), Shard Lore (XP +4%), Lodestone (pickup reach +8%).
  - **Prestige 1:** Warded Plate (−2% damage taken/lv), Reserves (+1 reroll), Forward Orders (a free level-up at the start).
  - **Prestige 3:** Veteran Cadre (called-in units start 1–2 levels up), War College (+1 doctrine slot).
- **Prestige:** you need 2,000 Renown earned in the cycle. Prestige wipes the Armoury and the Renown in hand for ⌊√(cycle/500)⌋ Laurels. Each Laurel gives +10% Renown for good.
- **Pacing:** a typical 12-minute Normal run earns about 200 Renown. The first prestige is about 10 runs in. Maxing all six starting upgrades takes about 6,500 Renown.
- **Snapshot:** a run takes a copy of the Armoury when it starts, so a resumed run plays the same.

## War Council skill tree (2026-11-05)

The Armoury is now a real skill tree. There are 4 branches with 5 tiers each, and its effects change how a run plays, not just how big the numbers are.
- **Branches:**
  - **Fire:** Honed Edge and Drill.
    - Choice: Hail of Fire (+25% rate, −15% damage) or Big Guns (+1 AP).
    - Keystones: Overcharge (every 6th shot ×3) or Wrath (a blast every 15 s).
    - Capstone: Executioner (non-bosses under 20% HP die).
  - **Guard:** Vigour and Warded Plate.
    - Choice: Thorns or Bastion (a shield every 20 s).
    - Keystone: Second Wind (once a run, back up at 40% HP).
    - Capstone choice: Last Stand (+40% rate under 35% HP) or Unbreakable (no blow over 15% of max HP).
  - **Command:** Shard Lore and Lodestone.
    - Choice: Reserves or Forward Orders.
    - Keystone: Muster (call-ins every 2nd level-up).
    - Capstone choice: Veterans or War College (+1 doctrine slot, new doctrines at level 2).
  - **Scout:** Forced March and Pathfinder (faster holds).
    - Choice: Plunder (a cache gives 2 level-ups) or Pilgrim (a longer, stronger shrine).
    - Keystone: Cartographer (more sites).
    - Capstone choice: Scout's Warning (hordes are smaller and warned 6 s ahead) or Champion Hunter.
- **Gating:** each tier needs a rank in the tier above. Keystones need prestige 1, capstones prestige 2.
- **Choices:** taking one side of a choice shuts the other until a reset. A reset gives back 80% of the Renown spent.
- **Old saves:** old Armoury levels come back as Renown.
- **Numbers:** every effect number is in `TREE_FX` in meta.ts.
- **Probe, Normal** (6 live forces, lord falls / time):

| Build | Run ends at | Lords killed |
|---|---|---|
| No tree | about 11 min | 0 |
| Mid build (about 1,200 Renown) | 12–16 min (median 13) | 3 |
| Full prestige-2 build | 17–32 min (median 22) | 12 |

  In the full build, one Cobalt Knights run reached the 30-min cap.

## Squads as targets, cover, wander, swipe, and the 30-minute wall (2026-11-05)

- **Squads are bodies, not shields.** They no longer soak the hero's wounds.
  - Enemies pick the nearest body (hero or a ground squad, by edge distance, within `losses.aggro`). They walk to it, shoot at it and strike it.
  - Shots and blasts stop in whichever body they hit first. A squad rolls its own Defense (Deadly capped at its Tough), and wounds take models off.
  - A wiped squad regroups after `losses.regen` s. Forts still take damage as HP.
  - Hold the Line now reads "squads shrug off 10% of wounds."
- **Cover:**
  - Any body standing in a cover feature gets +1 Defense (`follow.coverDef`) against everything, melee included. This applies to the hero too.
  - Foot squads (infantry and lone heroes) look for cover within 12" of the hero, at most 2 squads to a feature. They leave it once the hero is 18" away.
  - A dashed green ring marks a squad in cover.
- **Wander:** each squad drifts to a new spot near its own slot every 2–5 s (±0.8 rad, ×0.6–1.5 radius), instead of holding a fixed point.
- **Melee:** the Training-style yellow half-circle swipe now lands at the target, facing the striker, with three sparks.
- **Honours:** each prestige adds +11% damage and +11% hero HP to every run, up to prestige 10.
- **Trims:**
  - Edge/Drill .04, Hail +20%, Overcharge ×2, Wrath 16 hits every 20 s, Executioner 15%.
  - Vigour .05, Warded .03, Bastion 12%, Second Wind 25%, Last Stand +30%, Unbreakable 25%.
  - Enemy HP growth is 12.5%/min.
- **Probe** (bot, 6 live forces, fell at, Normal):

| Build | Mean | Range | Reached 30 min |
|---|---|---|---|
| No meta | about 11 min | 6–20 | none |
| Full tree, prestige 2 | 20.2 | 12–24 | none |
| Full tree, prestige 10 | 24.8 | 17 to 30+ | 1 of 12; most others fell at 27–29 |

## 2026-11-05: doubled wounds, zoom, staggered hordes, field cap

- **Upgrades double wounds:** each level-up of a squad doubles each model's wounds (`levels.woundsMul` 2, via `woundsPer` in mods.ts). Forts get ×2 HP. The user found that 1-wound units were always dead.
- **Zoom:** on desktop (a fine pointer), the view zooms out to 90 px/in (was 72). Touch still stops at 72.
- **Hordes land in batches:** at most 40 bodies a step (`horde.batch`, using `run.landing`). The biggest horde is now 150, down from 250. This avoids the lag spike when a horde lands.
- **Field cap:** at most 900 enemies at once (was 1400), spawned on a ring 48 out. Bodies owed past the cap fold into elites (`run.surplus`), so a full field still gets harder.
- **Blank icons:** the likely cause was the browser dropping the offscreen canvases that hold the sprites under memory pressure, which leaves every cached sprite blank. The caches now reset on contextlost/contextrestored, and a check every 100 ms finds lost canvases.
- **Retune:**
  - Enemy HP grows 16% a minute and damage 5.5%.
  - From 18 minutes on, a further +12% HP and +8% damage a minute.
- **Probe** (bot, Normal, 6 forces × 2 seeds):

| Build | Mean | Range | Reached 30 min |
|---|---|---|---|
| No meta | about 12 min | 8–17 | none |
| Full tree, prestige 2 | — | 18–28 | 1 of 12 |
| Full tree, prestige 10 | — | 22 to 30+ | 3 of 12 |

- **Faster probes:**
  - Each run is its own job, 16 at a time (`xargs -P 16`).
  - Normal only, unless `WARPATH_MODES=all`.
  - `WARPATH_TUNE` and `WARPATH_META` env overrides.
  - A prestige 2 + prestige 10 pair takes about 4.5 min.

## 2026-11-05: one hit can't kill a model it shouldn't

- **Bug (the user found it in play):** 1-wound models still died to 1-damage attacks at levels 2–4.
  - The cause: enemy damage growth and elite blows multiplied the wounds of each hit on a squad. A ×2.5 hit killed a 2-wound model outright.
  - The fix: against squads, the multiplier now means more attacks (`strikeSquad`). Each hit does its weapon's wounds (1, or Deadly).
  - A test fires 300 boosted 1-damage hits at a 2-wound unit and checks it never loses a model.
- **Retune** (squads now last longer):
  - Enemies get ×1.25 attacks against squads (`losses.squadDmg`).
  - The late ramp starts at 16 min (was 18), at +14% HP and +12% damage a minute.
- **Probe** (bot, Normal, 12 runs):

| Build | Fell at | Reached 30 min |
|---|---|---|
| No meta | 6–18 min, mean about 11.5 (with ×1.25 squad hits and the old late ramp) | — |
| Full tree, prestige 2 | 15–28 min | 1 of 12 |
| Full tree, prestige 10 | 23–28 min | 4 of 12 |
