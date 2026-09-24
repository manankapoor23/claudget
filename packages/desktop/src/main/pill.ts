import { BrowserWindow, screen } from 'electron';
import fs from 'node:fs';
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
/** Safety stop if a drag-end message is ever lost. */
const DRAG_MAX_MS = 30_000;

export interface PillDeps extends RendererSource {
  preloadPath: string;
  statePath: string;
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
  private drag: { timer: NodeJS.Timeout; startedAt: number } | null = null;
  private saveTimer: NodeJS.Timeout | null = null;

  constructor(deps: PillDeps) {
    this.statePath = deps.statePath;
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
    this.browser.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    // Transparent areas pass clicks through; the renderer re-captures the
    // mouse while the cursor is over the pill itself (moves are forwarded).
    this.browser.setIgnoreMouseEvents(true, { forward: true });
    loadSurface(this.browser, deps, 'pill');
    this.browser.on('move', () => this.persist());
    this.browser.on('blur', () => this.endDrag());
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
    const startedAt = Date.now();
    const timer = setInterval(() => {
      if (this.browser.isDestroyed() || Date.now() - startedAt > DRAG_MAX_MS) {
        this.endDrag();
        return;
      }
      const p = screen.getCursorScreenPoint();
      this.browser.setPosition(Math.round(p.x - offsetX), Math.round(p.y - offsetY), false);
    }, DRAG_TICK_MS);
    this.drag = { timer, startedAt };
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
