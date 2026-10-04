import { describe, expect, it } from 'vitest';
import {
  CALIBRATION_WINDOWS,
  EMPTY_CALIBRATION,
  ingestReading,
  parseCalibration,
  rateFor,
  windowLengthMs,
  type CalibrationState,
  type WeightBetween,
} from './calibration';

const MIN = 60_000;
const H = 60 * MIN;
const T0 = Date.UTC(2026, 9, 4, 10, 0, 0);
/** A 5-hour window that started at T0. */
const RESET = T0 + 5 * H;

/** Usage at a steady $1 per minute from T0 on. */
const steady: WeightBetween = (from, to) => Math.max(0, (to - Math.max(from, T0)) / MIN);

function feed(
  readings: Array<{ at: number; u: number; resetsAt?: number | null; key?: string }>,
  weight: WeightBetween = steady,
  state: CalibrationState = EMPTY_CALIBRATION,
): CalibrationState {
  return readings.reduce(
    (s, r) =>
      ingestReading(
        s,
        {
          key: r.key ?? 'five_hour',
          utilization: r.u,
          resetsAt: r.resetsAt === undefined ? RESET : r.resetsAt,
          at: r.at,
        },
        weight,
      ),
    state,
  );
}

describe('windowLengthMs', () => {
  it('knows the 5-hour and the weekly windows, and nothing else', () => {
    expect(windowLengthMs('five_hour')).toBe(5 * H);
    expect(windowLengthMs('seven_day')).toBe(7 * 24 * H);
    expect(windowLengthMs('seven_day_opus')).toBe(7 * 24 * H);
    expect(windowLengthMs('nimbus_quill')).toBeNull();
  });
});

