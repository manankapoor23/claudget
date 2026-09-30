import { describe, expect, it } from 'vitest';
import { dragTarget } from './pill';

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
