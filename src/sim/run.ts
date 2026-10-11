// Command line entry: npm run sim -- --worlds=1000 --days=28
// Plays many seeded worlds with each bot and checks the results against the
// design targets. Balance numbers are only trusted once this passes.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { HOUR, MAX_BUILD_MS } from '../engine/content';
import { BOTS } from './bots';
import { simulateWorld } from './simulate';
import type { WorldResult } from './simulate';

function arg(name: string, fallback: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

const WORLDS = Number(arg('worlds', '1000'));
const DAYS = Number(arg('days', '28'));
const OUT = arg('out', '');

function percentile(values: number[], p: number): number {
  const sorted = values.slice().sort((a, b) => a - b);
  const index = (sorted.length - 1) * p;
  const lo = Math.floor(index);
  const hi = Math.ceil(index);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (index - lo);
}

function spread(values: (number | null)[]): string {
  const reached = values.filter((v): v is number => v !== null);
  if (reached.length === 0) return 'never';
  const text = `${percentile(reached, 0.5).toFixed(1)} (${percentile(reached, 0.1).toFixed(1)} to ${percentile(reached, 0.9).toFixed(1)})`;
  return reached.length === values.length ? text : `${text}, reached in ${pct(reached.length / values.length)}`;
}

const pct = (share: number) => `${(share * 100).toFixed(1)}%`;
const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
const median = (values: (number | null)[]) => {
  const reached = values.filter((v): v is number => v !== null);
  return reached.length === values.length && reached.length > 0 ? percentile(reached, 0.5) : null;
};

interface Check {
  name: string;
  target: string;
  result: string;
  pass: boolean;
}

const started = Date.now();
const byBot = new Map<string, WorldResult[]>();
for (const bot of BOTS) {
  const results: WorldResult[] = [];
  for (let i = 0; i < WORLDS; i++) results.push(simulateWorld(`sim-${i}`, bot, DAYS));
  byBot.set(bot.name, results);
}
const elapsed = Date.now() - started;

const balanced = byBot.get('balanced')!;
const twice = byBot.get('twice-a-day')!;
const once = byBot.get('once-a-day')!;
const byHand = byBot.get('by-hand')!;
const everyone = [...byBot.values()].flat();

const longestBuild = Math.max(...everyone.map((r) => r.longestBuildMs));
const deadEnds = everyone.reduce((sum, r) => sum + r.deadEnds, 0);
const courtMedian = median(balanced.map((r) => r.courtDay));
const progressShare = mean(balanced.map((r) => r.checkInsWithProgress / Math.max(1, r.checkIns)));
const levels7 = (results: WorldResult[]) => mean(results.map((r) => r.levelsAtDay[7] ?? 0));
const twiceVsBalanced = levels7(twice) / levels7(balanced);
const handVsBalanced = levels7(byHand) / levels7(balanced);
const wastedBalanced = mean(balanced.map((r) => r.wastedShare));
const builtMedian = median(balanced.map((r) => r.fullyBuiltDay));
const frozen = mean(once.map((r) => r.frozenShare));
const expectedFrozen = (8 + (DAYS - 1) * 12) / (20 + (DAYS - 1) * 24);

// Checks are the design doc's targets that can already be measured with one
// city and no armies. Observations are numbers to watch that only get a
// target once armies, rivals and Deeds exist.
const checks: Check[] = [
  {
    name: 'Longest single build',
    target: 'At most 8 hours',
    result: `${(longestBuild / HOUR).toFixed(2)} hours`,
    pass: longestBuild <= MAX_BUILD_MS,
  },
  {
    name: 'Dead ends (no progress possible)',
    target: 'Zero',
    result: String(deadEnds),
    pass: deadEnds === 0,
  },
  {
    name: 'Twice-a-day bot still progresses',
    target: 'At least 70% of the balanced bot\'s building levels at day 7',
    result: pct(twiceVsBalanced),
    pass: twiceVsBalanced >= 0.7,
  },
  {
    name: '12-hour freeze, once-a-day bot',
    target: `World frozen ${pct(expectedFrozen)} of the time`,
    result: pct(frozen),
    pass: Math.abs(frozen - expectedFrozen) < 0.001,
  },
];

const observations: [string, string, string][] = [
  [
    'Court built, balanced bot',
    courtMedian === null ? 'not reached in every world' : `Day ${courtMedian.toFixed(1)}`,
    'Design target is a first conquest on day 5 to 8. Judged once armies and Claimants exist.',
  ],
  [
    'Founding city fully built, balanced bot',
    builtMedian === null ? 'not reached in every world' : `Day ${builtMedian.toFixed(1)}`,
    'Will take longer once armies compete for the same Timber and Metal.',
  ],
  [
    'Check-ins where a build had finished, balanced bot',
    pct(progressShare),
    'Design target is over 95% of sessions finishing a goal. Deeds will add goals beyond builds.',
  ],
  [
    'Building by hand compared with a city plan',
    `${pct(handVsBalanced)} of the levels at day 7`,
    'Same check-ins, no plan. This gap is what city plans are for.',
  ],
  [
    'Production lost to a full Storehouse, balanced bot',
    pct(wastedBalanced),
    'Food and Wealth overflow because nothing spends them until armies and Claimants arrive.',
  ],
];

const lines: string[] = [];
lines.push('# Valehalla balance simulation: phase 0');
lines.push('');
lines.push(
  `${WORLDS} seeded worlds per bot, ${DAYS} days each, one founding city and no armies or rivals yet. ` +
    `Seeds currently change only the city's site traits, so worlds differ little. ` +
    `Ran in ${(elapsed / 1000).toFixed(1)} seconds.`,
);
lines.push('');
lines.push('## Checks');
lines.push('');
lines.push('| Check | Target | Result | |');
lines.push('| --- | --- | --- | --- |');
for (const c of checks) lines.push(`| ${c.name} | ${c.target} | ${c.result} | ${c.pass ? 'PASS' : 'FAIL'} |`);
lines.push('');
lines.push('## Observations');
lines.push('');
lines.push('| Measure | Result | Note |');
lines.push('| --- | --- | --- |');
for (const [name, result, note] of observations) lines.push(`| ${name} | ${result} | ${note} |`);
lines.push('');
lines.push('## By bot');
lines.push('');
lines.push('Days are shown as median (10th to 90th percentile).');
lines.push('');
lines.push('| | ' + BOTS.map((b) => b.name).join(' | ') + ' |');
lines.push('| --- | ' + BOTS.map(() => '---').join(' | ') + ' |');
const row = (label: string, cell: (results: WorldResult[]) => string) =>
  lines.push(`| ${label} | ` + BOTS.map((b) => cell(byBot.get(b.name)!)).join(' | ') + ' |');
row('How it plays', (r) => BOTS.find((b) => b.name === r[0]!.bot)!.description);
row('Minutes until the first build finishes', (r) => spread(r.map((x) => x.firstBuildMinutes)));
row('Day Keep reaches 5', (r) => spread(r.map((x) => x.keep5Day)));
row('Day Keep reaches 10', (r) => spread(r.map((x) => x.keep10Day)));
row('Day Court is built', (r) => spread(r.map((x) => x.courtDay)));
row('Day city is fully built', (r) => spread(r.map((x) => x.fullyBuiltDay)));
for (const day of [1, 3, 7, 14, 21, 28].filter((d) => d <= DAYS)) {
  row(`Building levels at day ${day} (of 180)`, (r) => mean(r.map((x) => x.levelsAtDay[day] ?? 0)).toFixed(0));
}
row('Check-ins where a build had finished', (r) => pct(mean(r.map((x) => x.checkInsWithProgress / Math.max(1, x.checkIns)))));
for (const res of ['timber', 'metal', 'food', 'wealth'] as const) {
  row(`${res[0]!.toUpperCase()}${res.slice(1)} lost to a full Storehouse`, (r) => pct(mean(r.map((x) => x.wastedByResource[res]))));
}
row('Share of time the world was frozen', (r) => pct(mean(r.map((x) => x.frozenShare))));
row('Dead ends', (r) => String(r.reduce((s, x) => s + x.deadEnds, 0)));
lines.push('');

const report = lines.join('\n');
console.log(report);
if (OUT) {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, report);
  console.log(`Written to ${OUT}`);
}
process.exitCode = checks.every((c) => c.pass) ? 0 : 1;
