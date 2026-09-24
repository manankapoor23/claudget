import { BrowserWindow, nativeTheme, screen } from 'electron';
import fs from 'node:fs';
import { loadSurface, type RendererSource } from './window';

/** Wide and short: both limits and today, readable without opening anything. */
export const MINIBAR = { width: 580, height: 96 };
/** Resize range — the layout adapts across it (see `.mb` in system.css). */
const MIN = { width: 380, height: 64 };
const MAX = { width: 1100, height: 220 };
const MARGIN = 16;

function ground(): string {
  return nativeTheme.shouldUseDarkColors ? '#0c0c0d' : '#fbfbfa';
}

export interface MiniBarDeps extends RendererSource {
  preloadPath: string;
  statePath: string;
}

interface State {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

function readState(p: string): State {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as State;
  } catch {
    return {};
  }
}

/**
 * The floating bar (config `miniBar`): bigger than the pill, far smaller than
 * the dashboard, always on top while it's on. Resizable from any edge, so it
 * is an opaque window (Electron can't reliably resize transparent ones) with
 * native rounded corners and shadow. Moves with the OS's own window dragging:
 * the renderer marks the bar as a drag region and its buttons as not.
 */
export class MiniBar {
  readonly browser: BrowserWindow;
  private readonly statePath: string;
  private saveTimer: NodeJS.Timeout | null = null;

  constructor(deps: MiniBarDeps) {
    this.statePath = deps.statePath;
    const saved = readState(deps.statePath);
    const wa = screen.getPrimaryDisplay().workArea;
    const onScreen =
      typeof saved.x === 'number' &&
      typeof saved.y === 'number' &&
      screen.getAllDisplays().some((d) => {
        const b = d.bounds;
        return (
          saved.x! > b.x - MINIBAR.width / 2 &&
          saved.x! < b.x + b.width - MINIBAR.width / 2 &&
          saved.y! >= b.y &&
          saved.y! < b.y + b.height - MINIBAR.height / 2
        );
      });

    const clamp = (v: number | undefined, lo: number, hi: number, d: number): number =>
      typeof v === 'number' ? Math.min(hi, Math.max(lo, Math.round(v))) : d;
    const width = clamp(saved.width, MIN.width, MAX.width, MINIBAR.width);
    const height = clamp(saved.height, MIN.height, MAX.height, MINIBAR.height);

    this.browser = new BrowserWindow({
      width,
      height,
      minWidth: MIN.width,
      minHeight: MIN.height,
      maxWidth: MAX.width,
      maxHeight: MAX.height,
      // Default: top centre, just under the menu bar.
      x: onScreen ? saved.x : Math.round(wa.x + (wa.width - width) / 2),
      y: onScreen ? saved.y : wa.y + MARGIN,
      show: false,
      frame: false,
      backgroundColor: ground(),
      roundedCorners: true,
      hasShadow: true,
      resizable: true,
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
    loadSurface(this.browser, deps, 'minibar');
    this.browser.on('move', () => this.persist());
    this.browser.on('resize', () => this.persist());
    nativeTheme.on('updated', () => {
      if (!this.browser.isDestroyed()) this.browser.setBackgroundColor(ground());
    });
  }

  setVisible(visible: boolean): void {
    if (visible) this.browser.showInactive();
    else this.browser.hide();
  }

  private persist(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      if (this.browser.isDestroyed()) return;
      const { x, y, width: w, height: h } = this.browser.getBounds();
      try {
        fs.writeFileSync(this.statePath, JSON.stringify({ x, y, width: w, height: h }), 'utf8');
      } catch {
        // Non-fatal — position just won't persist this time.
      }
    }, 400);
  }
}
