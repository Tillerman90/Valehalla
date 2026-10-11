import { describe, expect, it } from 'vitest';
import { MAX_BUILD_MS } from '../engine';
import { BOTS } from './bots';
import { simulateWorld } from './simulate';

const bot = (name: string) => BOTS.find((b) => b.name === name)!;

describe('the simulator', () => {
  it('replays a world identically from the same seed', () => {
    const a = simulateWorld('replay', bot('balanced'), 10);
    const b = simulateWorld('replay', bot('balanced'), 10);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('builds a whole city without dead ends or over-long builds', () => {
    for (const b of BOTS) {
      const result = simulateWorld('whole-city', b, 28);
      expect(result.deadEnds, b.name).toBe(0);
      expect(result.longestBuildMs, b.name).toBeLessThanOrEqual(MAX_BUILD_MS);
      expect(result.courtDay, b.name).not.toBeNull();
    }
  });

  it('freezes the world for a player who only opens the app once a day', () => {
    const result = simulateWorld('freeze', bot('once-a-day'), 10);
    expect(result.frozenShare).toBeGreaterThan(0.45);
    expect(simulateWorld('freeze', bot('balanced'), 10).frozenShare).toBe(0);
  });

  it('lets a twice-a-day player keep pace when a city plan is running', () => {
    const balanced = simulateWorld('pace', bot('balanced'), 7);
    const twice = simulateWorld('pace', bot('twice-a-day'), 7);
    expect(twice.levelsAtDay[7]! / balanced.levelsAtDay[7]!).toBeGreaterThan(0.7);
  });
});
