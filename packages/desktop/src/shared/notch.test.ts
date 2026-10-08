import { describe, expect, it } from 'vitest';
import type { OfficialWindow, UsageSnapshot } from '@claude-widget/core';
import { notchPayload } from './notch';
import { H, NOW, win } from './test-helpers';

function snap(windows: OfficialWindow[], available = true): UsageSnapshot {
  return { official: { available, windows } } as unknown as UsageSnapshot;
}

describe('notchPayload', () => {
  it('carries the 5-hour % as a whole number, with its tone and reset', () => {
    const p = notchPayload(
      snap([win('five_hour', 0.624, 2 * H), win('seven_day', 0.31, 50 * H)]),
      NOW,
    );
    expect(p.fiveHour).toEqual({ pct: 62, estimated: false, tone: 'ok', resetsAt: NOW + 2 * H });
    expect(p.weekly).toEqual({ pct: 31, estimated: false });
  });

  it('uses the same thresholds as the pill: amber from 70%, red from 90%', () => {
    expect(notchPayload(snap([win('five_hour', 0.69, H)]), NOW).fiveHour?.tone).toBe('ok');
    expect(notchPayload(snap([win('five_hour', 0.7, H)]), NOW).fiveHour?.tone).toBe('warn');
    expect(notchPayload(snap([win('five_hour', 0.9, H)]), NOW).fiveHour?.tone).toBe('bad');
  });

  it('shows the live estimate, marked, in place of the reading', () => {
    const five = {
      ...win('five_hour', 0.6, 2 * H),
      estimate: { utilization: 0.72, usedPct: 72, basisAt: NOW - 60_000, afterReset: false },
    };
    const p = notchPayload(snap([five]), NOW);
    expect(p.fiveHour).toMatchObject({ pct: 72, estimated: true, tone: 'warn' });
  });

  it('hides the line without plan limits or without a 5-hour window', () => {
    const none = { fiveHour: null, weekly: null, fullAt: null };
    expect(notchPayload(snap([win('five_hour', 0.5, H)], false), NOW)).toEqual(none);
    expect(notchPayload(snap([win('seven_day', 0.5, H)]), NOW)).toEqual(none);
    expect(notchPayload(snap([]), NOW)).toEqual(none);
  });

  it('clamps out-of-range readings', () => {
    expect(notchPayload(snap([win('five_hour', 1.4, H)]), NOW).fiveHour?.pct).toBe(100);
    expect(notchPayload(snap([win('five_hour', -0.1, H)]), NOW).fiveHour?.pct).toBe(0);
  });

  it('projects when it fills, to the minute, so a newer snapshot is identical', () => {
    // 2.5h into the window at 60%: full in another ~1h40m, before the reset.
    const s = snap([win('five_hour', 0.6, 2.5 * H)]);
    const a = notchPayload(s, NOW);
    expect(a.fullAt).not.toBeNull();
    expect(a.fullAt! % 60_000).toBe(0);
    expect(JSON.stringify(notchPayload(s, NOW + 1000))).toBe(JSON.stringify(a));
  });

  it('has no "full by" once at the limit, or when it will not fill before the reset', () => {
    expect(notchPayload(snap([win('five_hour', 1, H)]), NOW).fullAt).toBeNull();
    expect(notchPayload(snap([win('five_hour', 0.1, H)]), NOW).fullAt).toBeNull();
  });
});
