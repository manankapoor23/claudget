/**
 * A day of synthetic but realistic use, run through the same pure functions
 * the engine uses: bursty Opus requests, Anthropic's readings every 180s while
 * active (300s idle) rounded to whole percents as the endpoint does, a true
 * rate that differs window to window, and some usage on another device that
 * this machine never sees. It scores the % the user would have seen just
 * before each reading against that reading.
 *
 * `SIM_REPORT=1 npx vitest run src/estimate/simulate.test.ts` prints the numbers.
 */
import { describe, expect, it } from 'vitest';
import type { OfficialWindow } from '../types';
import { EMPTY_CALIBRATION, ingestReading, rateFor, type CalibrationState } from './calibration';
import { estimateWindow } from './estimate';

const MIN = 60_000;
const H = 60 * MIN;

/** Deterministic PRNG (mulberry32) so the numbers are reproducible. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Req {
  at: number;
  cost: number;
}

interface SimResult {
  readings: number;
  errors: number[];
  /** The same, showing only the last reading (no estimate). */
  baseline: number[];
  /** Errors at readings where the official % had moved since the previous one. */
  moving: number[];
  over: number;
  under: number;
  exact: number;
  /** Displayed vs true (unrounded) utilisation, sampled at every request. */
  trackingMae: number;
  estimatedShare: number;
}

function simulate(seed: number): SimResult {
  const rand = rng(seed);
  const T0 = Date.UTC(2026, 9, 4, 8, 0, 0);
  const windows = 3;
  const reqs: Req[] = [];
  /** True rate per window: k ≈ 0.45 pt per $ ±25%, like the owner's real windows. */
  const kTrue: number[] = [];
  /** Hidden usage (another device / claude.ai), as utilisation per minute, per window. */
  const hidden: number[] = [];
  for (let wi = 0; wi < windows; wi++) {
    kTrue.push(0.0045 * (0.75 + 0.5 * rand()));
    hidden.push(wi === 1 ? 0.0004 : 0); // window 2: ~2.4 pts/hour from elsewhere
    const start = T0 + wi * 5 * H;
    let t = start + 5 * MIN;
    while (t < start + 5 * H - 10 * MIN) {
      // A burst of 10-50 minutes, requests every 5-40s, then a 5-30 minute pause.
      const burstEnd = t + (10 + 40 * rand()) * MIN;
      while (t < burstEnd) {
        t += (5 + 35 * rand()) * 1000;
        // Opus request cost: mostly small, sometimes a big cache write.
        const cost = rand() < 0.1 ? 0.8 + 1.5 * rand() : 0.05 + 0.35 * rand();
        reqs.push({ at: t, cost });
      }
      t += (5 + 25 * rand()) * MIN;
    }
  }
  const windowOf = (t: number): number => Math.floor((t - T0) / (5 * H));
  const weightBetween = (from: number, to: number): number =>
    reqs.reduce((s, r) => (r.at > from && r.at <= to ? s + r.cost : s), 0);
  const trueU = (t: number): number => {
    const wi = windowOf(t);
    const start = T0 + wi * 5 * H;
    const local = weightBetween(start, t) * kTrue[wi]!;
    return Math.min(1, local + hidden[wi]! * ((t - start) / MIN));
  };
  const official = (t: number): OfficialWindow => {
    const u = Math.round(trueU(t) * 100) / 100;
    return {
      key: 'five_hour',
      label: '5-Hour',
      utilization: u,
      usedPct: u * 100,
      remainingPct: 100 - u * 100,
      resetsAt: T0 + (windowOf(t) + 1) * 5 * H,
      used: null,
      limit: null,
    };
  };

  let cal: CalibrationState = EMPTY_CALIBRATION;
  let last: { w: OfficialWindow; at: number } | null = null;
  const shown = (t: number): { u: number; estimated: boolean } => {
    if (!last) return { u: 0, estimated: false };
    const e = estimateWindow({
      window: last.w,
      readingAt: last.at,
      now: t,
      rate: rateFor(cal, 'five_hour')?.k ?? null,
      weightSince: (from) => weightBetween(from, t),
    });
    return e ? { u: e.utilization, estimated: true } : { u: last.w.utilization, estimated: false };
  };

  // Polls: 180s after activity, otherwise every 300s (the real scheduler's floor and default).
  const end = T0 + windows * 5 * H;
  const errors: number[] = [];
  const baseline: number[] = [];
  const moving: number[] = [];
  let trackSum = 0;
  let trackN = 0;
  let estimatedN = 0;
  let ri = 0;
  for (let t = T0 + MIN; t < end; ) {
    // Score what was on screen at each request since the last poll.
    while (ri < reqs.length && reqs[ri]!.at < t) {
      const at = reqs[ri]!.at;
      const s = shown(at);
      trackSum += Math.abs(s.u - trueU(at)) * 100;
      trackN += 1;
      if (s.estimated) estimatedN += 1;
      ri += 1;
    }
    const before = shown(t - 1);
    const w = official(t);
    if (last && last.w.resetsAt === w.resetsAt) {
      // What the user saw (whole percent) vs what Anthropic then said.
      errors.push(Math.round(before.u * 100) - Math.round(w.utilization * 100));
      baseline.push(Math.round(last.w.utilization * 100) - Math.round(w.utilization * 100));
      if (w.utilization !== last.w.utilization) moving.push(errors[errors.length - 1]!);
    }
    last = { w, at: t };
    cal = ingestReading(
      cal,
      { key: 'five_hour', utilization: w.utilization, resetsAt: w.resetsAt, at: t },
      weightBetween,
    );
    const active = reqs.some((r) => r.at > t - 3 * MIN && r.at <= t);
    t += active ? 3 * MIN : 5 * MIN;
  }
  return {
    readings: errors.length,
    errors,
    baseline,
    moving,
    over: errors.filter((e) => e > 0).length,
    under: errors.filter((e) => e < 0).length,
    exact: errors.filter((e) => e === 0).length,
    trackingMae: trackSum / Math.max(1, trackN),
    estimatedShare: estimatedN / Math.max(1, trackN),
  };
}

