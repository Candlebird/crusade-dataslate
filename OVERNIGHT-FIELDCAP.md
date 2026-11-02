# Overnight log: field cap and musters (2026-11-01)

Branch `field-cap`, 6 local commits on top of `main`. **Nothing is pushed.**

| Commit | What |
|---|---|
| 4082b30 | Field cap core: per-detachment cap (1500 + 100 a round, max 4000), grandfathering, faction bank, grants, founding, unit transfers, band ratings, raids (cut, regrow, scouting, shards), underdog XP, Lean move. |
| 657ee60 | Musters (on by default, "Fight apart" to opt out; all move in on a win), raid marks, allied or 3-way set pieces, bigger zone boards (5×8 past the cap, 6×10 past 2×), game night seats musters first, Echo and Marauder fights sized to the band. |
| f15a920 | In the app: force header "Supply x / cap y · Lean", bank Give/Found, unit Send, Reorganise cap warning, shop note, GM field cap setting, Rules section, Guide step 5, Digest notes. Supply that tidy banks or claims now stamps the force and campaign so it syncs. |
| 8f649fe | Pass 1 (raids): the cut scales with the raiders' size (10% at the cap); a sector takes one raid's cut a round; a Marauder band loots at the size it fought at. |
| e94650a | Pass 2 (balance): raid Umbra Shards scale with the raiders' size too, so many small detachments can't farm raids. |
| f444691 | Pass 3 (UX): a grandfathered detachment reads as held from page load, not only after its first change. |

Checks: `tsc` clean, `npm test` 1036/1036 passing. `npm run test:balance` is 16/17: the one failure, "a 60,000 force mostly beats Hard and mostly falls to Insane", also fails on a20181a, from before this work, so it isn't from these changes.

The live campaign re-rates sectors at the next round end, as agreed.

## Simulation (5 seeds, 3 factions)

| Round, cap | Detachment Supply | Overrun | Table | Raid offered |
|---|---|---|---|---|
| r5, 2000 | 2000 | 50% | 40% | 10% |
| r25, 4000 | 3600 | 42% | 37% | 21% |
| r5 | 1000 | 6% | 24% | 70% |
| r5 | 500 | — | — | 100% (underdog XP near max) |

Sector ratings run from about 800 to 2300 (p10 to p90) at r5 and from 1600 to 4500 at r25.

## Questions for you

1. **Grandfathered overrun.** Your 3600 detachment at r5 can overrun about 96% of sectors. To curb that, overrun power could be capped at the field cap. But then lopsided fights would go to the table, against the table-time budget. I left it as is.
2. **Bank double-spend.** If two players grant from the bank at the same moment, the last write wins and the bank can go out twice. This is rare with 3–4 players. A fix needs a cloud transaction.
3. **Transfers** only go between your own detachments, not to another player's. Is that what you want?
4. A deleted raid takes back its cut, but not the scouting it gave.

The orders panel needs a cloud sign-in, so I couldn't click through it locally. Its text is covered by the typecheck and tests.
