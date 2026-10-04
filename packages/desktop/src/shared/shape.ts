/**
 * Window shapes for Linux, where the floating pill can't rely on
 * transparency: without a compositor a transparent window's clear pixels are
 * drawn black, and X11 can't forward mouse moves through an ignored window.
 * A window shape (the X Shape extension, `BrowserWindow.setShape`) clips both
 * what's drawn and what takes clicks, with or without a compositor.
 */
import type { Rect } from './placement';

/**
 * A rounded rectangle as a stack of rectangles, one per pixel row through the
 * rounded corners and one for the straight middle, since a shape is made of
 * rectangles only. Rows are rounded inward so nothing outside the curve shows.
 */
export function roundedRectStrips(r: Rect, radius: number): Rect[] {
  const x = Math.round(r.x);
  const y = Math.round(r.y);
  const w = Math.max(0, Math.round(r.width));
  const h = Math.max(0, Math.round(r.height));
  if (w === 0 || h === 0) return [];
  const rad = Math.max(0, Math.min(Math.round(radius), Math.floor(w / 2), Math.floor(h / 2)));
  if (rad === 0) return [{ x, y, width: w, height: h }];
  const rows: Rect[] = [];
  for (let i = 0; i < rad; i++) {
    // Inset at the vertical centre of row i, measured from the corner circle.
    const dy = rad - (i + 0.5);
    const inset = Math.ceil(rad - Math.sqrt(rad * rad - dy * dy) - 0.25);
    const width = w - inset * 2;
    if (width <= 0) continue;
    rows.push({ x: x + inset, y: y + i, width, height: 1 });
    rows.push({ x: x + inset, y: y + h - 1 - i, width, height: 1 });
  }
  if (h - rad * 2 > 0) rows.push({ x, y: y + rad, width: w, height: h - rad * 2 });
  return rows.sort((a, b) => a.y - b.y);
}

/** Grows a rect by `by` on every side, clipped to `within` (the window). */
export function inflateWithin(r: Rect, by: number, within: Rect): Rect {
  const x0 = Math.max(within.x, Math.floor(r.x - by));
  const y0 = Math.max(within.y, Math.floor(r.y - by));
  const x1 = Math.min(within.x + within.width, Math.ceil(r.x + r.width + by));
  const y1 = Math.min(within.y + within.height, Math.ceil(r.y + r.height + by));
  return { x: x0, y: y0, width: Math.max(0, x1 - x0), height: Math.max(0, y1 - y0) };
}
