import { describe, expect, it } from 'vitest';
import { EMPTY_HISTORY, cyclesFor, parseHistory, recordWindows } from './history';
import { H, NOW, win } from './test-helpers';

describe('recordWindows', () => {
  it('starts a cycle per window and keeps the peak across polls', () => {
    let h = recordWindows(EMPTY_HISTORY, [win('seven_day', 0.4, 50 * H)], NOW);
    h = recordWindows(h, [win('seven_day', 0.7, 50 * H - 60_000)], NOW + 60_000);
    h = recordWindows(h, [win('seven_day', 0.65, 50 * H - 120_000)], NOW + 120_000);
    const [c] = cyclesFor(h, 'seven_day');
    expect(cyclesFor(h, 'seven_day')).toHaveLength(1);
    expect(c?.peak).toBe(0.7);
    expect(c?.hitAt).toBeNull();
  });
  it('records the first moment a limit hit 100%', () => {
    let h = recordWindows(EMPTY_HISTORY, [win('five_hour', 0.9, 2 * H)], NOW);
    h = recordWindows(h, [win('five_hour', 1, 2 * H)], NOW + 5 * 60_000);
    h = recordWindows(h, [win('five_hour', 1, 2 * H)], NOW + 10 * 60_000);
    expect(cyclesFor(h, 'five_hour')[0]?.hitAt).toBe(NOW + 5 * 60_000);
  });
  it('treats a new reset time as a new cycle', () => {
    let h = recordWindows(EMPTY_HISTORY, [win('five_hour', 0.5, H)], NOW);
    h = recordWindows(h, [win('five_hour', 0.1, 5 * H)], NOW + 2 * H);
    expect(cyclesFor(h, 'five_hour').map((c) => c.peak)).toEqual([0.5, 0.1]);
  });
  it('ignores dormant windows and returns the same object when nothing changed', () => {
    const h = recordWindows(EMPTY_HISTORY, [win('seven_day', 0.2, 20 * H)], NOW);
    expect(recordWindows(h, [win('seven_day', 0.2, 20 * H), win('nq', 0, null)], NOW)).toBe(h);
  });
  it('forgets 5-hour cycles after two weeks', () => {
    const h = recordWindows(EMPTY_HISTORY, [win('five_hour', 0.5, H)], NOW);
    const later = recordWindows(h, [], NOW + 15 * 24 * H);
    expect(cyclesFor(later, 'five_hour')).toHaveLength(0);
  });
});

describe('parseHistory', () => {
  it('drops malformed entries and anything that is not a history', () => {
    expect(parseHistory(null)).toEqual(EMPTY_HISTORY);
    expect(
      parseHistory({ cycles: [{ key: 'x' }, { key: 'y', resetsAt: 1, peak: 0.5 }] }).cycles,
    ).toHaveLength(1);
  });
});
