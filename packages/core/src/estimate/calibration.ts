/**
 * Learns how fast each plan limit fills per unit of local usage, from
 * Anthropic's own readings, so the % can be estimated between them.
 *
 * The rate is k = Δutilisation / Δweight, where weight is the API-equivalent
 * cost (USD at list prices) of this machine's Claude Code usage — Anthropic's
 * limits are roughly cost-weighted, so an Opus token counts for more than a
 * Haiku one. Measured on the owner's real windows, cost and a model-agnostic
 * token-type weighting fit about equally well; raw token counts fit far worse
 * because cache reads dominate them while costing almost nothing.
 *
 * k comes from consecutive readings in the same window (no reset in between).
 * Summed, a run of pairs telescopes to (latest − anchor) / (weight since the
 * anchor), which is what is stored: one record per run of up to five hours
 * (so one per 5-hour window; a week is split into several). That is the same
 * evidence as the pairs, but robust to the endpoint rounding to whole percents,
 * which makes most 3-minute pairs read Δ = 0 or 1 — keeping only pairs with
 * Δ > 0 would learn a rate several times too fast. Where the window's length
 * is known (5-hour, 7-day) a new window's first record is anchored at its
 * start, where it was at 0%, so one reading is enough to calibrate; otherwise
 * at the first reading seen in it.
 *
 * Usage on other devices or on claude.ai moves the official % but never shows
 * up locally, so it inflates k for the records where it happened. The rate is
 * a weighted median across recent records to keep one such record from
 * dominating, and the estimate itself is damped (see ESTIMATE_SAFETY).
 */

/** How far each window's reset time may jitter between polls and still be the same window. */
const SAME_WINDOW_MS = 5 * 60 * 1000;
/** Records remembered per limit. */
export const CALIBRATION_WINDOWS = 8;
/** A record must have moved at least this much (fraction) to calibrate from: 3 points. */
export const MIN_CALIBRATION_DELTA = 0.03;
/** ...on at least this much local usage (API-equivalent USD). */
export const MIN_CALIBRATION_WEIGHT = 0.25;
/** A reading at or above this is saturated: usage past 100% doesn't move it. */
const SATURATED = 0.995;
/** A drop larger than this inside one window means the reading was revised; re-anchor. */
const DROP_TOLERANCE = 0.01;

const HOUR = 60 * 60 * 1000;
/**
 * A record spans at most this long; a longer window (the weekly one) is split
 * into consecutive records, so its rate follows recent use rather than
 * averaging over the whole week. On the owner's real data one week filled 70
 * points for its first $1,030 of local use and 8 points for the next $691.
 */
export const MAX_RECORD_MS = 5 * HOUR;

/** Window length by limit key, when it's known. */
export function windowLengthMs(key: string): number | null {
  const k = key.toLowerCase();
  if (k === 'five_hour' || k === 'five_hourly' || k === 'fivehour') return 5 * HOUR;
  if (k.startsWith('seven_day') || k === 'weekly' || k === 'sevenday') return 7 * 24 * HOUR;
  return null;
}

/** A run of readings in one window of one limit: what it moved, on how much use. */
export interface CalibrationWindow {
  /** The window's reset time (epoch ms); identifies it. */
  resetsAt: number;
  /** Anchor: the window's start at 0%, or the first reading seen in it. */
  fromAt: number;
  fromU: number;
  /** The latest unsaturated reading in this window. */
  toAt: number;
  toU: number;
  /** Local usage weight (API-equivalent USD) between `fromAt` and `toAt`. */
  weight: number;
  /** Set once the window hits 100%: later readings say nothing about the rate. */
  frozen: boolean;
}

export interface CalibrationState {
  version: 1;
  /** Per limit key, oldest record first. */
  limits: Record<string, CalibrationWindow[]>;
}

export const EMPTY_CALIBRATION: CalibrationState = { version: 1, limits: {} };

export interface OfficialReading {
  key: string;
  /** Fraction used, 0..1. */
  utilization: number;
  resetsAt: number | null;
  /** When it was read (local clock, epoch ms). */
  at: number;
}

/** Local usage weight in the half-open interval (from, to]. */
export type WeightBetween = (from: number, to: number) => number;

/**
 * Folds one official reading into the calibration. Pure: returns the same
 * object when nothing changed.
 */
