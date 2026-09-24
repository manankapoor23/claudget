import { BrowserWindow, nativeTheme, screen } from 'electron';
import fs from 'node:fs';
import type { WidgetConfig } from '@claude-widget/core';
import type { Surface } from '../shared/ipc';

export interface RendererSource {
  rendererUrl: string | undefined;
  rendererFile: string;
}

/** Loads the shared renderer bundle as a given surface (`?surface=`). */
export function loadSurface(browser: BrowserWindow, src: RendererSource, surface: Surface): void {
  if (src.rendererUrl) {
    const url = new URL(src.rendererUrl);
    url.searchParams.set('surface', surface);
    void browser.loadURL(url.toString());
  } else {
    void browser.loadFile(src.rendererFile, { query: { surface } });
  }
}

const NORMAL = { width: 980, height: 660 };
/** Saved sizes narrower than this come from the old floating-widget era. */
const LEGACY_MAX_WIDTH = 560;
const MIN = { width: 320, height: 420 };
const MAC = process.platform === 'darwin';

/** The page ground for the current appearance — matches --bg in system.css. */
function groundColour(): string {
  return nativeTheme.shouldUseDarkColors ? '#0c0c0d' : '#fbfbfa';
}
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
  const width = Math.min(size.width, wa.width - MARGIN * 2);
  return {
    x: Math.round(wa.x + (wa.width - width) / 2),
    y: Math.round(wa.y + Math.max(MARGIN, (wa.height - size.height) / 3)),
  };
}

/**
 * The dashboard: the full window, opened on demand from the menu bar. Owns its
 * mode/state — always-on-top, click-through, opacity, taskbar visibility and
 * persisted bounds. (The everyday glance lives in the popover and the optional
 * pill; see popover.ts and pill.ts.)
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

    let saved = readState(deps.statePath);
    // The dashboard used to be a 360-wide floating widget. Its saved size and
    // corner position don't suit a desktop window, so start fresh once.
    if (typeof saved.width === 'number' && saved.width < LEGACY_MAX_WIDTH) saved = {};
    this.expanded = {
      width: saved.width ?? NORMAL.width,
      height: saved.height ?? NORMAL.height,
    };
    const size = this.expanded;
    const pos = computePosition(saved, size);

    this.browser = new BrowserWindow({
      width: size.width,
      height: size.height,
      x: pos.x,
      y: pos.y,
      minWidth: MIN.width,
      minHeight: MIN.height,
      // macOS: a real window — traffic lights inset into our title bar, native
      // shadow and corners, opaque so it never flashes white or shows the
      // desktop through. Elsewhere: the frameless window with its own controls.
      ...(MAC
        ? {
            titleBarStyle: 'hiddenInset' as const,
            trafficLightPosition: { x: 16, y: 14 },
            backgroundColor: groundColour(),
          }
        : { frame: false, transparent: true, backgroundColor: '#00000000' }),
      resizable: true,
      maximizable: MAC,
      minimizable: true,
      fullscreenable: MAC,
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

    loadSurface(this.browser, deps, 'dashboard');

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

    // Native surfaces (menus, the tray, dialogs) follow the OS appearance, so
    // point them at the user's theme choice too.
    if (changed('theme')) {
      nativeTheme.themeSource = config.theme;
      if (MAC) this.browser.setBackgroundColor(groundColour());
    }
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
  }

  /** Re-matches the native window ground to the current appearance (macOS). */
  syncGround(): void {
    if (MAC && !this.browser.isDestroyed()) this.browser.setBackgroundColor(groundColour());
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
