import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OfficialPollScheduler, type PollReason } from './schedule';

const S = 1000;
const MIN = 60 * S;

let t0 = 0;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-04T10:00:00Z'));
  t0 = Date.now();
});
afterEach(() => {
  vi.useRealTimers();
});

/** A scheduler wired to fake time that records (seconds since start, reason) per poll. */
function harness(opts: { intervalMs?: number; blockedUntil?: () => number } = {}): {
  scheduler: OfficialPollScheduler;
  polls: Array<[number, PollReason]>;
} {
  const polls: Array<[number, PollReason]> = [];
  const scheduler = new OfficialPollScheduler({
    intervalMs: opts.intervalMs ?? 5 * MIN,
    blockedUntil: opts.blockedUntil,
    poll: async (reason) => {
      polls.push([(Date.now() - t0) / S, reason]);
    },
  });
  return { scheduler, polls };
}

describe('OfficialPollScheduler', () => {
  it('idle: polls at start, then every intervalMs', async () => {
    const { scheduler, polls } = harness();
    scheduler.start(true);
    await vi.advanceTimersByTimeAsync(15 * MIN);
    expect(polls).toEqual([
      [0, 'start'],
      [300, 'interval'],
      [600, 'interval'],
      [900, 'interval'],
    ]);
    scheduler.stop();
  });

  it('activity after an idle stretch: checks 30s after work resumes', async () => {
    const { scheduler, polls } = harness();
    scheduler.start(true);
    await vi.advanceTimersByTimeAsync(200 * S);
    scheduler.noteActivity(); // t=200s, last poll 200s ago
    await vi.advanceTimersByTimeAsync(60 * S);
    expect(polls).toEqual([
      [0, 'start'],
      [230, 'activity'],
    ]);
    scheduler.stop();
  });

  it('activity right after a poll waits for the 180s floor', async () => {
    const { scheduler, polls } = harness();
    scheduler.start(true);
    await vi.advanceTimersByTimeAsync(10 * S);
    scheduler.noteActivity();
    await vi.advanceTimersByTimeAsync(200 * S);
    expect(polls).toEqual([
      [0, 'start'],
      [180, 'activity'],
    ]);
    scheduler.stop();
  });

  /**
   * The schedule a working session sees (default 5-minute interval): idle,
   * then 12 minutes of streaming, then idle again. This is the timeline quoted
   * in the PR.
   */
  it('a working session: every 180s while busy, trailing check after, then back to 5 min', async () => {
    const { scheduler, polls } = harness();
    scheduler.start(true);
    await vi.advanceTimersByTimeAsync(400 * S); // idle: polls at 0 and 300
    for (let i = 0; i < 72; i++) {
      // 12 minutes of activity, a transcript change every 10s (t=400s..1110s)
      scheduler.noteActivity();
      await vi.advanceTimersByTimeAsync(10 * S);
    }
    await vi.advanceTimersByTimeAsync(20 * MIN);
    expect(polls).toEqual([
      [0, 'start'],
      [300, 'interval'],
      [480, 'activity'], // first activity at 400 → 430, but the floor says ≥ 300+180
      [660, 'activity'],
      [840, 'activity'],
      [1020, 'activity'],
      [1200, 'activity'], // trailing: catches the end of the burst (last change at 1110)
      [1500, 'interval'],
      [1800, 'interval'],
      [2100, 'interval'],
    ]);
    scheduler.stop();
  });

  it('never makes two automatic polls closer than 180s, whatever the triggers', async () => {
    const { scheduler, polls } = harness({ intervalMs: 3 * MIN });
    scheduler.start(true);
    // Deterministic pseudo-random mix of activity, wake and popover nudges.
    let seed = 7;
    const rand = (): number => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed / 2 ** 31;
    };
    for (let i = 0; i < 2000; i++) {
      const r = rand();
      if (r < 0.5) scheduler.noteActivity();
      else if (r < 0.7) scheduler.nudge('opened');
      else if (r < 0.8) scheduler.nudge('wake');
      await vi.advanceTimersByTimeAsync(Math.floor(rand() * 20 * S));
    }
    scheduler.stop();
    expect(polls.length).toBeGreaterThan(50);
    for (let i = 1; i < polls.length; i++) {
      expect(polls[i]![0] - polls[i - 1]![0]).toBeGreaterThanOrEqual(180);
    }
  });

  it('popover/wake nudges poll only when the last check is at least 180s old', async () => {
    const { scheduler, polls } = harness({ intervalMs: 10 * MIN });
    scheduler.start(true);
    await vi.advanceTimersByTimeAsync(60 * S);
    expect(scheduler.nudge('opened')).toBe(false);
    await vi.advanceTimersByTimeAsync(140 * S); // t=200s
    expect(scheduler.nudge('wake')).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(polls).toEqual([
      [0, 'start'],
      [200, 'wake'],
    ]);
    // The regular cadence restarts from the nudge.
    await vi.advanceTimersByTimeAsync(10 * MIN);
    expect(polls.at(-1)).toEqual([800, 'interval']);
    scheduler.stop();
  });

  it('honours backoff: nothing fires before it ends, not even activity or nudges', async () => {
    let blocked = 0;
    const { scheduler, polls } = harness({ blockedUntil: () => blocked });
    scheduler.start(true);
    await vi.advanceTimersByTimeAsync(0);
    blocked = t0 + 20 * MIN; // e.g. a 429 with Retry-After: 1200
    await vi.advanceTimersByTimeAsync(250 * S);
    // The 300s interval poll was armed before the 429 was known; re-arm via activity.
    scheduler.noteActivity();
    expect(scheduler.nudge('opened')).toBe(false);
    await vi.advanceTimersByTimeAsync(30 * MIN);
    const times = polls.map(([t]) => t);
    expect(times.filter((t) => t > 0 && t < 1200)).toEqual([]);
    expect(times).toContain(1200);
    scheduler.stop();
  });

  it('manual refresh bypasses the gap and resets the cadence', async () => {
    const { scheduler, polls } = harness();
    scheduler.start(true);
    await vi.advanceTimersByTimeAsync(20 * S);
    await scheduler.runNow();
    await vi.advanceTimersByTimeAsync(5 * MIN);
    expect(polls).toEqual([
      [0, 'start'],
      [20, 'manual'],
      [320, 'interval'],
    ]);
    scheduler.stop();
  });

  it('switching polling off and on again does not poll inside the gap', async () => {
    const { scheduler, polls } = harness();
    scheduler.start(true);
    await vi.advanceTimersByTimeAsync(30 * S);
    scheduler.stop();
    scheduler.start(true);
    await vi.advanceTimersByTimeAsync(5 * MIN);
    expect(polls).toEqual([
      [0, 'start'],
      [300, 'interval'],
    ]);
    scheduler.stop();
  });

  it('exposes the planned time of the next poll', async () => {
    const { scheduler } = harness();
    scheduler.start(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(scheduler.nextPollAt).toBe(t0 + 5 * MIN);
    scheduler.stop();
    expect(scheduler.nextPollAt).toBeNull();
  });
});
