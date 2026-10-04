import { estimateCost, type PricingTable } from '../pricing';
import type { UsageEntry } from '../types';

/**
 * How much one request counts toward a plan limit, approximately: its
 * API-equivalent cost at list prices. Anthropic doesn't publish how the limits
 * are metered; cost tracks them far better than raw tokens (cache reads are
 * most of the tokens and almost none of the cost) and weighs models the way
 * the limits appear to.
 */
export function usageWeight(entry: UsageEntry, pricing: PricingTable): number {
  return estimateCost(entry.tokens, entry.model, pricing).costUSD;
}

/** Total weight of the entries in (from, to]. */
export function weightBetween(
  entries: readonly UsageEntry[],
  from: number,
  to: number,
  pricing: PricingTable,
): number {
  let sum = 0;
  for (const e of entries) {
    if (e.timestamp > from && e.timestamp <= to) sum += usageWeight(e, pricing);
  }
  return sum;
}
