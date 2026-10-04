import { describe, expect, it } from 'vitest';
import { inflateWithin, roundedRectStrips } from './shape';

describe('roundedRectStrips', () => {
  it('is a plain rect with no radius', () => {
    expect(roundedRectStrips({ x: 10, y: 20, width: 100, height: 40 }, 0)).toEqual([
      { x: 10, y: 20, width: 100, height: 40 },
    ]);
  });

  it('covers a capsule row by row, inset at the ends, never outside the curve', () => {
    const r = { x: 0, y: 0, width: 236, height: 40 };
    const strips = roundedRectStrips(r, 20);
    // Every pixel row is covered exactly once.
    const rows = new Map<number, number>();
    for (const s of strips)
      for (let y = s.y; y < s.y + s.height; y++) rows.set(y, (rows.get(y) ?? 0) + 1);
    expect([...rows.keys()].sort((a, b) => a - b)).toEqual(Array.from({ length: 40 }, (_, i) => i));
    expect([...rows.values()].every((n) => n === 1)).toBe(true);
    // Symmetric, narrowest at the very top and bottom, full width in the middle.
    const top = strips.find((s) => s.y === 0)!;
    const bottom = strips.find((s) => s.y + s.height === 40)!;
    expect(top.x).toBe(bottom.x);
    expect(top.width).toBe(bottom.width);
    expect(top.x).toBeGreaterThan(10);
    expect(top.x + top.width).toBe(236 - top.x);
    // No pixel whose centre lies outside the rounded outline.
    for (const s of strips) {
      for (const px of [s.x, s.x + s.width - 1]) {
        const cy = s.y + 0.5;
        const cx = px + 0.5;
        const ccx = cx < 118 ? 20 : 216;
        const ccy = 20; // a capsule: both end circles are centred mid-height
        if (cx > 20 && cx < 216) continue;
        expect(Math.hypot(cx - ccx, cy - ccy)).toBeLessThanOrEqual(20.75);
      }
    }
  });

  it('clamps an oversized radius and handles empty rects', () => {
    expect(roundedRectStrips({ x: 0, y: 0, width: 0, height: 10 }, 4)).toEqual([]);
    const s = roundedRectStrips({ x: 0, y: 0, width: 10, height: 10 }, 50);
    expect(s.every((r) => r.width > 0 && r.x >= 0 && r.x + r.width <= 10)).toBe(true);
  });
});

describe('inflateWithin', () => {
  it('grows by the halo but stays inside the window', () => {
    const win = { x: 0, y: 0, width: 356, height: 180 };
    expect(inflateWithin({ x: 102, y: 18, width: 236, height: 40 }, 18, win)).toEqual({
      x: 84,
      y: 0,
      width: 272,
      height: 76,
    });
  });
});
