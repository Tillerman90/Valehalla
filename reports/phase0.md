# Valehalla balance simulation: phase 0

1000 seeded worlds per bot, 28 days each, one founding city and no armies or rivals yet. Seeds currently change only the city's site traits, so worlds differ little. Ran in 80.9 seconds.

## Checks

| Check | Target | Result | |
| --- | --- | --- | --- |
| Longest single build | At most 8 hours | 8.00 hours | PASS |
| Dead ends (no progress possible) | Zero | 0 | PASS |
| Twice-a-day bot still progresses | At least 70% of the balanced bot's building levels at day 7 | 98.6% | PASS |
| Most overflowing resource, balanced bot | No resource loses more than 20% to a full Storehouse | 19.3% | PASS |
| 12-hour freeze, once-a-day bot | World frozen 49.7% of the time | 49.7% | PASS |

## Observations

| Measure | Result | Note |
| --- | --- | --- |
| Court built, balanced bot | Day 2.4 | Design target is a first conquest on day 5 to 8. Judged once armies and Claimants exist. |
| Founding city fully built, balanced bot | Day 10.4 | Will take longer once armies compete for the same Timber and Metal. |
| Check-ins where a build had finished, balanced bot | 88.7% | Design target is over 95% of sessions finishing a goal. Deeds will add goals beyond builds. |
| Building by hand compared with a city plan | 75.7% of the levels at day 7 | Same check-ins, no plan. This gap is what city plans are for. |
| Production lost to a full Storehouse, balanced bot | 15.5% | The bots never trade at the Market, so a player who does will lose less. |

## By bot

Days are shown as median (10th to 90th percentile).

| | balanced | twice-a-day | once-a-day | by-hand |
| --- | --- | --- | --- | --- |
| How it plays | Six check-ins a day (7am to 10pm), Economy plan | Opens the app at 8am and 8pm only, Economy plan | Opens the app at 8pm only, Economy plan. The world is frozen half of every day | Six check-ins a day, no plan: every order placed by hand |
| Minutes until the first build finishes | 1.6 (1.6 to 1.6) | 1.6 (1.6 to 1.6) | 1.6 (1.6 to 1.6) | 1.6 (1.6 to 1.6) |
| Day Keep reaches 5 | 0.5 (0.5 to 0.5) | 0.8 (0.8 to 0.8) | 0.8 (0.8 to 0.8) | 1.8 (1.8 to 1.8) |
| Day Keep reaches 10 | 2.3 (1.9 to 2.3) | 2.3 (2.3 to 2.3) | 4.8 (3.8 to 4.8) | 4.7 (4.7 to 4.7) |
| Day Court is built | 2.4 (2.3 to 2.4) | 3.3 (2.3 to 3.3) | 4.8 (4.8 to 5.8) | 4.8 (4.8 to 4.8) |
| Day city is fully built | 10.4 (10.3 to 10.4) | 10.8 (10.3 to 10.8) | 20.8 (20.8 to 21.8) | 13.8 (13.7 to 13.8) |
| Building levels at day 1 (of 195) | 46 | 46 | 35 | 20 |
| Building levels at day 3 (of 195) | 103 | 97 | 67 | 52 |
| Building levels at day 7 (of 195) | 172 | 169 | 116 | 130 |
| Building levels at day 14 (of 195) | 195 | 195 | 174 | 195 |
| Building levels at day 21 (of 195) | 195 | 195 | 195 | 195 |
| Building levels at day 28 (of 195) | 195 | 195 | 195 | 195 |
| Check-ins where a build had finished | 88.7% | 100.0% | 100.0% | 92.3% |
| Timber lost to a full Storehouse | 12.5% | 15.0% | 14.3% | 21.7% |
| Stone lost to a full Storehouse | 14.4% | 16.9% | 16.2% | 23.2% |
| Metal lost to a full Storehouse | 19.3% | 21.8% | 20.9% | 27.3% |
| Share of time the world was frozen | 0.0% | 0.0% | 49.7% | 0.0% |
| Dead ends | 0 | 0 | 0 | 0 |
