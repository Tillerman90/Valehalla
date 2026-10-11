# Valehalla balance simulation: phase 0

1000 seeded worlds per bot, 28 days each, one founding city and no armies or rivals yet. Seeds currently change only the city's site traits, so worlds differ little. Ran in 79.2 seconds.

## Checks

| Check | Target | Result | |
| --- | --- | --- | --- |
| Longest single build | At most 8 hours | 8.00 hours | PASS |
| Dead ends (no progress possible) | Zero | 0 | PASS |
| Twice-a-day bot still progresses | At least 70% of the balanced bot's building levels at day 7 | 98.7% | PASS |
| 12-hour freeze, once-a-day bot | World frozen 49.7% of the time | 49.7% | PASS |

## Observations

| Measure | Result | Note |
| --- | --- | --- |
| Court built, balanced bot | Day 1.9 | Design target is a first conquest on day 5 to 8. Judged once armies and Claimants exist. |
| Founding city fully built, balanced bot | Day 9.8 | Will take longer once armies compete for the same Timber and Metal. |
| Check-ins where a build had finished, balanced bot | 87.3% | Design target is over 95% of sessions finishing a goal. Deeds will add goals beyond builds. |
| Building by hand compared with a city plan | 74.6% of the levels at day 7 | Same check-ins, no plan. This gap is what city plans are for. |
| Production lost to a full Storehouse, balanced bot | 33.2% | Food and Wealth overflow because nothing spends them until armies and Claimants arrive. |

## By bot

Days are shown as median (10th to 90th percentile).

| | balanced | twice-a-day | once-a-day | by-hand |
| --- | --- | --- | --- | --- |
| How it plays | Six check-ins a day (7am to 10pm), Economy plan | Opens the app at 8am and 8pm only, Economy plan | Opens the app at 8pm only, Economy plan. The world is frozen half of every day | Six check-ins a day, no plan: every order placed by hand |
| Minutes until the first build finishes | 1.6 (1.6 to 1.6) | 1.6 (1.6 to 1.6) | 1.6 (1.6 to 1.6) | 1.6 (1.6 to 1.6) |
| Day Keep reaches 5 | 0.4 (0.4 to 0.4) | 0.8 (0.3 to 0.8) | 0.8 (0.8 to 0.8) | 1.7 (1.7 to 1.7) |
| Day Keep reaches 10 | 1.8 (1.5 to 1.8) | 1.8 (1.8 to 1.8) | 3.8 (2.8 to 3.8) | 4.3 (4.3 to 4.3) |
| Day Court is built | 1.9 (1.8 to 1.9) | 2.8 (1.8 to 2.8) | 4.8 (4.8 to 4.8) | 4.4 (4.4 to 4.4) |
| Day city is fully built | 9.8 (8.9 to 9.8) | 10.3 (9.3 to 10.3) | 19.8 (18.8 to 19.8) | 13.3 (12.7 to 13.3) |
| Building levels at day 1 (of 180) | 46 | 46 | 35 | 19 |
| Building levels at day 3 (of 180) | 100 | 97 | 67 | 52 |
| Building levels at day 7 (of 180) | 166 | 164 | 111 | 124 |
| Building levels at day 14 (of 180) | 180 | 180 | 166 | 180 |
| Building levels at day 21 (of 180) | 180 | 180 | 180 | 180 |
| Building levels at day 28 (of 180) | 180 | 180 | 180 | 180 |
| Check-ins where a build had finished | 87.3% | 96.5% | 100.0% | 89.5% |
| Timber lost to a full Storehouse | 7.6% | 12.1% | 10.9% | 22.3% |
| Metal lost to a full Storehouse | 17.7% | 21.8% | 20.6% | 30.3% |
| Food lost to a full Storehouse | 55.2% | 57.4% | 56.8% | 62.2% |
| Wealth lost to a full Storehouse | 60.9% | 62.9% | 62.4% | 66.7% |
| Share of time the world was frozen | 0.0% | 0.0% | 49.7% | 0.0% |
| Dead ends | 0 | 0 | 0 | 0 |
