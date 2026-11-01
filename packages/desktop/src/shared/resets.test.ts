import { describe, expect, it } from 'vitest';
import { NUDGE_WITHIN_MS, WeekRollover, nudgeMessage, parseRollover, weeklyNudge } from './resets';
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

  it('has a sweep pending once the reset passes, until it has been shown', () => {
    const r = new WeekRollover();
    r.observe(R, NOW);
    expect(r.pending).toBe(0);
    expect(r.nextAt).toBe(R);
    r.observe(R + 300, R - 1); // jitter, before the reset
    expect(r.pending).toBe(0);
    r.observe(R, R + 1000); // the stale reading lingers
    expect(r.pending).toBe(R);
    r.observe(R + 400, R + 2000); // a reading moments later, with jitter
    expect(r.nextAt).toBeNull();
    r.markShown(R);
    expect(r.pending).toBe(0);
    r.observe(NEXT, R + 60_000); // the new week is watched, nothing pending
    expect([r.pending, r.nextAt]).toEqual([0, NEXT]);
    r.observe(NEXT, NEXT + 5);
    expect(r.pending).toBe(NEXT);
  });

  it('keeps a missed sweep for whenever the user is back, however late', () => {
    const r = new WeekRollover();
    r.observe(R, NOW);
    r.observe(NEXT, R + 30 * H); // woke the next day, with the new week's reading
    expect(r.pending).toBe(R);
    expect(r.nextAt).toBe(NEXT);
  });

  it('notices a reset that passed while claudget was quit', () => {
    const before = new WeekRollover();
    before.observe(R, NOW);
    const saved = parseRollover(JSON.parse(JSON.stringify(before.state)));
    const after = new WeekRollover(saved);
    after.observe(R, R + 2 * H); // the launch reading is still the old week
    expect(after.pending).toBe(R);
  });

  it('never celebrates a reset already past on the very first run', () => {
    const r = new WeekRollover();
    r.observe(NOW - H, NOW);
    r.observe(R, NOW + 1);
    expect(r.pending).toBe(0);
  });

  it('treats a later reset arriving before the watched one as an early reset', () => {
    const r = new WeekRollover();
    r.observe(R, NOW);
    r.observe(R + 2 * 24 * H, NOW + H);
    expect([r.pending, r.nextAt]).toEqual([R, R + 2 * 24 * H]);
  });

  it('moves the watch quietly when the reset comes earlier', () => {
    const r = new WeekRollover();
    r.observe(R, NOW);
    r.observe(R - 24 * H, NOW + H);
    expect([r.pending, r.nextAt]).toEqual([0, R - 24 * H]);
  });

  it('never goes back to an older sweep once a newer one is shown', () => {
    const r = new WeekRollover({ watching: null, passed: R, shown: NEXT });
    expect(r.pending).toBe(0);
    r.markShown(R);
    expect(r.state.shown).toBe(NEXT);
  });

  it('ignores missing readings and bad ids', () => {
    const r = new WeekRollover();
    r.observe(null, NOW);
    r.markShown(Number.NaN);
    expect(r.state).toEqual({ watching: null, passed: null, shown: null });
  });
});

describe('parseRollover', () => {
  it('keeps numbers and drops anything else', () => {
    expect(parseRollover({ watching: 5, passed: 'x', shown: null })).toEqual({
      watching: 5,
      passed: null,
      shown: null,
    });
    expect(parseRollover('nope')).toEqual({ watching: null, passed: null, shown: null });
  });
});
