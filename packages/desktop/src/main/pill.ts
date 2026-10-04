import { BrowserWindow, nativeTheme, screen } from 'electron';
import fs from 'node:fs';
import type { Logger } from '@claude-widget/core';
import { dragTarget, leadCursor, trackCursor, type CursorSample } from '../shared/pill';
import { floatingDefaults, type Rect } from '../shared/placement';
import { inflateWithin, roundedRectStrips } from '../shared/shape';
import { loadSurface, type RendererSource } from './window';

/**
 * The window is always the size of the *expanded* card plus room for its
 * shadow. It never resizes — the pill morphs into the card with a CSS
 * transition inside it, which is what makes the animation smooth. The
 * transparent remainder passes clicks through to whatever is underneath.
 */
export const PILL_WINDOW = { width: 356, height: 180 };
/** The floating bar's default size and both surfaces' screen margins, so the
 * pill and the bar can pick first positions that don't overlap. */
export const MINIBAR_DEFAULT = { width: 580, height: 96 };
export const FLOATING_MARGINS = { pill: 12, bar: 16 };
/** The `.pillwin` padding: room for the halo, kept inside the shape when composited. */
const HALO = 18;
/**
 * Linux: the window is cut to the pill's shape instead of ignoring the mouse
 * over its clear parts — X11 can't forward mouse moves to an ignoring window,
 * which left the pill unclickable, and without a compositor the clear parts
 * were drawn black.
 */
const SHAPED = process.platform === 'linux';
/**
 * Cursor-follow cadence while dragging. macOS only shows a window's new
 * position once per display refresh, so this just has to be fresh at each
 * refresh (4 ms asked comes out around 110 Hz from main's timers). It runs in
 * main, so a busy renderer can't stall the drag.
 */
const DRAG_TICK_MS = 4;
/**
 * How far ahead of the cursor to aim (see `leadCursor`). A move made now is
 * on screen about a refresh later; leading by half a 60 Hz frame roughly
 * halves how far the pill trails a moving pointer. The cost is a few pixels of
 * overshoot for a frame or two after a sudden stop (8 px at a fast 940 px/s
 * flick, measured), and the drop itself always lands exactly under the pointer.
 */
const DRAG_LEAD_MS = 8;
/** Last-resort stop if the renderer never reports the release. */
const DRAG_MAX_MS = 15_000;

export interface PillDeps extends RendererSource {
  preloadPath: string;
  statePath: string;
  logger: Logger;
}

interface PillState {
  x?: number;
  y?: number;
}

function readState(p: string): PillState {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as PillState;
  } catch {
    return {};
  }
}

/** The optional floating pill (config `compact`). */
export class Pill {
  readonly browser: BrowserWindow;
  private readonly statePath: string;
  private readonly logger: Logger;
  private drag: {
    timer: NodeJS.Timeout;
    startedAt: number;
    offset: { x: number; y: number };
    history: CursorSample[];
    last: { x: number; y: number } | null;
  } | null = null;
  private saveTimer: NodeJS.Timeout | null = null;
  private readonly opaque: boolean;

