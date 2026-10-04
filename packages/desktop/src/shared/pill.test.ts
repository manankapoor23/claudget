import { describe, expect, it } from 'vitest';
import {
  anchorFor,
  anchorShift,
  dragTarget,
  leadCursor,
  trackCursor,
  type CursorSample,
} from './pill';

const SCREEN = { x: 0, y: 25, width: 1440, height: 875 };
const PILL = { width: 236, height: 40 };

describe('dragTarget', () => {
  it('keeps the press point under the cursor, in whole pixels', () => {
    expect(dragTarget({ x: 500, y: 300 }, { x: 40.4, y: 20.6 })).toEqual({ x: 460, y: 279 });
  });
  it('never hands Electron a negative zero', () => {
    // Pressed 10.3px in, dragged to the top-left edge: Math.round(-0.3) is -0,
    // which setPosition rejects (#14).
    const to = dragTarget({ x: 10, y: 10 }, { x: 10.3, y: 10.3 });
    expect(Object.is(to?.x, 0)).toBe(true);
    expect(Object.is(to?.y, 0)).toBe(true);
  });
  it('allows real negative positions on displays left of or above the primary', () => {
    expect(dragTarget({ x: -800, y: -200 }, { x: 30, y: 20 })).toEqual({ x: -830, y: -220 });
  });
  it('refuses offsets that are not numbers', () => {
    expect(dragTarget({ x: 10, y: 10 }, { x: NaN, y: 0 })).toBeNull();
    expect(dragTarget({ x: 10, y: 10 }, { x: 0, y: Infinity })).toBeNull();
    expect(dragTarget({ x: 10, y: 10 }, { x: 0, y: undefined as unknown as number })).toBeNull();
  });
});

describe('trackCursor', () => {
  it('keeps only positions that changed, stamped when first seen', () => {
    const h: CursorSample[] = [];
    trackCursor(h, { x: 10, y: 10, t: 0 });
    trackCursor(h, { x: 10, y: 10, t: 8 });
    trackCursor(h, { x: 14, y: 10, t: 16 });
    expect(h).toEqual([
      { x: 10, y: 10, t: 0 },
      { x: 14, y: 10, t: 16 },
    ]);
  });
  it('forgets movement older than the velocity window, but keeps two points', () => {
    const h: CursorSample[] = [];
    for (let t = 0; t <= 80; t += 8) trackCursor(h, { x: t, y: 0, t });
    expect(h[0]!.t).toBeGreaterThanOrEqual(80 - 40);
    const paused: CursorSample[] = [{ x: 0, y: 0, t: 0 }];
    trackCursor(paused, { x: 5, y: 0, t: 1000 });
    expect(paused).toHaveLength(2);
  });
});

describe('leadCursor', () => {
  // 1 px/ms to the right, last seen just now.
  const moving: CursorSample[] = [
    { x: 100, y: 50, t: 0 },
    { x: 108, y: 50, t: 8 },
    { x: 116, y: 50, t: 16 },
  ];
  it('aims ahead along the direction of travel', () => {
    expect(leadCursor(moving, 18, 8)).toEqual({ x: 124, y: 50 });
  });
  it('sits exactly on the cursor once it stops', () => {
    expect(leadCursor(moving, 16 + 30, 8)).toEqual({ x: 116, y: 50 });
  });
  it('does not guess from a single reading or with no lead', () => {
    expect(leadCursor([{ x: 3, y: 4, t: 0 }], 1, 8)).toEqual({ x: 3, y: 4 });
    expect(leadCursor(moving, 18, 0)).toEqual({ x: 116, y: 50 });
    expect(leadCursor([], 0, 8)).toBeNull();
  });
  it('never aims more than a few pixels ahead, however fast the flick', () => {
    const flick: CursorSample[] = [
      { x: 0, y: 0, t: 0 },
      { x: 300, y: 400, t: 10 },
    ];
    const aim = leadCursor(flick, 10, 8)!;
    expect(Math.hypot(aim.x - 300, aim.y - 400)).toBeCloseTo(16);
  });
  it('works across displays left of and above the primary', () => {
    const h: CursorSample[] = [
      { x: -900, y: -300, t: 0 },
      { x: -908, y: -304, t: 8 },
    ];
    const to = dragTarget(leadCursor(h, 8, 8)!, { x: 20, y: 10 });
    expect(to).toEqual({ x: -936, y: -318 });
  });
  it('can feed dragTarget without producing a negative zero', () => {
    const h: CursorSample[] = [
      { x: 10.3, y: 10.3, t: 0 },
      { x: 10.3, y: 10.3 - 0.0001, t: 8 },
    ];
    const to = dragTarget(leadCursor(h, 8, 8)!, { x: 10.6, y: 10.6 });
    expect(Object.is(to?.x, 0) && Object.is(to?.y, 0)).toBe(true);
  });
});

describe('anchorFor', () => {
  it('opens toward the middle of the screen', () => {
    expect(anchorFor({ ...PILL, x: 1180, y: 40 }, SCREEN)).toEqual({ x: 'right', y: 'top' });
    expect(anchorFor({ ...PILL, x: 20, y: 800 }, SCREEN)).toEqual({ x: 'left', y: 'bottom' });
  });
  it('respects a work area that does not start at the origin', () => {
    const right = { x: 1440, y: 0, width: 1920, height: 1080 };
    expect(anchorFor({ ...PILL, x: 1500, y: 900 }, right)).toEqual({ x: 'left', y: 'bottom' });
  });
});

describe('anchorShift', () => {
  const room = { x: 84, y: 104 };
  it('moves the window against the pill so the pill stays put', () => {
    // The pill moves right inside its window, so the window moves left.
    expect(anchorShift({ x: 'left', y: 'top' }, { x: 'right', y: 'top' }, room)).toEqual({
      x: -84,
      y: 0,
    });
    expect(anchorShift({ x: 'right', y: 'bottom' }, { x: 'left', y: 'top' }, room)).toEqual({
      x: 84,
      y: 104,
    });
  });
  it('is a clean no-op when the corner is unchanged', () => {
    const a = { x: 'right', y: 'top' } as const;
    const s = anchorShift(a, a, room);
    expect(Object.is(s.x, 0) && Object.is(s.y, 0)).toBe(true);
  });
});
