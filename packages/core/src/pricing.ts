import { DEFAULT_PRICING, type ModelPricing } from './pricing.data';
import type { ModelId, TokenCounts } from './types';

export type PricingTable = Record<string, ModelPricing>;

export { DEFAULT_PRICING, PRICING_NOTE } from './pricing.data';
export type { ModelPricing } from './pricing.data';

const FAMILIES = ['opus', 'sonnet', 'haiku', 'fable'] as const;

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
  const m = n.match(/^(opus|sonnet|haiku|fable)-(\d+)-(\d+)/);
  if (m) {
    const fam = m[1] ?? '';
    return `${fam.charAt(0).toUpperCase()}${fam.slice(1)} ${m[2]}.${m[3]}`;
  }
  const fam = FAMILIES.find((f) => n.includes(f));
  if (fam) return fam.charAt(0).toUpperCase() + fam.slice(1);
  if (!n || n === '<synthetic>') return 'Synthetic';
  return model;
}

/** Resolves the pricing row for a model: exact → normalised → family → null. */
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

/**
 * Estimates cost for a bundle of tokens. Cache-write tokens are priced at the
 * 5-minute rate (the common case); this is a documented approximation.
 */
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
    perMillion(tokens.cacheCreation, p.cacheWrite5m) +
    perMillion(tokens.cacheRead, p.cacheRead);
  return { costUSD, priced: true };
}
