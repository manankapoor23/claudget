import { DEFAULT_PRICING, type ModelPricing } from './pricing.data';
import type { ModelId, TokenCounts } from './types';

export type PricingTable = Record<string, ModelPricing>;

export { DEFAULT_PRICING, PRICING_NOTE } from './pricing.data';
export type { ModelPricing } from './pricing.data';

const FAMILIES = ['opus', 'sonnet', 'haiku', 'fable', 'mythos'] as const;

/** Strips the `claude-` prefix, a `[1m]` context suffix and a trailing date stamp. */
export function normalizeModelId(model: string): string {
  return model
    .toLowerCase()
    .replace(/^claude-/, '')
    .replace(/\[1m\]$/, '')
    .replace(/-\d{8}$/, '')
    .trim();
}

/** Friendly display label, e.g. `claude-opus-4-8` → "Opus 4.8". */
export function modelLabel(model: string): string {
  const n = normalizeModelId(model);
  // A one-part version (`opus-5`) is as much a version as `opus-4-8`; a second
  // number of more than two digits would be a date stamp, not a minor version.
  const m = n.match(/^(opus|sonnet|haiku|fable|mythos)-(\d+)(?:-(\d{1,2}))?(?:-|$)/);
  if (m) {
    const fam = m[1] ?? '';
    return `${fam.charAt(0).toUpperCase()}${fam.slice(1)} ${m[2]}${m[3] ? `.${m[3]}` : ''}`;
  }
  const fam = FAMILIES.find((f) => n.includes(f));
  if (fam) return fam.charAt(0).toUpperCase() + fam.slice(1);
  if (!n || n === '<synthetic>') return 'Synthetic';
  return model;
}

/**
 * Resolves the pricing row for a model: exact id, then the normalised version
 * (`opus-4-8`), then its family (the newest model in it), else null.
 */
export function lookupPricing(model: string, table: PricingTable): ModelPricing | null {
  if (table[model]) return table[model];
  const n = normalizeModelId(model);
  if (table[n]) return table[n];
  const fam = FAMILIES.find((f) => n.includes(f));
  if (fam && table[fam]) return table[fam];
  return null;
}

export interface CostResult {
  costUSD: number;
  /** False when no pricing row matched (cost reported as 0). */
  priced: boolean;
}

/** The input side of a request at API prices, with and without the prompt cache. */
export interface PromptCost {
  /** What the prompt cost: fresh input, cache writes and cache reads. */
  actualUSD: number;
  /** What the same prompt would have cost with every token billed as fresh input. */
  uncachedUSD: number;
}

/**
 * Prices a request's prompt both ways, to show what the prompt cache saved.
 * Output is the same either way, so it's left out. Null when the model has no
 * pricing row.
 */
export function promptCost(
  tokens: TokenCounts,
  model: ModelId,
  table: PricingTable = DEFAULT_PRICING,
): PromptCost | null {
  const p = lookupPricing(model, table);
  if (!p) return null;
  const perMillion = (count: number, rate: number): number => (count / 1_000_000) * rate;
  return {
    actualUSD:
      perMillion(tokens.input, p.input) +
      cacheWriteUSD(tokens, p) +
      perMillion(tokens.cacheRead, p.cacheRead),
    uncachedUSD: perMillion(tokens.input + tokens.cacheCreation + tokens.cacheRead, p.input),
  };
}

/** What the cache writes cost: 1-hour writes at their rate, the rest at the 5-minute one. */
function cacheWriteUSD(tokens: TokenCounts, p: ModelPricing): number {
  const hour = Math.min(tokens.cacheCreation, tokens.cacheCreation1h ?? 0);
  return ((tokens.cacheCreation - hour) * p.cacheWrite5m + hour * p.cacheWrite1h) / 1_000_000;
}

/** Estimates cost for a bundle of tokens at API list prices. */
export function estimateCost(
  tokens: TokenCounts,
  model: ModelId,
  table: PricingTable = DEFAULT_PRICING,
): CostResult {
  const p = lookupPricing(model, table);
  if (!p) return { costUSD: 0, priced: false };
  const perMillion = (count: number, rate: number): number => (count / 1_000_000) * rate;
  const costUSD =
    perMillion(tokens.input, p.input) +
    perMillion(tokens.output, p.output) +
    cacheWriteUSD(tokens, p) +
    perMillion(tokens.cacheRead, p.cacheRead);
  return { costUSD, priced: true };
}
