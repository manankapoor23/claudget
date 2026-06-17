export interface ModelPricing {
  /** USD per 1,000,000 input tokens. */
  input: number;
  /** USD per 1,000,000 output tokens. */
  output: number;
  /** USD per 1,000,000 cache-write tokens (5-minute TTL). */
  cacheWrite5m: number;
  /** USD per 1,000,000 cache-write tokens (1-hour TTL). */
  cacheWrite1h: number;
  /** USD per 1,000,000 cache-read tokens. */
  cacheRead: number;
}

/**
 * Default pricing table, keyed by model family. Values are USD per 1M tokens
 * and are ESTIMATES for cost display only — override them via
 * `pricingOverridePath` in config if you need precise figures.
 */
export const DEFAULT_PRICING: Record<string, ModelPricing> = {
  opus: { input: 15, output: 75, cacheWrite5m: 18.75, cacheWrite1h: 30, cacheRead: 1.5 },
  sonnet: { input: 3, output: 15, cacheWrite5m: 3.75, cacheWrite1h: 6, cacheRead: 0.3 },
  haiku: { input: 1, output: 5, cacheWrite5m: 1.25, cacheWrite1h: 2, cacheRead: 0.1 },
  // Fable pricing is not published at time of writing; treated as a Sonnet-tier estimate.
  fable: { input: 3, output: 15, cacheWrite5m: 3.75, cacheWrite1h: 6, cacheRead: 0.3 },
};

export const PRICING_NOTE = 'Prices are USD per 1M tokens and are estimates for display only.';
