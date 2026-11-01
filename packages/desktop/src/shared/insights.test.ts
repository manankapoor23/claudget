import { describe, expect, it } from 'vitest';
import type { OfficialWindow, SourceBreakdown } from '@claude-widget/core';
import { cacheSummary, roughly, windowHolds } from './insights';

const win = (key: string, capacity?: OfficialWindow['capacity']): OfficialWindow => ({
  key,
  label: key,
  utilization: 0.4,
  usedPct: 40,
  remainingPct: 60,
  resetsAt: null,
  used: null,
  limit: null,
  ...(capacity === undefined ? {} : { capacity }),
});

const source = (tokens: number, costUSD: number): SourceBreakdown => ({
  source: 'cli',
  tokens: { input: 0, output: 0, cacheCreation: 0, cacheRead: tokens, total: tokens },
  costUSD,
  count: 1,
});

describe('roughly', () => {
  it('keeps two significant figures', () => {
    expect(roughly(128.43)).toBe(130);
    expect(roughly(1162.5)).toBe(1200);
    expect(roughly(6.04)).toBe(6);
    expect(roughly(94_871_002)).toBe(95_000_000);
  });
  it('is 0 for nothing, negatives and non-numbers', () => {
    expect(roughly(0)).toBe(0);
    expect(roughly(-5)).toBe(0);
    expect(roughly(Number.NaN)).toBe(0);
  });
});

describe('windowHolds', () => {
  it('lists the 5-hour, then the weekly window, rounded, with tokens at the recent mix', () => {
    const windows = [
      win('seven_day', { fullUSD: 1162.5, samples: 6 }),
      win('five_hour', { fullUSD: 128.4, samples: 8 }),
    ];
    // 30 days: 600M tokens for $400, so $1 ≈ 1.5M tokens.
    const holds = windowHolds(windows, [source(450e6, 300), source(150e6, 100)]);
    expect(holds).toEqual([
      { key: 'five_hour', label: '5-hour window', fullUSD: 130, tokens: 190_000_000, samples: 8 },
      { key: 'seven_day', label: 'Weekly', fullUSD: 1200, tokens: 1_700_000_000, samples: 6 },
    ]);
  });

  it('leaves out windows not learned yet, and other limits', () => {
    const windows = [
      win('five_hour'),
      win('seven_day', null),
      win('seven_day_opus', { fullUSD: 300, samples: 3 }),
    ];
    expect(windowHolds(windows, [source(1e6, 1)])).toEqual([]);
  });

  it('has no token figure without priced use to convert at', () => {
    const holds = windowHolds([win('five_hour', { fullUSD: 100, samples: 3 })], [source(1e6, 0)]);
    expect(holds[0]?.tokens).toBeNull();
    expect(windowHolds([win('five_hour', { fullUSD: 100, samples: 3 })], [])[0]?.tokens).toBeNull();
  });
});

describe('cacheSummary', () => {
  it('is the share of prompt tokens read from the cache, and what that saved', () => {
    const s = cacheSummary({
      promptTokens: 1_000_000,
      cacheReadTokens: 940_000,
      promptUSD: 40,
      uncachedPromptUSD: 300,
    });
    expect(s?.hitRate).toBeCloseTo(0.94, 9);
    expect(s?.savedUSD).toBeCloseTo(260, 9);
  });

  it('can be negative when cache writes outweighed the reads', () => {
    const s = cacheSummary({
      promptTokens: 100,
      cacheReadTokens: 0,
      promptUSD: 1.25,
      uncachedPromptUSD: 1,
    });
    expect(s?.savedUSD).toBeCloseTo(-0.25, 9);
  });

  it('is null with no prompts, and has no dollars without priced use', () => {
    const none = { promptTokens: 0, cacheReadTokens: 0, promptUSD: 0, uncachedPromptUSD: 0 };
    expect(cacheSummary(none)).toBeNull();
    expect(cacheSummary({ ...none, promptTokens: 10, cacheReadTokens: 5 })?.savedUSD).toBeNull();
  });
});
