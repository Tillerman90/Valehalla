# Valehalla balance simulation: phase 0

1000 seeded worlds per bot, 28 days each, one founding city and no armies or rivals yet. Seeds currently change only the city's site traits, so worlds differ little. Ran in 77.2 seconds.

## Checks

| Check | Target | Result | |
| --- | --- | --- | --- |
| Longest single build | At most 8 hours | 8.00 hours | PASS |
| Dead ends (no progress possible) | Zero | 0 | PASS |
| Twice-a-day bot still progresses | At least 70% of the balanced bot's building levels at day 7 | 100.0% | PASS |
| 12-hour freeze, once-a-day bot | World frozen 49.7% of the time | 49.7% | PASS |

## Observations

| Measure | Result | Note |
| --- | --- | --- |
| Court built, balanced bot | Day 2.3 | Design target is a first conquest on day 5 to 8. Judged once armies and Claimants exist. |
| Founding city fully built, balanced bot | Day 9.9 | Will take longer once armies compete for the same Timber and Metal. |
| Check-ins where a build had finished, balanced bot | 83.9% | Design target is over 95% of sessions finishing a goal. Deeds will add goals beyond builds. |
| Building by hand compared with a city plan | 73.2% of the levels at day 7 | Same check-ins, no plan. This gap is what city plans are for. |
| Production lost to a full Storehouse, balanced bot | 34.3% | Food and Wealth overflow because nothing spends them until armies and Claimants arrive. |

## By bot

Days are shown as median (10th to 90th percentile).

| | balanced | twice-a-day | once-a-day | by-hand |
| --- | --- | --- | --- | --- |
| How it plays | Six check-ins a day (7am to 10pm), Economy plan | Opens the app at 8am and 8pm only, Economy plan | Opens the app at 8pm only, Economy plan. The world is frozen half of every day | Six check-ins a day, no plan: every order placed by hand |
| Minutes until the first build finishes | 44.2 (37.4 to 45.9) | 44.2 (37.4 to 45.9) | 44.2 (37.4 to 45.9) | 421.6 (421.6 to 421.6) |
| Day Keep reaches 5 | 0.5 (0.4 to 0.5) | 0.8 (0.8 to 0.8) | 0.8 (0.8 to 0.8) | 1.8 (1.8 to 1.8) |
| Day Keep reaches 10 | 1.9 (1.5 to 1.9) | 2.3 (1.8 to 2.3) | 3.8 (2.8 to 3.8) | 4.4 (4.4 to 4.4) |
| Day Court is built | 2.3 (1.7 to 2.3) | 2.3 (1.8 to 2.3) | 5.8 (3.8 to 5.8) | 4.5 (4.5 to 4.5) |
| Day city is fully built | 9.9 (9.3 to 9.9) | 9.8 (9.3 to 9.8) | 20.8 (17.8 to 20.8) | 13.3 (12.7 to 13.3) |
| Building levels at day 1 (of 180) | 43 | 43 | 33 | 17 |
| Building levels at day 3 (of 180) | 99 | 99 | 64 | 49 |
| Building levels at day 7 (of 180) | 165 | 165 | 108 | 121 |
| Building levels at day 14 (of 180) | 180 | 180 | 165 | 180 |
| Building levels at day 21 (of 180) | 180 | 180 | 180 | 180 |
| Building levels at day 28 (of 180) | 180 | 180 | 180 | 180 |
| Check-ins where a build had finished | 83.9% | 100.0% | 100.0% | 91.4% |
| Timber lost to a full Storehouse | 9.1% | 8.5% | 11.7% | 21.3% |
| Metal lost to a full Storehouse | 19.1% | 18.6% | 21.0% | 28.6% |
| Food lost to a full Storehouse | 56.0% | 55.7% | 57.1% | 61.1% |
| Wealth lost to a full Storehouse | 61.6% | 61.3% | 62.5% | 65.6% |
| Share of time the world was frozen | 0.0% | 0.0% | 49.7% | 0.0% |
| Dead ends | 0 | 0 | 0 | 0 |
