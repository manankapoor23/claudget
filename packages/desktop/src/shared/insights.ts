import type { CacheStats, OfficialWindow, SourceBreakdown } from '@claude-widget/core';

/**
 * Two significant figures. A learned estimate shown as "$128.43" claims a
 * precision it doesn't have; "$130" doesn't.
 */
export function roughly(n: number): number {
  return Number.isFinite(n) && n > 0 ? Number(n.toPrecision(2)) : 0;
}

export interface WindowHolds {
  key: 'five_hour' | 'seven_day';
  label: string;
  /** API-equivalent USD that fills the window, to two significant figures. */
  fullUSD: number;
  /** The same in tokens, at the last 30 days' mix of models and cache; null without one. */
  tokens: number | null;
  /** Calibration records it was learned from. */
  samples: number;
}

const SHOWN: Array<{ key: WindowHolds['key']; label: string }> = [
  { key: 'five_hour', label: '5-hour window' },
  { key: 'seven_day', label: 'Weekly' },
];

/**
 * What a full 5-hour and weekly window hold, for the ones the engine has
 * learned (see core's capacityFor). The token figure converts at the user's
 * own recent tokens-per-dollar, since tokens alone track the limits badly:
 * cache reads are most of them and cost almost nothing.
 */
export function windowHolds(
  windows: readonly OfficialWindow[],
  last30d: readonly SourceBreakdown[],
): WindowHolds[] {
  const tokens = last30d.reduce((sum, s) => sum + s.tokens.total, 0);
  const usd = last30d.reduce((sum, s) => sum + s.costUSD, 0);
  const perUSD = usd > 0 && tokens > 0 ? tokens / usd : null;
  return SHOWN.flatMap(({ key, label }) => {
    const capacity = windows.find((w) => w.key === key)?.capacity;
    if (!capacity || !(capacity.fullUSD > 0)) return [];
    return [
      {
        key,
        label,
        fullUSD: roughly(capacity.fullUSD),
        tokens: perUSD === null ? null : roughly(capacity.fullUSD * perUSD),
        samples: capacity.samples,
      },
    ];
  });
}

export interface CacheSummary {
  /** Share of prompt tokens served from the cache, 0..1. */
  hitRate: number;
  /**
   * What the cache saved at API prices: what the prompts would have cost
   * without it, less what they did. Negative in the rare case that cache
   * writes (billed above the input price) outweighed the reads. Null when
   * nothing priced was used.
   */
  savedUSD: number | null;
}

/** The prompt cache in two numbers, or null with no prompts in the last 30 days. */
export function cacheSummary(cache: CacheStats): CacheSummary | null {
  if (cache.promptTokens <= 0) return null;
  return {
    hitRate: cache.cacheReadTokens / cache.promptTokens,
    savedUSD: cache.uncachedPromptUSD > 0 ? cache.uncachedPromptUSD - cache.promptUSD : null,
  };
}
