/** Geometry for the floating pill, kept pure so main and renderer agree on it. */

export interface Point {
  x: number;
  y: number;
}

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