export function ingestReading(
  state: CalibrationState,
  reading: OfficialReading,
  weightBetween: WeightBetween,
): CalibrationState {
  const { key, at, resetsAt } = reading;
  if (resetsAt === null || !Number.isFinite(at)) return state;
  const u = Math.max(0, Math.min(1, reading.utilization));
  const list = state.limits[key] ?? [];
  const last = list[list.length - 1];

  const put = (next: CalibrationWindow[]): CalibrationState => ({
    version: 1,
    limits: { ...state.limits, [key]: next.slice(-CALIBRATION_WINDOWS) },
  });

  if (last && Math.abs(last.resetsAt - resetsAt) < SAME_WINDOW_MS) {
    if (at <= last.toAt || last.frozen) return state;
    if (u >= SATURATED) return put([...list.slice(0, -1), { ...last, frozen: true }]);
    if (u < last.toU - DROP_TOLERANCE) {
      // Revised downwards without a reset: start over from this reading.
      return put([...list.slice(0, -1), anchorAtReading(resetsAt, at, u)]);
    }
    const added = Math.max(0, weightBetween(last.toAt, at));
    if (at - last.fromAt > MAX_RECORD_MS) {
      // Carry on in a new record of the same window, from the last reading.
      return put([
        ...list,
        {
          resetsAt: last.resetsAt,
          fromAt: last.toAt,
          fromU: last.toU,
          toAt: at,
          toU: Math.max(u, last.toU),
          weight: added,
          frozen: false,
        },
      ]);
    }
    return put([
      ...list.slice(0, -1),
      { ...last, toAt: at, toU: Math.max(u, last.fromU), weight: last.weight + added },
    ]);
  }

  // A window not seen before.
  const len = windowLengthMs(key);
  const start = len === null ? null : resetsAt - len;
  const fresh =
    start !== null && start < at
      ? {
          resetsAt,
          fromAt: start,
          fromU: 0,
          toAt: at,
          toU: u,
          weight: Math.max(0, weightBetween(start, at)),
          frozen: false,
        }
      : anchorAtReading(resetsAt, at, u);
  // Saturated on first sight: the weight since the start overstates what got it there.
  if (u >= SATURATED) fresh.frozen = true;
  if (fresh.frozen) {
    fresh.toAt = fresh.fromAt;
    fresh.toU = fresh.fromU;
    fresh.weight = 0;
  }
  // Windows arrive in order; an older one turning up again is ignored.
  const older = last && resetsAt < last.resetsAt - SAME_WINDOW_MS;
  return older ? state : put([...list, fresh]);
}

function anchorAtReading(resetsAt: number, at: number, u: number): CalibrationWindow {
  return { resetsAt, fromAt: at, fromU: u, toAt: at, toU: u, weight: 0, frozen: false };
}

export interface RateEstimate {
  /** Utilisation (fraction) per unit of weight (API-equivalent USD). */
  k: number;
  /** Records it was learned from. */
  windows: number;
}

/**
 * How far a record must have moved for a full say in the median: 10 points.
 * Below that its k is limited by the endpoint's whole-percent rounding, so it
 * counts in proportion; above it, what limits a record is that the rate drifts
 * over time, so a long record (a week's first, anchored at its start) counts
 * no more than a recent five-hour one.
 */
const FULL_VOTE_DELTA = 0.1;

/**
 * The learned rate for one limit: a weighted median of each recent record's
 * k (see FULL_VOTE_DELTA). Null until at least one record has moved enough to
 * measure.
 */
export function rateFor(state: CalibrationState, key: string): RateEstimate | null {
  const samples = (state.limits[key] ?? [])
    .filter((w) => w.toU - w.fromU >= MIN_CALIBRATION_DELTA && w.weight >= MIN_CALIBRATION_WEIGHT)
    .map((w) => ({
      k: (w.toU - w.fromU) / w.weight,
      weight: Math.min(FULL_VOTE_DELTA, w.toU - w.fromU),
    }))
    .filter((s) => Number.isFinite(s.k) && s.k > 0)
    .sort((a, b) => a.k - b.k);
  if (samples.length === 0) return null;
  const total = samples.reduce((sum, s) => sum + s.weight, 0);
  let acc = 0;
  for (const s of samples) {
    acc += s.weight;
    if (acc >= total / 2) return { k: s.k, windows: samples.length };
  }
  return { k: samples[samples.length - 1]!.k, windows: samples.length };
}

/** Accepts only a well-formed calibration (from disk); anything else → empty. */
export function parseCalibration(input: unknown): CalibrationState {
  if (typeof input !== 'object' || input === null) return EMPTY_CALIBRATION;
  const raw = (input as { limits?: unknown }).limits;
  if (typeof raw !== 'object' || raw === null) return EMPTY_CALIBRATION;
  const limits: Record<string, CalibrationWindow[]> = {};
  for (const [key, list] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(list)) continue;
    const ok = list.filter(
      (w): w is CalibrationWindow =>
        typeof w === 'object' &&
        w !== null &&
        ['resetsAt', 'fromAt', 'fromU', 'toAt', 'toU', 'weight'].every((f) =>
          Number.isFinite((w as Record<string, unknown>)[f]),
        ),
    );
    if (ok.length > 0) {
      limits[key] = ok
        .map((w) => ({ ...w, frozen: w.frozen === true }))
        .slice(-CALIBRATION_WINDOWS);
    }
  }
  return { version: 1, limits };
}
