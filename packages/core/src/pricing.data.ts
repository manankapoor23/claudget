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
 * A row at Anthropic's standard rates: cache writes at 1.25× the input price
 * (5-minute) and 2× (1-hour), cache reads at `readShare` of it (0.1 on most
 * models).
 */
function rates(input: number, output: number, readShare = 0.1): ModelPricing {
  // Rounded so the table holds exact cents-per-million, not 0.30000000000000004.
  const exact = (n: number): number => Math.round(n * 1e6) / 1e6;
  return {
    input,
    output,
    cacheWrite5m: exact(input * 1.25),
    cacheWrite1h: exact(input * 2),
    cacheRead: exact(input * readShare),
  };
}

/**
 * Anthropic's list prices (USD per 1M tokens), by model version as
 * `normalizeModelId` writes it. A version not listed takes its family's row,
 * which is the newest model in that family. For display only: what the same
 * use would cost on the API, not anyone's bill. Prices from Anthropic's model
 * pages, September 2026; update this table when a model is added.
 */
export const DEFAULT_PRICING: Record<string, ModelPricing> = {
  'opus-5-5': rates(4, 20, 0.05),
  'opus-5': rates(5, 25),
  'opus-4-8': rates(5, 25),
  'opus-4-7': rates(5, 25),
  'opus-4-6': rates(5, 25),
  'opus-4-5': rates(5, 25),
  'opus-4-1': rates(15, 75),
  'opus-4': rates(15, 75),
  'sonnet-5-5': rates(2, 10),
  'sonnet-5': rates(2, 10),
  'sonnet-4-6': rates(3, 15),
  'sonnet-4-5': rates(3, 15),
  'sonnet-4': rates(3, 15),
  'haiku-4-5': rates(1, 5),
  'fable-5-1': rates(10, 50, 0.025),
  'fable-5': rates(10, 50),
  'mythos-5-1': rates(10, 50, 0.025),
  'mythos-5': rates(10, 50),
  // Families, for versions not listed above: the newest model of each.
  opus: rates(4, 20, 0.05),
  sonnet: rates(2, 10),
  haiku: rates(1, 5),
  fable: rates(10, 50, 0.025),
  mythos: rates(10, 50, 0.025),
};

export const PRICING_NOTE = 'Prices are USD per 1M tokens and are estimates for display only.';
