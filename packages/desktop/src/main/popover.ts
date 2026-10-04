import { BrowserWindow, nativeTheme, screen, type Rectangle } from 'electron';
import { placePopover } from '../shared/placement';
import { loadSurface, type RendererSource } from './window';

const WIDTH = 360;
const MIN_HEIGHT = 220;
const MAX_HEIGHT = 640;
const MAC = process.platform === 'darwin';
const GAP = 6;

export interface PopoverDeps extends RendererSource {
  preloadPath: string;
}

/**
 * The menu-bar dropdown: the everyday glance. Anchored under the tray icon,
 * shown on click, hidden the moment focus leaves — the way native menu-bar
 * apps behave, so it never sits on top of your work uninvited.
 */
export class Popover {
  readonly browser: BrowserWindow;
  /** Set on blur-hide so the tray click that caused the blur doesn't reopen it. */
  private hiddenAt = 0;
  /** Fitted to the content by the renderer; see `setContentHeight`. */
  private height = 540;
  private dropsDown = true;

  constructor(deps: PopoverDeps) {
    this.browser = new BrowserWindow({
      width: WIDTH,
      height: this.height,
      show: false,
      frame: false,
      ...(deps.opaque
        ? { backgroundColor: nativeTheme.shouldUseDarkColors ? '#0c0c0d' : '#fbfbfa' }
        : { transparent: true, backgroundColor: '#00000000' }),
      // The same material as the system's own menu-bar popovers.
      ...(MAC
        ? {
            vibrancy: 'popover' as const,
            visualEffectState: 'active' as const,
            // A non-activating panel, like every native menu-bar extra: it can
            // take key focus without making claudget the active app. An
            // ordinary window has to activate the app to get focus, and
            // activating an app makes macOS switch to a Space where that app
            // has a window (an open dashboard), or off a full-screen Space.
            type: 'panel',
          }
        : {}),
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      hasShadow: true,
      alwaysOnTop: true,
      webPreferences: {
        preload: deps.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        spellcheck: false,
      },
    });
    // Above fullscreen apps and on every Space, like the menu bar itself.
    this.browser.setAlwaysOnTop(true, 'pop-up-menu');
    // skipTransformProcessType: without it Electron flips the whole app to a
    // UI-element process and back (Dock icon and app menu vanish while the
    // dashboard is open), which is also what briefly hid windows on create.
    this.browser.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true,
      skipTransformProcessType: true,
    });
    loadSurface(this.browser, deps, 'popover');

    this.browser.on('blur', () => {
      if (!this.browser.isDestroyed() && this.browser.isVisible()) {
        this.hiddenAt = Date.now();
        this.browser.hide();
      }
    });
  }

  /**
   * Shows the popover beside the anchor: under a menu bar or top panel, above
   * a bottom taskbar, beside a vertical one. The anchor is the tray icon's
   * bounds, or the point that was clicked where the tray can't report its
   * bounds (Linux); null puts it in the top-right corner.
   */
  toggle(anchor: Rectangle | null): void {
    if (this.browser.isVisible()) {
      this.browser.hide();
      return;
    }
    // A click on the tray icon blurs the popover first; don't let that same
    // click immediately reopen it.
    if (Date.now() - this.hiddenAt < 250) return;
    this.show(anchor);
  }

  show(anchor: Rectangle | null): void {
    const { x, y } = this.position(anchor);
    this.browser.setPosition(x, y, false);
    if (MAC) {
      // show() calls [NSApp activateIgnoringOtherApps:YES] — the Space jump.
      // showInactive() just orders the panel in; focus() on a panel makes it
      // key (Escape, blur-to-close) without activating the app.
      this.browser.showInactive();
      this.browser.focus();
    } else {
      // Windows: Explorer forgets skipped taskbar buttons when it restarts.
      if (process.platform === 'win32') this.browser.setSkipTaskbar(true);
      this.browser.show();
      this.browser.focus();
    }
  }

  hide(): void {
    if (this.browser.isVisible()) this.browser.hide();
  }

  /** Fits the window to its content, keeping the edge nearest the tray fixed. */
  setContentHeight(contentHeight: number): void {
    const h = Math.round(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, contentHeight)));
    if (h === this.height || this.browser.isDestroyed()) return;
    const b = this.browser.getBounds();
    const y = this.dropsDown ? b.y : b.y + b.height - h;
    this.height = h;
    this.browser.setBounds({ x: b.x, y, width: WIDTH, height: h }, false);
  }

  private position(anchor: Rectangle | null): { x: number; y: number } {
    if (!anchor) {
      // Nothing to anchor to: top-right of the primary work area.
      const wa = screen.getPrimaryDisplay().workArea;
      this.dropsDown = true;
      return { x: wa.x + wa.width - WIDTH - GAP * 2, y: wa.y + GAP };
    }
    const display = screen.getDisplayNearestPoint({
      x: Math.round(anchor.x + anchor.width / 2),
      y: Math.round(anchor.y + anchor.height / 2),
    });
    const placed = placePopover(
      anchor,
      display.workArea,
      { width: WIDTH, height: this.height },
      GAP,
    );
    this.dropsDown = placed.dropsDown;
    return { x: placed.x, y: placed.y };
  }
}
