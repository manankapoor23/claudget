import { describe, expect, it } from 'vitest';
import {
  anchorEdge,
  floatingDefaults,
  isEmptyRect,
  placePopover,
  popoverAnchor,
  type Rect,
} from './placement';

const SIZE = { width: 360, height: 540 };
const GAP = 6;
const inside = (p: { x: number; y: number }, wa: Rect): boolean =>
  p.x >= wa.x &&
  p.y >= wa.y &&
  p.x + SIZE.width <= wa.x + wa.width &&
  p.y + SIZE.height <= wa.y + wa.height;

describe('placePopover', () => {
  it('drops down from the macOS menu bar, centred under the icon (as before)', () => {
    const wa = { x: 0, y: 25, width: 1512, height: 957 };
    const icon = { x: 1200, y: 0, width: 30, height: 24 };
    const p = placePopover(icon, wa, SIZE, GAP);
    expect(p).toMatchObject({ edge: 'top', dropsDown: true });
    expect(p.x).toBe(Math.round(1215 - 180));
    expect(p.y).toBe(25 + GAP);
  });

  it('pops up above a bottom Windows taskbar', () => {
    const wa = { x: 0, y: 0, width: 1024, height: 720 };
    const icon = { x: 797, y: 720, width: 32, height: 48 };
    const p = placePopover(icon, wa, SIZE, GAP);
    expect(p.edge).toBe('bottom');
    expect(p.dropsDown).toBe(false);
    expect(p.y + SIZE.height).toBe(720 - GAP);
    expect(inside(p, wa)).toBe(true);
  });

  it('drops down from a top taskbar', () => {
    const wa = { x: 0, y: 48, width: 1024, height: 720 };
    const p = placePopover({ x: 900, y: 0, width: 32, height: 48 }, wa, SIZE, GAP);
    expect(p).toMatchObject({ edge: 'top', dropsDown: true, y: 48 + GAP });
    expect(inside(p, wa)).toBe(true);
  });

  it('sits beside a left taskbar, level with the icon', () => {
    const wa = { x: 62, y: 0, width: 1858, height: 1080 };
    const icon = { x: 15, y: 900, width: 32, height: 32 };
    const p = placePopover(icon, wa, SIZE, GAP);
    expect(p.edge).toBe('left');
    expect(p.x).toBe(62 + GAP);
    expect(inside(p, wa)).toBe(true);
  });

  it('sits beside a right taskbar', () => {
    const wa = { x: 0, y: 0, width: 1858, height: 1080 };
    const p = placePopover({ x: 1873, y: 40, width: 32, height: 32 }, wa, SIZE, GAP);
    expect(p.edge).toBe('right');
    expect(p.x + SIZE.width).toBe(1858 - GAP);
    expect(p.y).toBe(GAP);
  });

  it('anchors at the click on a Linux top panel (tray reports no bounds)', () => {
    const wa = { x: 0, y: 32, width: 1920, height: 1048 };
    const p = placePopover({ x: 1909, y: 15, width: 1, height: 1 }, wa, SIZE, GAP);
    expect(p).toMatchObject({ edge: 'top', y: 32 + GAP });
    // Clamped against the right edge, not centred off-screen.
    expect(p.x + SIZE.width).toBe(1920 - GAP);
  });

  it('pops up from a click on a Linux bottom panel', () => {
    const wa = { x: 0, y: 0, width: 1920, height: 1048 };
    const p = placePopover({ x: 1909, y: 1063, width: 1, height: 1 }, wa, SIZE, GAP);
    expect(p.edge).toBe('bottom');
    expect(p.y + SIZE.height).toBe(1048 - GAP);
    expect(inside(p, wa)).toBe(true);
  });

  it('uses the nearest edge when the anchor is inside the work area', () => {
    const wa = { x: 0, y: 0, width: 1920, height: 1080 };
    expect(anchorEdge({ x: 1000, y: 1075, width: 1, height: 1 }, wa)).toBe('bottom');
    expect(anchorEdge({ x: 1000, y: 3, width: 1, height: 1 }, wa)).toBe('top');
  });

  it('works on a second display at negative coordinates', () => {
    const wa = { x: -1440, y: 25, width: 1440, height: 875 };
    const p = placePopover({ x: -100, y: 0, width: 24, height: 24 }, wa, SIZE, GAP);
    expect(inside(p, wa)).toBe(true);
    expect(p.y).toBe(25 + GAP);
  });

  it('stays inside a work area shorter than the popover', () => {
    const wa = { x: 0, y: 0, width: 800, height: 500 };
    const p = placePopover({ x: 700, y: 500, width: 30, height: 40 }, wa, SIZE, GAP);
    expect(p.y).toBe(GAP);
  });
});

describe('popoverAnchor', () => {
  it('prefers real tray bounds', () => {
    const b = { x: 1, y: 2, width: 3, height: 4 };
    expect(popoverAnchor(b, { x: 9, y: 9 })).toBe(b);
  });
  it('falls back to the pointer when the tray reports zeros', () => {
    expect(popoverAnchor({ x: 0, y: 0, width: 0, height: 0 }, { x: 5, y: 6 })).toEqual({
      x: 5,
      y: 6,
      width: 1,
      height: 1,
    });
  });
  it('gives up without either', () => {
    expect(popoverAnchor(null, null)).toBeNull();
    expect(isEmptyRect({ x: 3, y: 3, width: 0, height: 10 })).toBe(true);
  });
});

describe('floatingDefaults', () => {
  const PILL = { width: 356, height: 180 };
  const BAR = { width: 580, height: 96 };
  const M = { pill: 12, bar: 16 };
  const overlaps = (a: Rect, b: Rect): boolean =>
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

  for (const [w, h] of [
    [1024, 720],
    [1280, 760],
    [1366, 728],
    [1920, 1040],
    [2560, 1400],
    [800, 560],
  ] as const) {
    it(`keeps the bar off the pill at ${w}×${h}`, () => {
      const wa = { x: 0, y: 0, width: w, height: h };
      const d = floatingDefaults(wa, PILL, BAR, M);
      expect(overlaps({ ...d.pill, ...PILL }, { ...d.bar, ...BAR })).toBe(false);
      expect(d.bar.x).toBeGreaterThanOrEqual(0);
      expect(d.bar.x + BAR.width).toBeLessThanOrEqual(w);
    });
  }

  it('keeps the bar centred when there is room (unchanged on big screens)', () => {
    const wa = { x: 0, y: 25, width: 1920, height: 1055 };
    const d = floatingDefaults(wa, PILL, BAR, M);
    expect(d.bar).toEqual({ x: 670, y: 25 + 16 });
    expect(d.pill).toEqual({ x: 1920 - 356 - 12, y: 25 + 12 });
  });

  it('slides the bar left of the pill at 1024 wide', () => {
    const d = floatingDefaults({ x: 0, y: 0, width: 1024, height: 720 }, PILL, BAR, M);
    expect(d.bar).toEqual({ x: 656 - 16 - 580, y: 16 });
  });
});
