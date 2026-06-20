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
      title: 'Claude Usage Widget',
      webPreferences: {
        preload: deps.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        spellcheck: false,
      },
    });

    this.applyConfig(deps.config);

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

  applyConfig(config: WidgetConfig): void {
    const wasCompact = this.config.compact;
    this.config = config;

    // 'screen-saver' level floats above fullscreen apps; 'floating' doesn't.
    this.browser.setAlwaysOnTop(config.alwaysOnTop, 'screen-saver');
    this.browser.setIgnoreMouseEvents(config.clickThrough, { forward: true });
    this.browser.setOpacity(config.opacity);
    this.browser.setSkipTaskbar(!config.showInTaskbar);
    this.browser.setResizable(!config.compact);
    // MUST be last: setAlwaysOnTop above rewrites the macOS collection behavior,
    // so re-assert all-Spaces visibility here or the widget won't follow you to
    // other desktops. (Brief dock/window flicker per call — only fires on
    // startup + settings changes, so it's fine.)
    this.browser.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

    if (config.compact !== wasCompact) {
      const target = config.compact ? COMPACT : this.expanded;
      this.browser.setSize(target.width, target.height, true);
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