  constructor(deps: PillDeps) {
    this.statePath = deps.statePath;
    this.logger = deps.logger;
    const saved = readState(deps.statePath);
    this.opaque = deps.opaque === true;
    const wa = screen.getPrimaryDisplay().workArea;
    const home = floatingDefaults(wa, PILL_WINDOW, MINIBAR_DEFAULT, FLOATING_MARGINS).pill;
    const onScreen =
      typeof saved.x === 'number' &&
      typeof saved.y === 'number' &&
      screen.getAllDisplays().some((d) => {
        const b = d.bounds;
        return (
          saved.x! >= b.x - PILL_WINDOW.width / 2 &&
          saved.x! < b.x + b.width - PILL_WINDOW.width / 2 &&
          saved.y! >= b.y &&
          saved.y! < b.y + b.height - PILL_WINDOW.height / 2
        );
      });

    this.browser = new BrowserWindow({
      width: PILL_WINDOW.width,
      height: PILL_WINDOW.height,
      x: onScreen ? saved.x : home.x,
      y: onScreen ? saved.y : home.y,
      show: false,
      frame: false,
      ...(this.opaque
        ? { backgroundColor: nativeTheme.shouldUseDarkColors ? '#0c0c0d' : '#fbfbfa' }
        : { transparent: true, backgroundColor: '#00000000' }),
      // The OS shadow would outline the whole transparent window; the pill
      // draws its own, so it follows the shape as it morphs.
      hasShadow: false,
      resizable: false,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      webPreferences: {
        preload: deps.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        spellcheck: false,
      },
    });
    this.browser.setAlwaysOnTop(true, 'floating');
    // skipTransformProcessType: the pill may be created while the dashboard
    // has made claudget a regular app; the transform would drop its Dock icon.
    this.browser.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true,
      skipTransformProcessType: true,
    });
    // Transparent areas pass clicks through; the renderer re-captures the
    // mouse while the cursor is over the pill itself (moves are forwarded).
    // Linux: the shape does that job instead (see `setShapeFrom`).
    if (!SHAPED) this.browser.setIgnoreMouseEvents(true, { forward: true });
    loadSurface(this.browser, deps, 'pill');
    // Mid-drag the window moves every frame; it's saved once it's dropped.
    this.browser.on('move', () => {
      if (!this.drag) this.persist();
    });
    this.browser.on('blur', () => this.endDrag());
    this.browser.on('hide', () => this.endDrag());
    this.browser.on('closed', () => this.endDrag());
  }

  setVisible(visible: boolean): void {
    if (visible) {
      // Windows: Explorer forgets skipped taskbar buttons when it restarts.
      if (process.platform === 'win32') this.browser.setSkipTaskbar(true);
      this.browser.showInactive();
    } else this.browser.hide();
  }

  /**
   * Linux: cuts the window to the pill (`rect`, in window coordinates). With a
   * compositor the cut leaves room for the halo; without one it follows the
   * rounded outline exactly, since anything else would be drawn as a box.
   */
  setShapeFrom(rect: Rect, radius: number): void {
    if (!SHAPED || this.browser.isDestroyed()) return;
    const nums = [rect.x, rect.y, rect.width, rect.height, radius];
    if (!nums.every((n) => Number.isFinite(n)) || rect.width <= 0 || rect.height <= 0) return;
    const win = { x: 0, y: 0, ...PILL_WINDOW };
    const shape = this.opaque
      ? roundedRectStrips(inflateWithin(rect, 0, win), radius)
      : [inflateWithin(rect, HALO, win)];
    if (shape.length > 0) this.browser.setShape(shape);
  }

  /**
   * Follows the cursor until `endDrag`. `offsetX/Y` is where inside the window
   * the press landed, so the pill doesn't jump under the pointer.
   */
  startDrag(offsetX: number, offsetY: number): void {
    this.endDrag();
    const offset = { x: offsetX, y: offsetY };
    if (this.browser.isDestroyed() || !dragTarget({ x: 0, y: 0 }, offset)) {
      this.logger.warn('Ignoring pill drag with an invalid offset', { offsetX, offsetY });
      return;
    }
    const startedAt = Date.now();
    const timer = setInterval(() => this.follow(), DRAG_TICK_MS);
    this.drag = { timer, startedAt, offset, history: [], last: null };
    // Don't wait a tick to pick it up.
    this.follow();
  }

  /** One step of a drag: put the press point (just ahead of) under the cursor. */
  private follow(): void {
    const drag = this.drag;
    if (!drag) return;
    if (this.browser.isDestroyed() || Date.now() - drag.startedAt > DRAG_MAX_MS) {
      this.endDrag();
      return;
    }
    const now = performance.now();
    trackCursor(drag.history, { ...screen.getCursorScreenPoint(), t: now });
    const aim = leadCursor(drag.history, now, DRAG_LEAD_MS);
    const to = aim && dragTarget(aim, drag.offset);
    if (!to) return;
    // Compare with the last request, not the window: macOS clamps it below
    // the menu bar, and re-asking every tick just fights that.
    if (drag.last && to.x === drag.last.x && to.y === drag.last.y) return;
    drag.last = to;
    try {
      this.browser.setPosition(to.x, to.y, false);
    } catch (err) {
      // An error thrown from this timer would reach the uncaught-exception
      // dialog on every tick with the pill glued to the cursor; drop the
      // drag instead and leave a trace to fix.
      this.logger.error('Pill drag failed; releasing', { to, err: String(err) });
      this.endDrag();
    }
  }

  /** Shifts the window, e.g. to hold the pill still while it changes corners. */
  nudge(dx: number, dy: number): void {
    if (this.browser.isDestroyed() || this.drag) return;
    const to = dragTarget(this.browser.getBounds(), { x: -dx, y: -dy });
    if (!to) {
      this.logger.warn('Ignoring pill nudge with an invalid delta', { dx, dy });
      return;
    }
    this.browser.setPosition(to.x, to.y, false);
  }

  endDrag(): void {
    const drag = this.drag;
    if (!drag) return;
    clearInterval(drag.timer);
    this.drag = null;
    // The last step may have aimed ahead of a pointer that was still moving;
    // drop the pill exactly where it was let go.
    const to = this.browser.isDestroyed()
      ? null
      : dragTarget(screen.getCursorScreenPoint(), drag.offset);
    if (to && (!drag.last || to.x !== drag.last.x || to.y !== drag.last.y)) {
      try {
        this.browser.setPosition(to.x, to.y, false);
      } catch (err) {
        this.logger.error('Pill drop failed', { to, err: String(err) });
      }
    }
    this.persist();
  }

  private persist(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      if (this.browser.isDestroyed()) return;
      const { x, y } = this.browser.getBounds();
      try {
        fs.writeFileSync(this.statePath, JSON.stringify({ x, y }), 'utf8');
      } catch {
        // Non-fatal — position just won't persist this time.
      }
    }, 400);
  }
}
