import { BrowserWindow, screen } from 'electron';
import fs from 'node:fs';
import type { Logger } from '@claude-widget/core';
import { dragTarget } from '../shared/pill';
import { loadSurface, type RendererSource } from './window';

/**
 * The window is always the size of the *expanded* card plus room for its
 * shadow. It never resizes — the pill morphs into the card with a CSS
 * transition inside it, which is what makes the animation smooth. The
 * transparent remainder passes clicks through to whatever is underneath.
 */
export const PILL_WINDOW = { width: 356, height: 180 };
const MARGIN = 12;
/** Cursor-follow cadence while dragging (~120 Hz keeps up with the pointer). */
const DRAG_TICK_MS = 8;
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
  private drag: { timer: NodeJS.Timeout; startedAt: number } | null = null;
  private saveTimer: NodeJS.Timeout | null = null;

  constructor(deps: PillDeps) {
    this.statePath = deps.statePath;
    this.logger = deps.logger;
    const saved = readState(deps.statePath);
    const wa = screen.getPrimaryDisplay().workArea;
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
      x: onScreen ? saved.x : wa.x + wa.width - PILL_WINDOW.width - MARGIN,
      y: onScreen ? saved.y : wa.y + MARGIN,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
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
    this.browser.setIgnoreMouseEvents(true, { forward: true });
    loadSurface(this.browser, deps, 'pill');
    this.browser.on('move', () => this.persist());
    this.browser.on('blur', () => this.endDrag());
    this.browser.on('hide', () => this.endDrag());
    this.browser.on('closed', () => this.endDrag());
  }

  setVisible(visible: boolean): void {
    if (visible) this.browser.showInactive();
    else this.browser.hide();
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
    let last: { x: number; y: number } | null = null;
    const timer = setInterval(() => {
      if (this.browser.isDestroyed() || Date.now() - startedAt > DRAG_MAX_MS) {
        this.endDrag();
        return;
      }
      const to = dragTarget(screen.getCursorScreenPoint(), offset);
      if (!to) return;
      // Compare with the last request, not the window: macOS clamps it below
      // the menu bar, and re-asking every tick just fights that.
      if (last && to.x === last.x && to.y === last.y) return;
      last = to;
      try {
        this.browser.setPosition(to.x, to.y, false);
      } catch (err) {
        // An error thrown from this timer would reach the uncaught-exception
        // dialog on every tick with the pill glued to the cursor; drop the
        // drag instead and leave a trace to fix.
        this.logger.error('Pill drag failed; releasing', { to, err: String(err) });
        this.endDrag();
      }
    }, DRAG_TICK_MS);
    this.drag = { timer, startedAt };
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
    if (!this.drag) return;
    clearInterval(this.drag.timer);
    this.drag = null;
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
