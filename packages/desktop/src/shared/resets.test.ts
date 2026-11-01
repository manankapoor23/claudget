import { describe, expect, it } from 'vitest';
import { LATE_MS, NUDGE_WITHIN_MS, WeekRollover, nudgeMessage, weeklyNudge } from './resets';
import { H, NOW, win } from './test-helpers';

describe('weeklyNudge', () => {
  it('nudges within a day of the weekly reset while under half is used', () => {
    expect(weeklyNudge([win('seven_day', 0.38, 20 * H)], NOW)?.key).toBe('seven_day');
    expect(weeklyNudge([win('seven_day', 0.49, NUDGE_WITHIN_MS)], NOW)).not.toBeNull();
  });

  it('stays quiet earlier, at half or more, after the reset, and for other limits', () => {
    expect(weeklyNudge([win('seven_day', 0.38, NUDGE_WITHIN_MS + 1)], NOW)).toBeNull();
    expect(weeklyNudge([win('seven_day', 0.5, 20 * H)], NOW)).toBeNull();
    expect(weeklyNudge([win('seven_day', 0.1, -1)], NOW)).toBeNull();
    expect(weeklyNudge([win('five_hour', 0.1, 2 * H)], NOW)).toBeNull();
    expect(weeklyNudge([win('seven_day_opus', 0.1, 2 * H)], NOW)).toBeNull();
  });

  it('goes by the live estimate when there is one', () => {
    const w = {
      ...win('seven_day', 0.4, 20 * H),
      estimate: { utilization: 0.55, usedPct: 55, basisAt: NOW, afterReset: false },
    };
    expect(weeklyNudge([w], NOW)).toBeNull();
  });
});

describe('nudgeMessage', () => {
  it('says how much is unused and when the week resets', () => {
    const m = nudgeMessage(win('seven_day', 0.38, 20 * H), NOW, 'seven_day@1');
    expect(m).toEqual({
      id: 'reset-seven_day@1',
      title: '62% of your week is unused',
      body: 'Your weekly limit resets in 20h 0m.',
      sound: false,
      urgent: false,
    });
  });
});

describe('WeekRollover', () => {
  const R = NOW + 3 * 24 * H;
  const NEXT = R + 7 * 24 * H;

  it('sweeps once when the clock passes the reset, not again for the new week', () => {
    const r = new WeekRollover();
    expect(r.observe(R, NOW)).toBe(0);
    expect(r.nextAt).toBe(R);
    expect(r.observe(R + 300, R - 1)).toBe(0); // jitter, before the reset
    expect(r.observe(R, R + 1000)).toBe(R); // the stale reading lingers: still one sweep
    expect(r.observe(R + 400, R + 2000)).toBe(R); // a reading moments later, with jitter
    expect(r.nextAt).toBeNull();
    expect(r.observe(NEXT, R + 60_000)).toBe(R); // the new week is watched, no new sweep
    expect(r.nextAt).toBe(NEXT);
    expect(r.observe(NEXT, NEXT + 5)).toBe(NEXT); // ...and swept when it resets
  });

  it('never celebrates a reset already past when first seen', () => {
    const r = new WeekRollover();
    expect(r.observe(NOW - H, NOW)).toBe(0);
    expect(r.observe(R, NOW + 1)).toBe(0);
  });

  it('lets a reset noticed hours late pass quietly', () => {
    const r = new WeekRollover();
    r.observe(R, NOW);
    expect(r.observe(NEXT, R + LATE_MS + 1)).toBe(0);
    expect(r.nextAt).toBe(NEXT);
    expect(r.observe(NEXT, NEXT + 1)).toBe(NEXT);
  });

  it('treats a later reset arriving before the watched one as an early reset', () => {
    const r = new WeekRollover();
    r.observe(R, NOW);
    expect(r.observe(R + 2 * 24 * H, NOW + H)).toBe(R);
    expect(r.nextAt).toBe(R + 2 * 24 * H);
  });

  it('moves the watch quietly when the reset comes earlier', () => {
    const r = new WeekRollover();
    r.observe(R, NOW);
    expect(r.observe(R - 24 * H, NOW + H)).toBe(0);
    expect(r.nextAt).toBe(R - 24 * H);
  });

  it('ignores missing readings', () => {
    const r = new WeekRollover();
    expect(r.observe(null, NOW)).toBe(0);
    expect(r.nextAt).toBeNull();
  });
});
