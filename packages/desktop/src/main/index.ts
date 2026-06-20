import path from 'node:path';
import { app, globalShortcut, shell } from 'electron';
import {
  PRICING_NOTE,
  UsageEngine,
  type UsageSnapshot,
  type WidgetConfig,
} from '@claude-widget/core';
import { autoUpdater } from 'electron-updater';
import { detectCliVersion, resolveIconPath } from './app-paths';
import { BudgetAlerter } from './budget-alerts';
import { ConfigStore } from './config-store';
import { registerIpc } from './ipc';
import { createAppLogger } from './logger';
import { createTray, type TrayHandle } from './tray';
import { WidgetWindow } from './window';
import { IPC, type AppInfo } from '../shared/ipc';

const singleInstanceLock = app.requestSingleInstanceLock();

if (!singleInstanceLock) {
  app.quit();
} else {
  let widgetWindow: WidgetWindow | null = null;
  let isQuitting = false;

  app.on('second-instance', () => widgetWindow?.show());
  app.on('before-quit', () => {
    isQuitting = true;
  });
  // This is a tray app: closing the window hides it, so stay alive.
  app.on('window-all-closed', () => {});

  app
    .whenReady()
    .then(bootstrap)
    .catch((err) => {
      console.error('Fatal startup error', err);
      app.quit();
    });

  async function bootstrap(): Promise<void> {
    const userData = app.getPath('userData');
    const configStore = new ConfigStore(userData);
    let config = configStore.get();

    const { logger, logFilePath } = createAppLogger(path.join(userData, 'logs'), config.logLevel);
    logger.info('claudget starting', {
      version: app.getVersion(),
      platform: process.platform,
    });

    const cliVersion = detectCliVersion(config.claudeDir);
    logger.info('Detected Claude CLI version', { cliVersion });

    // macOS: run as a menu-bar accessory (no Dock icon). This is what lets the
    // window follow you onto every Space and over fullscreen apps — a regular
    // foreground app pins its windows to the Space they were opened on. The
    // tray menu is the control surface; the Dock icon would just be clutter.
    if (process.platform === 'darwin') app.setActivationPolicy('accessory');

    const engine = new UsageEngine({ config, logger, cliVersion });

    widgetWindow = new WidgetWindow({
      preloadPath: path.join(__dirname, '../preload/index.js'),
      rendererUrl: process.env['ELECTRON_RENDERER_URL'],
      rendererFile: path.join(__dirname, '../renderer/index.html'),
      iconPath: resolveIconPath(),
      statePath: path.join(userData, 'window-state.json'),
      config,
    });
    const win = widgetWindow.browser;
    let trayHandle: TrayHandle | null = null;

    // The render frame can be disposed between the guard and the send (dev
    // reload, window close), so the try/catch is load-bearing, not paranoia.
    const push = (channel: string, payload: unknown): void => {
      if (win.isDestroyed() || win.webContents.isDestroyed() || win.webContents.isLoading()) return;
      try {
        win.webContents.send(channel, payload);
      } catch {
        // frame went away mid-send — next snapshot will reach the new frame
      }
    };
    const sendSnapshot = (snapshot: UsageSnapshot): void => push(IPC.SnapshotPush, snapshot);
    const sendConfig = (cfg: WidgetConfig): void => push(IPC.ConfigPush, cfg);

    const budgetAlerter = new BudgetAlerter(logger);

    engine.on('snapshot', sendSnapshot);
    engine.on('snapshot', (s) => budgetAlerter.check(s, config));
    engine.on('error', (err) => logger.error('Engine error', err));

    const applyConfig = (patch: Partial<WidgetConfig>): WidgetConfig => {
      config = configStore.set(patch);
      engine.updateConfig(patch);
      widgetWindow?.applyConfig(config);
      logger.setLevel(config.logLevel);
      app.setLoginItemSettings({ openAtLogin: config.launchOnLogin });
      sendConfig(config);
      trayHandle?.syncMenu();
      return config;
    };

    const getAppInfo = (): AppInfo => ({
      appVersion: app.getVersion(),
      cliVersion,
      platform: process.platform,
      logFilePath,
      configFilePath: configStore.filePath,
      claudeDir: engine.getSnapshot().meta.claudeDir,
      pricingNote: PRICING_NOTE,
    });

    registerIpc({
      engine,
      getConfig: () => config,
      setConfig: applyConfig,
      getWindow: () => (win.isDestroyed() ? null : win),
      getAppInfo,
      requestClose: () => win.hide(),
    });

    trayHandle = createTray({
      iconPath: resolveIconPath(),
      getConfig: () => config,
      setConfig: applyConfig,
      toggleVisibility: () => widgetWindow?.toggleVisibility(),
      refresh: () => void engine.refresh(),
      openLogs: () => void shell.openPath(logFilePath),
      openConfigFile: () => void shell.openPath(configStore.filePath),
      quit: () => {
        isQuitting = true;
        app.quit();
      },
    });

    win.on('close', (event) => {
      if (!isQuitting) {
        event.preventDefault();
        win.hide();
      }
    });
    win.once('ready-to-show', () => win.show());
    win.webContents.on('did-finish-load', () => {
      sendSnapshot(engine.getSnapshot());
      sendConfig(config);
    });

    globalShortcut.register('CommandOrControl+Alt+U', () => widgetWindow?.toggleVisibility());
    globalShortcut.register('CommandOrControl+Alt+C', () =>
      applyConfig({ clickThrough: !config.clickThrough }),
    );

    app.setLoginItemSettings({ openAtLogin: config.launchOnLogin });
    app.on('will-quit', () => {
      globalShortcut.unregisterAll();
      void engine.stop();
    });

    await engine.start();
    logger.info('Engine started');

    // Auto-update from GitHub Releases (config comes from electron-builder's
    // publish block). Windows/Linux only: macOS builds are unsigned and
    // Squirrel.Mac refuses to update without a valid signature. Packaged only.
    if (app.isPackaged && process.platform !== 'darwin') {
      const check = (): void => {
        autoUpdater.checkForUpdatesAndNotify().catch((err) => {
          logger.warn('Update check failed', { err: String(err) });
        });
      };
      check();
      setInterval(check, 6 * 60 * 60 * 1000); // re-check every 6h
    }
  }
}