describe('live estimate simulation', () => {
  it('tracks the real % between readings to within about a point, rarely overshooting', () => {
    const runs = [1, 2, 3, 4, 5, 6, 7, 8].map(simulate);
    const errors = runs.flatMap((r) => r.errors);
    const abs = errors.map(Math.abs);
    const mae = abs.reduce((a, b) => a + b, 0) / abs.length;
    const max = Math.max(...abs);
    const over = runs.reduce((s, r) => s + r.over, 0);
    const under = runs.reduce((s, r) => s + r.under, 0);
    const exact = runs.reduce((s, r) => s + r.exact, 0);
    const tracking = runs.reduce((s, r) => s + r.trackingMae, 0) / runs.length;
    const share = runs.reduce((s, r) => s + r.estimatedShare, 0) / runs.length;

    // The same comparison with no estimate (the old behaviour: the last reading).
    const base = runs.flatMap((r) => r.baseline).map(Math.abs);
    const baseMae = base.reduce((a, b) => a + b, 0) / base.length;
    const moving = runs.flatMap((r) => r.moving);
    const movingMae = moving.reduce((a, b) => a + Math.abs(b), 0) / moving.length;
    if (process.env['SIM_REPORT']) {
      console.log(
        [
          `readings scored: ${errors.length} (8 seeded days × 3 five-hour windows)`,
          `shown just before each reading vs that reading, whole points:`,
          `  MAE ${mae.toFixed(2)}, max ${max}, exact ${exact}, over ${over}, under ${under}`,
          `  overshoot rate ${((over / errors.length) * 100).toFixed(1)}%`,
          `  without the estimate (last reading only): MAE ${baseMae.toFixed(2)}, max ${Math.max(...base)}`,
          `  only readings where the % moved (${moving.length}): MAE ${movingMae.toFixed(2)}, over ${moving.filter((e) => e > 0).length}, under ${moving.filter((e) => e < 0).length}, exact ${moving.filter((e) => e === 0).length}`,
          `shown vs true % at every request: MAE ${tracking.toFixed(2)} pts`,
          `share of requests where the shown % was an estimate: ${(share * 100).toFixed(0)}%`,
        ].join('\n'),
      );
    }
    expect(mae).toBeLessThan(1);
    expect(max).toBeLessThanOrEqual(4);
    expect(over / errors.length).toBeLessThan(0.15);
  });
});
