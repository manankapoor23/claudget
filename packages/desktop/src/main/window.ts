import { BrowserWindow, screen } from 'electron';
import fs from 'node:fs';
import type { WidgetConfig } from '@claude-widget/core';

const NORMAL = { width: 360, height: 520 };
const COMPACT = { width: 320, height: 188 };
const MIN = { width: 260, height: 150 };
const MARGIN = 24;

interface PersistedState {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export interface WidgetWindowDeps {
  preloadPath: string;
  rendererUrl: string | undefined;
  rendererFile: string;
  iconPath: string;
  statePath: string;
  config: WidgetConfig;
}

function readState(p: string): PersistedState {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as PersistedState;
  } catch {
    return {};
  }
}

function isPointOnSomeDisplay(x: number, y: number): boolean {
  return screen.getAllDisplays().some((d) => {
    const b = d.bounds;
    return x >= b.x - 8 && x <= b.x + b.width - 40 && y >= b.y - 8 && y <= b.y + b.height - 40;
  });
}

function computePosition(
  saved: PersistedState,
  size: { width: number; height: number },
): {
  x: number;
  y: number;
} {
  if (
    typeof saved.x === 'number' &&
    typeof saved.y === 'number' &&
    isPointOnSomeDisplay(saved.x, saved.y)
  ) {
    return { x: Math.round(saved.x), y: Math.round(saved.y) };
  }
  const wa = screen.getPrimaryDisplay().workArea;
  return { x: wa.x + wa.width - size.width - MARGIN, y: wa.y + 48 };
}

/**
 * Wraps the widget's BrowserWindow and owns its mode/state: always-on-top,
 * click-through, opacity, taskbar visibility, compact sizing, and persisted
 * bounds. Compact mode shrinks (and locks) the window; toggling back restores
 * the last expanded size.
 */
export class WidgetWindow {
  readonly browser: BrowserWindow;
  private readonly statePath: string;
  private config: WidgetConfig;
  private expanded: { width: number; height: number };
  private saveTimer: NodeJS.Timeout | null = null;

  constructor(deps: WidgetWindowDeps) {
    this.statePath = deps.statePath;
    this.config = deps.config;

    const saved = readState(deps.statePath);
    this.expanded = {
      width: saved.width ?? NORMAL.width,
      height: saved.height ?? NORMAL.height,
    };
    const size = deps.config.compact ? COMPACT : this.expanded;
    const pos = computePosition(saved, size);

    this.browser = new BrowserWindow({
      width: size.width,
      height: size.height,
      x: pos.x,
      y: pos.y,
      minWidth: MIN.width,
      minHeight: MIN.height,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      resizable: !deps.config.compact,
      maximizable: false,
      minimizable: true,
      fullscreenable: false,
      skipTaskbar: !deps.config.showInTaskbar,
      hasShadow: true,
      show: false,
      icon: deps.iconPath,
      title: 'claudget',
      webPreferences: {
        preload: deps.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        spellcheck: false,
      },
    });

    this.applyConfig(deps.config, true);

    if (deps.rendererUrl) void this.browser.loadURL(deps.rendererUrl);
    else void this.browser.loadFile(deps.rendererFile);

    // ponytail: recede when you're working elsewhere, snap back on focus.
    // DIM is the explicit knob — tune to taste.
    const DIM = 0.78;
    this.browser.on('blur', () => {
      if (!this.browser.isDestroyed()) this.browser.setOpacity(this.config.opacity * DIM);
    });
    this.browser.on('focus', () => {
      if (!this.browser.isDestroyed()) this.browser.setOpacity(this.config.opacity);
    });

    this.browser.on('resize', () => this.onBoundsChanged());
    this.browser.on('move', () => this.onBoundsChanged());
  }

  private onBoundsChanged(): void {
    if (this.browser.isDestroyed()) return;
    if (this.config.compact) return; // never persist the compact size as "expanded"
    const b = this.browser.getBounds();
    this.expanded = { width: b.width, height: b.height };
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      try {
        fs.writeFileSync(this.statePath, JSON.stringify(b), 'utf8');
      } catch {
        // Non-fatal — position simply won't persist this time.
      }
    }, 400);
  }

  /**
   * Applies only what changed. `first` forces a full assert for the initial call.
   *
   * ponytail: every native call here is cheap on its own but they are NOT free at
   * UI-event rate — the opacity slider drives this ~30-60x/second, and
   * setVisibleOnAllWorkspaces rewrites the window's macOS collection behavior
   * (the flicker the old comment waved away). Re-asserting all of it per pointer
   * move is what made the widget incoherent on macOS 26.
   */
  applyConfig(config: WidgetConfig, first = false): void {
    const prev = this.config;
    this.config = config;

    const changed = (k: keyof WidgetConfig): boolean => first || config[k] !== prev[k];

    // 'screen-saver' level floats above fullscreen apps; 'floating' doesn't.
    if (changed('alwaysOnTop')) {
      this.browser.setAlwaysOnTop(config.alwaysOnTop, 'screen-saver');
      // setAlwaysOnTop rewrites the macOS collection behavior, so all-Spaces
      // visibility must be re-asserted right after it — but only then.
      this.browser.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    }
    if (changed('clickThrough')) {
      this.browser.setIgnoreMouseEvents(config.clickThrough, { forward: true });
    }
    // Cheap and the one thing the slider is actually for — always apply.
    if (changed('opacity')) this.browser.setOpacity(config.opacity);
    if (changed('showInTaskbar')) this.browser.setSkipTaskbar(!config.showInTaskbar);
    if (changed('compact')) {
      this.browser.setResizable(!config.compact);
      // The window is constructed at the right size already, so only resize on a
      // real transition — never on the initial assert.
      if (!first) {
        const target = config.compact ? COMPACT : this.expanded;
        this.browser.setSize(target.width, target.height, true);
      }
    }
  }

  show(): void {
    if (this.browser.isMinimized()) this.browser.restore();
    this.browser.show();
    this.browser.focus();
  }

  hide(): void {
    this.browser.hide();
  }

  toggleVisibility(): void {
    if (this.browser.isVisible() && !this.browser.isMinimized()) this.browser.hide();
    else this.show();
  }
}
