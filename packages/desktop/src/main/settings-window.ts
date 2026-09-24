import { BrowserWindow, nativeTheme, screen } from 'electron';
import { loadSurface, type RendererSource } from './window';

const SIZE = { width: 620, height: 600 };
const MAC = process.platform === 'darwin';

export interface SettingsWindowDeps extends RendererSource {
  preloadPath: string;
  iconPath: string;
}

/** The ⌘, window — a plain, fixed-size native window, as Mac settings are. */
export class SettingsWindow {
  readonly browser: BrowserWindow;

  constructor(deps: SettingsWindowDeps) {
    const wa = screen.getPrimaryDisplay().workArea;
    this.browser = new BrowserWindow({
      width: SIZE.width,
      height: SIZE.height,
      x: Math.round(wa.x + (wa.width - SIZE.width) / 2),
      y: Math.round(wa.y + wa.height * 0.14),
      show: false,
      resizable: false,
      maximizable: false,
      minimizable: MAC,
      fullscreenable: false,
      title: 'claudget Settings',
      icon: deps.iconPath,
      backgroundColor: nativeTheme.shouldUseDarkColors ? '#0c0c0d' : '#fbfbfa',
      ...(MAC
        ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 16, y: 16 } }
        : { autoHideMenuBar: true }),
      webPreferences: {
        preload: deps.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        spellcheck: false,
      },
    });
    loadSurface(this.browser, deps, 'settings');
    nativeTheme.on('updated', () => {
      if (!this.browser.isDestroyed()) {
        this.browser.setBackgroundColor(nativeTheme.shouldUseDarkColors ? '#0c0c0d' : '#fbfbfa');
      }
    });
  }

  show(): void {
    if (this.browser.isMinimized()) this.browser.restore();
    this.browser.show();
    this.browser.focus();
  }
}
