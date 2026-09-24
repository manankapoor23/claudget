import { BrowserWindow, screen, type Rectangle } from 'electron';
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
      transparent: true,
      backgroundColor: '#00000000',
      // The same material as the system's own menu-bar popovers.
      ...(MAC ? { vibrancy: 'popover' as const, visualEffectState: 'active' as const } : {}),
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
    this.browser.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    loadSurface(this.browser, deps, 'popover');

    this.browser.on('blur', () => {
      if (!this.browser.isDestroyed() && this.browser.isVisible()) {
        this.hiddenAt = Date.now();
        this.browser.hide();
      }
    });
  }

  /** Shows the popover under (macOS) or above (Windows/Linux taskbar) the anchor. */
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
    this.browser.show();
    this.browser.focus();
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
    const display = anchor
      ? screen.getDisplayNearestPoint({ x: anchor.x, y: anchor.y })
      : screen.getPrimaryDisplay();
    const wa = display.workArea;
    if (!anchor || anchor.width === 0) {
      // No tray bounds (some Linux trays): top-right of the work area.
      return { x: wa.x + wa.width - WIDTH - GAP * 2, y: wa.y + GAP };
    }
    const centred = Math.round(anchor.x + anchor.width / 2 - WIDTH / 2);
    const x = Math.min(Math.max(centred, wa.x + GAP), wa.x + wa.width - WIDTH - GAP);
    // Tray at the top (macOS menu bar) → drop down; at the bottom (taskbar) → pop up.
    const trayAtTop = anchor.y < wa.y + wa.height / 2;
    this.dropsDown = trayAtTop;
    const y = trayAtTop ? anchor.y + anchor.height + GAP : anchor.y - this.height - GAP;
    return { x, y: Math.max(wa.y, y) };
  }
}
