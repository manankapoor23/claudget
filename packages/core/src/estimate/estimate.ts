import type { LimitEstimate, OfficialWindow } from '../types';

/**
 * The estimate adds only this share of what the learned rate predicts. Being a
 * little low is cheap (the next official reading nudges the number up); being
 * high is not (it drops back, and a number that falls without a reset reads as
 * a bug). The learned rate runs high when it's averaged over a window that
 * started faster than the current pace (and usage elsewhere inflates it), so:
 * 0.8. Simulated, it overshoots the next reading 5% of the time (7.8% at 0.9)
 * for a mean error of 0.30 points (0.26); replayed on the owner's real
 * readings, 1 overshoot in 7 (3 in 7 at 0.9). Thin evidence: tune it from the
 * debug log's "Limit estimate overshot/undershot" lines.
 */
export const ESTIMATE_SAFETY = 0.8;

/**
 * The most the estimate adds to a reading: 15 points. Readings arrive every
 * few minutes while you work, adding a point or two; this only bites when they
 * stop (offline, rate-limited), where an extrapolation hours long would be
 * guesswork. It errs low, the safe side.
 */
export const MAX_ESTIMATE_GAIN = 0.15;

export interface EstimateInput {
  /** The latest official reading of this limit. */
  window: OfficialWindow;
  /** When that reading was taken (local clock, epoch ms). */
  readingAt: number;
  now: number;
  /** Learned utilisation per unit of weight; null = not calibrated yet. */
  rate: number | null;
  /** Local usage weight after `from` (exclusive) up to now. */
  weightSince: (from: number) => number;
}

/**
 * The live estimate for one limit, or null when there's nothing to add to the
 * official reading.
 *
 * estimate = official + ESTIMATE_SAFETY × k × (local weight since the reading),
 * clamped to [official, official + MAX_ESTIMATE_GAIN] and to 100%. Once the window's reset time has passed, the
 * old reading no longer applies: it's 0 plus the usage since the reset.
 *
 * Only this machine's usage is visible, so the estimate can only under-count
 * what happens on other devices or on claude.ai; the official reading always
 * replaces it as soon as it arrives.
 *
 * Returns null (show the official value as is) unless the estimate would
 * change the whole-number percent shown, or the window has reset.
 */
export function estimateWindow(input: EstimateInput): LimitEstimate | null {
  const { window: w, readingAt, now, rate } = input;
  if (rate === null || !(rate > 0)) return null;
  const afterReset = w.resetsAt !== null && now >= w.resetsAt;
  const official = Math.max(0, Math.min(1, w.utilization));
  const base = afterReset ? 0 : official;
  const from = afterReset ? (w.resetsAt as number) : readingAt;
  const weight = Math.max(0, input.weightSince(from));
  const gain = Math.min(MAX_ESTIMATE_GAIN, ESTIMATE_SAFETY * rate * weight);
  const utilization = Math.min(1, base + gain);
  if (!afterReset && Math.round(utilization * 100) === Math.round(official * 100)) return null;
  return {
    utilization,
    usedPct: utilization * 100,
    basisAt: readingAt,
    afterReset,
  };
}
