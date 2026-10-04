/**
 * Where windows go: the popover next to the tray, and the floating pill and
 * bar on first show. Pure geometry, so it's testable without Electron.
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface Point {
  x: number;
  y: number;
}
export interface Size {
  width: number;
  height: number;
}

/** True for the all-zero bounds Linux trays (and failed lookups) report. */
export function isEmptyRect(r: Rect | null | undefined): boolean {
  return !r || r.width <= 0 || r.height <= 0;
}

/** Which screen edge the tray (or the click on it) sits against. */
export type Edge = 'top' | 'bottom' | 'left' | 'right';

/**
 * The edge of the work area the anchor belongs to. A taskbar or panel sits
 * outside the work area, so an anchor beyond one of its sides is on that edge.
 * If the anchor is inside the work area (an auto-hiding panel, or a tray that
 * reports odd bounds), the nearest edge wins.
 */
export function anchorEdge(anchor: Rect, workArea: Rect): Edge {
  const cx = anchor.x + anchor.width / 2;
  const cy = anchor.y + anchor.height / 2;
  const right = workArea.x + workArea.width;
  const bottom = workArea.y + workArea.height;
  if (cy >= bottom) return 'bottom';
  if (cy < workArea.y) return 'top';
  if (cx >= right) return 'right';
  if (cx < workArea.x) return 'left';
  const d: Array<[Edge, number]> = [
    ['top', cy - workArea.y],
    ['bottom', bottom - cy],
    ['left', cx - workArea.x],
    ['right', right - cx],
  ];
  d.sort((a, b) => a[1] - b[1]);
  return d[0]![0];
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi);

export interface PopoverPlacement extends Point {
  /** True when the popover hangs down from its anchor (tray at the top). */
  dropsDown: boolean;
  edge: Edge;
}

/**
 * Puts a popover of `size` beside `anchor` — the tray icon's bounds, or just
 * the point that was clicked when the tray can't say where it is — inside the
 * work area: below a top panel (macOS menu bar), above a bottom one (Windows
 * taskbar), beside a left or right one. Always fully inside the work area.
 */
export function placePopover(
  anchor: Rect,
  workArea: Rect,
  size: Size,
  gap: number,
): PopoverPlacement {
  const edge = anchorEdge(anchor, workArea);
  const minX = workArea.x + gap;
  const maxX = workArea.x + workArea.width - size.width - gap;
  const minY = workArea.y + gap;
  const maxY = workArea.y + workArea.height - size.height - gap;
  const cx = anchor.x + anchor.width / 2;
  const cy = anchor.y + anchor.height / 2;
  let x: number;
  let y: number;
  if (edge === 'top' || edge === 'bottom') {
    x = clamp(Math.round(cx - size.width / 2), minX, Math.max(minX, maxX));
    y =
      edge === 'top'
        ? Math.max(anchor.y + anchor.height, workArea.y) + gap
        : Math.min(anchor.y, workArea.y + workArea.height) - size.height - gap;
  } else {
    // A vertical taskbar: beside it, level with the icon where there's room.
    x =
      edge === 'left'
        ? Math.max(anchor.x + anchor.width, workArea.x) + gap
        : Math.min(anchor.x, workArea.x + workArea.width) - size.width - gap;
    y = Math.round(cy - size.height / 2);
  }
  x = clamp(x, minX, Math.max(minX, maxX));
  y = clamp(y, minY, Math.max(minY, maxY));
  return { x: Math.round(x), y: Math.round(y), dropsDown: edge !== 'bottom', edge };
}

/**
 * The rectangle to anchor the popover to: the tray icon's own bounds when the
 * platform reports them, otherwise the pointer (it was just used to click the
 * icon), otherwise nothing — the caller then uses a corner of the screen.
 */
export function popoverAnchor(trayBounds: Rect | null, cursor: Point | null): Rect | null {
  if (trayBounds && !isEmptyRect(trayBounds)) return trayBounds;
  if (cursor) return { x: cursor.x, y: cursor.y, width: 1, height: 1 };
  return null;
}

export interface FloatingDefaults {
  pill: Point;
  bar: Point;
}

/**
 * First-show positions for the pill and the floating bar, chosen together so
 * neither covers the other on small screens (at 1024×768 the bar used to sit
 * across the pill). The pill takes the top-right corner; the bar is centred
 * along the top if that clears the pill, slides left until it does, and drops
 * below the pill only if the screen is too narrow for both side by side.
 */
export function floatingDefaults(
  workArea: Rect,
  pill: Size,
  bar: Size,
  margin: { pill: number; bar: number },
): FloatingDefaults {
  const pillPos = {
    x: workArea.x + workArea.width - pill.width - margin.pill,
    y: workArea.y + margin.pill,
  };
  const centred = Math.round(workArea.x + (workArea.width - bar.width) / 2);
  const clearOfPill = pillPos.x - margin.bar - bar.width;
  const leftmost = workArea.x + margin.bar;
  if (centred <= clearOfPill)
    return { pill: pillPos, bar: { x: centred, y: workArea.y + margin.bar } };
  if (clearOfPill >= leftmost) {
    return { pill: pillPos, bar: { x: clearOfPill, y: workArea.y + margin.bar } };
  }
  return {
    pill: pillPos,
    bar: {
      x: Math.max(leftmost, workArea.x + workArea.width - bar.width - margin.bar),
      y: pillPos.y + pill.height + margin.bar,
    },
  };
}
