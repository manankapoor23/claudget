import { describe, expect, it } from 'vitest';
import type { OfficialWindow } from '../types';
import { ESTIMATE_SAFETY, MAX_ESTIMATE_GAIN, estimateWindow } from './estimate';

const MIN = 60_000;
const H = 60 * MIN;
const READ_AT = Date.UTC(2026, 9, 4, 12, 0, 0);

function win(u: number, resetsAt: number | null = READ_AT + 3 * H): OfficialWindow {
  return {
    key: 'five_hour',
    label: '5-Hour',
    utilization: u,
    usedPct: u * 100,
    remainingPct: 100 - u * 100,
    resetsAt,
    used: null,
    limit: null,
  };
}

/** $1 of usage per minute since `from`, up to `now`. */
const perMinute =
  (now: number) =>
  (from: number): number =>
    Math.max(0, (now - from) / MIN);

describe('estimateWindow', () => {
  it('is null without a calibration: the official value shows as is', () => {
    const now = READ_AT + 3 * MIN;
    expect(
      estimateWindow({
        window: win(0.6),
        readingAt: READ_AT,
        now,
        rate: null,
        weightSince: perMinute(now),
      }),
    ).toBeNull();
  });

  it('adds the damped rate × usage since the reading', () => {
    const now = READ_AT + 2 * MIN; // $2 since the reading
    const e = estimateWindow({
      window: win(0.6),
      readingAt: READ_AT,
      now,
      rate: 0.01, // 1 point per $
      weightSince: perMinute(now),
    })!;
    expect(e.utilization).toBeCloseTo(0.6 + ESTIMATE_SAFETY * 0.02, 9);
    expect(e.afterReset).toBe(false);
    expect(e.basisAt).toBe(READ_AT);
  });

  it('uses only usage after the reading', () => {
    let askedFrom: number | null = null;
    estimateWindow({
      window: win(0.6),
      readingAt: READ_AT,
      now: READ_AT + MIN,
      rate: 0.01,
      weightSince: (from) => {
        askedFrom = from;
        return 1;
      },
    });
    expect(askedFrom).toBe(READ_AT);
  });

  it('clamps to 100% and never below the official reading', () => {
    const now = READ_AT + 500 * MIN;
    const over = estimateWindow({
      window: win(0.95, READ_AT + 9 * H),
      readingAt: READ_AT,
      now,
      rate: 0.01,
      weightSince: perMinute(now),
    })!;
    expect(over.utilization).toBe(1);
    const negative = estimateWindow({
      window: win(0.4),
      readingAt: READ_AT,
      now: READ_AT + MIN,
      rate: 0.01,
      weightSince: () => -50,
    });
    expect(negative).toBeNull(); // nothing to add: the official 40% stands
  });

  it('never adds more than MAX_ESTIMATE_GAIN when readings stop coming', () => {
    const now = READ_AT + 4 * H; // four hours of use and no reading since
    const e = estimateWindow({
      window: win(0.3, READ_AT + 5 * H),
      readingAt: READ_AT,
      now,
      rate: 0.01,
      weightSince: perMinute(now),
    })!;
    expect(e.utilization).toBeCloseTo(0.3 + MAX_ESTIMATE_GAIN, 9);
  });

  it("is null when it wouldn't change the whole-number percent shown", () => {
    const now = READ_AT + MIN;
    expect(
      estimateWindow({
        window: win(0.6),
        readingAt: READ_AT,
        now,
        rate: 0.001, // +0.09 points
        weightSince: perMinute(now),
      }),
    ).toBeNull();
  });

  it('starts from 0 plus usage since the reset once the window has reset', () => {
    const resetsAt = READ_AT + 10 * MIN;
    const now = resetsAt + 5 * MIN;
    const e = estimateWindow({
      window: win(0.98, resetsAt),
      readingAt: READ_AT,
      now,
      rate: 0.01,
      weightSince: perMinute(now),
    })!;
    expect(e.afterReset).toBe(true);
    expect(e.utilization).toBeCloseTo(ESTIMATE_SAFETY * 0.05, 9);
  });

  it('marks a reset window as estimated even with no usage since', () => {
    const resetsAt = READ_AT + 10 * MIN;
    const e = estimateWindow({
      window: win(0.98, resetsAt),
      readingAt: READ_AT,
      now: resetsAt + MIN,
      rate: 0.01,
      weightSince: () => 0,
    })!;
    expect(e).toMatchObject({ utilization: 0, afterReset: true });
  });
});