describe('rateFor', () => {
  it('has no rate without data', () => {
    expect(rateFor(EMPTY_CALIBRATION, 'five_hour')).toBeNull();
  });

  it('learns from a single reading, anchored at the window start (0%)', () => {
    // 60 minutes at $1/min took the window to 30%: k = 0.30 / 60 = 0.005 per $.
    const s = feed([{ at: T0 + 60 * MIN, u: 0.3 }]);
    expect(rateFor(s, 'five_hour')?.k).toBeCloseTo(0.005, 6);
  });

  it('learns from a pair of readings in the same window', () => {
    // Unknown window length: anchored at the first reading instead.
    const s = feed([
      { at: T0 + 10 * MIN, u: 0.1, key: 'nimbus' },
      { at: T0 + 30 * MIN, u: 0.2, key: 'nimbus' },
    ]);
    expect(rateFor(s, 'nimbus')?.k).toBeCloseTo(0.1 / 20, 6);
  });

  it('is not fooled by the endpoint rounding to whole percents across many pairs', () => {
    // True rate 0.4 points per 3-minute poll; readings round to whole percents,
    // so most pairs read Δ = 0 and some Δ = 1. Requiring Δ > 0 per pair would
    // learn 1 pt / 3 min, 2.5× too fast; the window total is not fooled.
    const readings = [];
    for (let i = 1; i <= 40; i++) {
      const at = T0 + i * 3 * MIN;
      readings.push({ at, u: Math.round(0.4 * i) / 100 });
    }
    const s = feed(readings);
    const truth = 0.004 / 3; // per $ (3 min = $3)
    expect(rateFor(s, 'five_hour')!.k / truth).toBeGreaterThan(0.95);
    expect(rateFor(s, 'five_hour')!.k / truth).toBeLessThan(1.05);
  });

  it('waits until a window has moved at least 3 points', () => {
    const s = feed([{ at: T0 + 10 * MIN, u: 0.02 }]);
    expect(rateFor(s, 'five_hour')).toBeNull();
  });

  it('keeps windows apart across a reset, and blends them by a weighted median', () => {
    const next = RESET + 5 * H;
    const s = feed([
      { at: T0 + 100 * MIN, u: 0.5 }, // k = 0.005
      { at: RESET + 100 * MIN, u: 0.4, resetsAt: next }, // k = 0.004
    ]);
    expect(s.limits['five_hour']).toHaveLength(2);
    const r = rateFor(s, 'five_hour')!;
    expect(r.windows).toBe(2);
    expect([0.004, 0.005]).toContainEqual(Number(r.k.toFixed(6)));
  });

  it('shrugs off an outlier window (usage on another device)', () => {
    const windows = [0.005, 0.0052, 0.0049, 0.0051, 0.012 /* claude.ai binge */];
    let s = EMPTY_CALIBRATION;
    windows.forEach((k, i) => {
      const resetsAt = RESET + i * 5 * H;
      const start = resetsAt - 5 * H;
      s = ingestReading(
        s,
        { key: 'five_hour', utilization: k * 60, resetsAt, at: start + 60 * MIN },
        (from, to) => (to - from) / MIN,
      );
    });
    expect(rateFor(s, 'five_hour')!.k).toBeCloseTo(0.0051, 4);
  });

  it('ignores readings once the window is saturated at 100%', () => {
    const s = feed([
      { at: T0 + 60 * MIN, u: 0.3 },
      { at: T0 + 90 * MIN, u: 1 },
      { at: T0 + 200 * MIN, u: 1 },
    ]);
    const w = s.limits['five_hour']![0]!;
    expect(w.frozen).toBe(true);
    expect(rateFor(s, 'five_hour')?.k).toBeCloseTo(0.005, 6);
  });

  it('re-anchors when a reading drops inside the same window', () => {
    const s = feed([
      { at: T0 + 60 * MIN, u: 0.3 },
      { at: T0 + 70 * MIN, u: 0.1 },
    ]);
    const w = s.limits['five_hour']![0]!;
    expect(w.fromAt).toBe(T0 + 70 * MIN);
    expect(w.fromU).toBeCloseTo(0.1);
  });

  it('treats reset times that jitter by seconds as the same window', () => {
    const s = feed([
      { at: T0 + 60 * MIN, u: 0.3, resetsAt: RESET + 250 },
      { at: T0 + 90 * MIN, u: 0.45, resetsAt: RESET - 400 },
    ]);
    expect(s.limits['five_hour']).toHaveLength(1);
    expect(s.limits['five_hour']![0]!.weight).toBeCloseTo(90);
  });

  it('splits a long (weekly) window into records of at most five hours', () => {
    const week = T0 + 7 * 24 * H; // resets in a week: started at T0
    const s = feed([
      { at: T0 + 24 * H, u: 0.3, key: 'seven_day', resetsAt: week },
      { at: T0 + 25 * H, u: 0.31, key: 'seven_day', resetsAt: week },
      { at: T0 + 27 * H, u: 0.34, key: 'seven_day', resetsAt: week },
    ]);
    const records = s.limits['seven_day']!;
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({ fromAt: T0, fromU: 0, toAt: T0 + 24 * H });
    expect(records[1]).toMatchObject({ fromAt: T0 + 24 * H, toAt: T0 + 27 * H });
    expect(records[1]!.toU).toBeCloseTo(0.34);
    expect(records[1]!.weight).toBeCloseTo(180);
  });

  it('keeps only the most recent windows', () => {
    let s = EMPTY_CALIBRATION;
    for (let i = 0; i < CALIBRATION_WINDOWS + 3; i++) {
      s = feed([{ at: T0 + i * 5 * H + 60 * MIN, u: 0.3, resetsAt: RESET + i * 5 * H }], steady, s);
    }
    expect(s.limits['five_hour']).toHaveLength(CALIBRATION_WINDOWS);
  });

  it('returns the same object for a reading it already has, or one without a reset time', () => {
    const s = feed([{ at: T0 + 60 * MIN, u: 0.3 }]);
    expect(feed([{ at: T0 + 60 * MIN, u: 0.3 }], steady, s)).toBe(s);
    expect(feed([{ at: T0 + 70 * MIN, u: 0.3, resetsAt: null }], steady, s)).toBe(s);
  });
});

describe('parseCalibration', () => {
  it('round-trips through JSON (what persistence relies on)', () => {
    const s = feed([
      { at: T0 + 60 * MIN, u: 0.3 },
      { at: T0 + 60 * MIN, u: 0.1, key: 'seven_day', resetsAt: T0 + 3 * 24 * H },
    ]);
    const back = parseCalibration(JSON.parse(JSON.stringify(s)));
    expect(back).toEqual(s);
    expect(rateFor(back, 'five_hour')?.k).toBeCloseTo(0.005, 6);
  });

  it('drops anything malformed instead of throwing', () => {
    expect(parseCalibration(null)).toEqual(EMPTY_CALIBRATION);
    expect(parseCalibration({ limits: 'x' })).toEqual(EMPTY_CALIBRATION);
    expect(parseCalibration({ limits: { five_hour: [{ resetsAt: 'soon' }] } })).toEqual(
      EMPTY_CALIBRATION,
    );
  });
});
