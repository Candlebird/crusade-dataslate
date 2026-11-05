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
