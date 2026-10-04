/** Geometry for the floating pill, kept pure so main and renderer agree on it. */

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Rect extends Point, Size {}

/** Which corner of its (fixed-size, transparent) window the pill sits in. */
export type Anchor = { x: 'left' | 'right'; y: 'top' | 'bottom' };

/**
 * Where the window goes so the press point stays under the cursor, or null
 * if there's nothing sane to move to.
 *
 * Electron's native bindings only take int32s, and V8 doesn't count -0 as
 * one: `Math.round(-0.3)` is -0, so pressing at a fractional offset and
 * dragging to the very top or left edge of a screen threw "conversion
 * failure" from `setPosition` (#14). `+ 0` folds -0 into 0.
 */
export function dragTarget(cursor: Point, offset: Point): Point | null {
  const x = cursor.x - offset.x;
  const y = cursor.y - offset.y;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x: Math.round(x) + 0, y: Math.round(y) + 0 };
}

/** A cursor position read mid-drag, and when it was read (ms, monotonic). */
export interface CursorSample extends Point {
  t: number;
}

/** How much recent movement the cursor's velocity is judged from. */
const VELOCITY_WINDOW_MS = 40;
/** No new position for this long means the pointer has stopped. */
const STOPPED_MS = 14;
/** Never aim further ahead than this, however fast the pointer is going. */
const MAX_LEAD_PX = 16;

/**
 * Adds a reading to a drag's recent history (in place). Only positions that
 * differ are kept, each stamped with when it was first seen, and only the
 * last `VELOCITY_WINDOW_MS` of them (but always at least two).
 */
export function trackCursor(history: CursorSample[], sample: CursorSample): void {
  const last = history[history.length - 1];
  if (last && last.x === sample.x && last.y === sample.y) return;
  history.push(sample);
  while (history.length > 2 && sample.t - history[0]!.t > VELOCITY_WINDOW_MS) history.shift();
}

/**
 * Where the cursor will be `leadMs` from now, extrapolated from its recent
 * movement. A window moved from JavaScript reaches the screen about a frame
 * after the cursor position it was aimed at, so aiming slightly ahead keeps
 * the pill under the pointer instead of trailing it. Once the pointer stops,
 * this is just where it is, so the pill settles exactly under it.
 */
export function leadCursor(history: CursorSample[], now: number, leadMs: number): Point | null {
  const newest = history[history.length - 1];
  if (!newest) return null;
  const oldest = history[0]!;
  const span = newest.t - oldest.t;
  if (now - newest.t > STOPPED_MS || span <= 0 || !(leadMs > 0)) {
    return { x: newest.x, y: newest.y };
  }
  let dx = ((newest.x - oldest.x) / span) * leadMs;
  let dy = ((newest.y - oldest.y) / span) * leadMs;
  const dist = Math.hypot(dx, dy);
  if (dist > MAX_LEAD_PX) {
    dx *= MAX_LEAD_PX / dist;
    dy *= MAX_LEAD_PX / dist;
  }
  return { x: newest.x + dx, y: newest.y + dy };
}

/**
 * The corner facing the middle of the screen, so the card opens onto it.
 * Judged from the pill itself, not its window: the pill doesn't move when it
 * changes corners, so the answer can't flip back on the next drop.
 */
export function anchorFor(pill: Rect, workArea: Rect): Anchor {
  const cx = pill.x + pill.width / 2;
  const cy = pill.y + pill.height / 2;
  return {
    x: cx > workArea.x + workArea.width / 2 ? 'right' : 'left',
    y: cy > workArea.y + workArea.height / 2 ? 'bottom' : 'top',
  };
}

/**
 * How far the window must move so the pill stays put on screen when it
 * switches corners. `room` is the slack between the pill and the window on
 * each axis — the distance between its two possible positions.
 */
export function anchorShift(from: Anchor, to: Anchor, room: Point): Point {
  const sx = from.x === to.x ? 0 : to.x === 'right' ? -room.x : room.x;
  const sy = from.y === to.y ? 0 : to.y === 'bottom' ? -room.y : room.y;
  return { x: sx + 0, y: sy + 0 };
}
