import { describe, expect, it } from 'vitest';
import { paceFor, projectedFullAt } from './pace';
import { H, NOW, win } from './test-helpers';

describe('paceFor', () => {
  it('measures how much of the window has elapsed', () => {
    const pace = paceFor(win('five_hour', 0.3, 2.5 * H), NOW);
    expect(pace?.elapsedPct).toBeCloseTo(50);
    expect(pace?.tone).toBe('ok');
  });
  it('is null for windows of unknown length or with no reset', () => {
    expect(paceFor(win('mystery', 0.3, H), NOW)).toBeNull();
    expect(paceFor(win('five_hour', 0.3, null), NOW)).toBeNull();
  });
});

describe('projectedFullAt', () => {
  it('projects a straight line to 100% when that lands before the reset', () => {
    // 2.5h elapsed, 60% used → 24%/h → the remaining 40% takes 1h40m.
    const at = projectedFullAt(win('five_hour', 0.6, 2.5 * H), NOW);
    expect(at).not.toBeNull();
    expect((at! - NOW) / H).toBeCloseTo(40 / 24, 5);
  });
  it('stays quiet when the pace finishes after the reset', () => {
    expect(projectedFullAt(win('five_hour', 0.3, 2.5 * H), NOW)).toBeNull();
  });
  it('refuses to project from too little of the window', () => {
    // Only 6 minutes (2%) in.
    expect(projectedFullAt(win('five_hour', 0.2, 4.9 * H), NOW)).toBeNull();
  });
  it('is "now" once the limit is already full', () => {
    expect(projectedFullAt(win('seven_day', 1, 10 * H), NOW)).toBe(NOW);
  });
});
