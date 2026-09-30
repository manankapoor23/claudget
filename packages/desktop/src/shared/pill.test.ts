import { describe, expect, it } from 'vitest';
import { anchorFor, anchorShift, dragTarget } from './pill';

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
