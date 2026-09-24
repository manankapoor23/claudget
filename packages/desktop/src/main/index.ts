import fs from 'node:fs';
import path from 'node:path';
import { app, globalShortcut, Menu, nativeTheme, shell, type BrowserWindow } from 'electron';
import {
  PRICING_NOTE,
  UsageEngine,
  type UsageSnapshot,
  type WidgetConfig,
} from '@claude-widget/core';
import { autoUpdater } from 'electron-updater';
import { buildAppMenu } from './app-menu';
import { detectCliVersion, resolveIconPath } from './app-paths';
import { BudgetAlerter } from './budget-alerts';
import { ConfigStore } from './config-store';
import { registerIpc } from './ipc';
import { createAppLogger } from './logger';
import { LimitAlerter } from './limit-alerts';
import { LimitHistoryStore } from './limit-history';
import { MiniBar } from './minibar';
import { SettingsWindow } from './settings-window';
import { Pill } from './pill';
import { Popover } from './popover';
import { createTray, type TrayHandle } from './tray';
import { WidgetWindow } from './window';
import { IPC, type AppInfo, type DashboardView } from '../shared/ipc';

const singleInstanceLock = app.requestSingleInstanceLock();

if (!singleInstanceLock) {
  app.quit();
} else {
  let isQuitting = false;
  // Relaunching an already-running claudget shows the glance, not a second copy.
  let onSecondInstance: () => void = () => {};

  app.on('second-instance', () => onSecondInstance());
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

    const renderer = {
      preloadPath: path.join(__dirname, '../preload/index.js'),
      rendererUrl: process.env['ELECTRON_RENDERER_URL'],
      rendererFile: path.join(__dirname, '../renderer/index.html'),
    };

    // Three surfaces, one renderer bundle:
    //   popover   — the menu-bar dropdown, the everyday glance
    //   pill      — the optional floating strip (config `compact`)
    //   dashboard — the full window, opened on demand
    const dashboard = new WidgetWindow({
      ...renderer,
      iconPath: resolveIconPath(),
      statePath: path.join(userData, 'window-state.json'),
      config,
    });
    const popover = new Popover(renderer);
    const pill = new Pill({ ...renderer, statePath: path.join(userData, 'pill-state.json') });
    const settingsWin = new SettingsWindow({ ...renderer, iconPath: resolveIconPath() });
    const miniBar = new MiniBar({
      ...renderer,
      statePath: path.join(userData, 'minibar-state.json'),
    });
    const surfaces = (): BrowserWindow[] => [
      dashboard.browser,
      popover.browser,
      pill.browser,
      settingsWin.browser,
      miniBar.browser,
    ];
    const history = new LimitHistoryStore(path.join(userData, 'limit-history.json'), logger);
    const welcomed = path.join(userData, 'welcomed');
    const firstRun = !fs.existsSync(welcomed);
    let trayHandle: TrayHandle | null = null;

    // The render frame can be disposed between the guard and the send (dev
    // reload, window close), so the try/catch is load-bearing, not paranoia.
    const pushTo = (win: BrowserWindow, channel: string, payload: unknown): void => {
      if (win.isDestroyed() || win.webContents.isDestroyed() || win.webContents.isLoading()) return;
      try {
        win.webContents.send(channel, payload);
      } catch {
        // frame went away mid-send — next snapshot will reach the new frame
      }
    };
    const broadcast = (channel: string, payload: unknown): void => {
      for (const win of surfaces()) pushTo(win, channel, payload);
    };
    const sendSnapshot = (snapshot: UsageSnapshot): void => broadcast(IPC.SnapshotPush, snapshot);
    const sendConfig = (cfg: WidgetConfig): void => broadcast(IPC.ConfigPush, cfg);

    // macOS: claudget is menu-bar-only until a real window (dashboard or
    // settings) opens; then it's a regular app — Dock icon, app menu,
    // ⌘-shortcuts — until the last of them closes.
    const MAC = process.platform === 'darwin';
    const becomeRegular = (): void => {
      if (!MAC) return;
      void app.setActivationPolicy('regular');
      app.focus({ steal: true });
    };
    const syncActivation = (): void => {
      if (!MAC) return;
      const open = [dashboard.browser, settingsWin.browser].some(
        (w) => !w.isDestroyed() && w.isVisible(),
      );
      if (!open) void app.setActivationPolicy('accessory');
    };
    const openDashboard = (view?: DashboardView): void => {
      if (view === 'settings') return openSettings();
      popover.hide();
      becomeRegular();
      dashboard.show();
      if (view) pushTo(dashboard.browser, IPC.Navigate, view);
    };
    const openSettings = (): void => {
      popover.hide();
      becomeRegular();
      settingsWin.show();
    };
    for (const w of [dashboard.browser, settingsWin.browser]) w.on('hide', syncActivation);
    // Clicking the Dock icon brings the dashboard back.
    app.on('activate', () => openDashboard());
    const togglePopover = (): void => popover.toggle(trayHandle?.tray.getBounds() ?? null);
    const showPopover = (): void => popover.show(trayHandle?.tray.getBounds() ?? null);
    onSecondInstance = showPopover;

    const budgetAlerter = new BudgetAlerter(logger);
    const limitAlerter = new LimitAlerter(path.join(userData, 'limit-alerts.json'), logger);

    engine.on('snapshot', sendSnapshot);
    engine.on('snapshot', (s) => trayHandle?.setStatus(s));
    engine.on('snapshot', (s) => budgetAlerter.check(s, config));
    engine.on('snapshot', (s) => limitAlerter.check(s, config));
    engine.on('snapshot', (s) => {
      const next = history.record(s);
      if (next) broadcast(IPC.LimitHistoryPush, next);
    });
    engine.on('error', (err) => logger.error('Engine error', err));

    // ponytail: only do the expensive bits when the field they depend on actually
    // changed. The opacity slider fires onChange on every pointer move (~30-60/s),
    // and setLoginItemSettings alone is a ~9ms privileged LaunchServices call on
    // macOS 26 — unconditionally re-running it beachballed the whole app mid-drag.
    const applyConfig = (patch: Partial<WidgetConfig>): WidgetConfig => {
      const prev = config;
      config = configStore.set(patch);
      engine.updateConfig(patch);
      dashboard.applyConfig(config);
      if (config.compact !== prev.compact) pill.setVisible(config.compact);
      if (config.miniBar !== prev.miniBar) miniBar.setVisible(config.miniBar);
      if (config.logLevel !== prev.logLevel) logger.setLevel(config.logLevel);
      if (config.launchOnLogin !== prev.launchOnLogin) {
        app.setLoginItemSettings({ openAtLogin: config.launchOnLogin });
      }
      sendConfig(config);
      // Only the fields the tray menu actually renders as checkboxes.
      if (
        config.alwaysOnTop !== prev.alwaysOnTop ||
        config.clickThrough !== prev.clickThrough ||
        config.compact !== prev.compact ||
        config.miniBar !== prev.miniBar
      ) {
        trayHandle?.syncMenu();
        syncAppMenu();
      }
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
      firstRun,
    });

    const quit = (): void => {
      isQuitting = true;
      app.quit();
    };
    const syncAppMenu = (): void => {
      if (!MAC) return;
      Menu.setApplicationMenu(
        buildAppMenu({
          getConfig: () => config,
          setConfig: applyConfig,
          openDashboard,
          openSettings,
          refresh: () => void engine.refresh(),
          quit,
        }),
      );
    };
    syncAppMenu();
    // What ⌘-menu "About claudget" shows.
    app.setAboutPanelOptions({
      applicationName: 'claudget',
      applicationVersion: app.getVersion(),
      copyright: 'MIT licensed · claudget contributors',
      credits:
        'Claude Code usage in your menu bar. Reads your local transcripts; plan limits come straight from Anthropic.',
      website: 'https://claudget.vercel.app',
      iconPath: resolveIconPath(),
    });
    // Dev builds run inside Electron's own bundle; give the Dock the real icon.
    if (MAC && !app.isPackaged) {
      const dockIcon = path.join(__dirname, '../../resources/icon-mac.png');
      if (fs.existsSync(dockIcon)) app.dock?.setIcon(dockIcon);
    }
    // Keep the opaque window's ground right when the OS appearance flips.
    nativeTheme.on('updated', () => dashboard.syncGround());

    registerIpc({
      engine,
      getConfig: () => config,
      setConfig: applyConfig,
      getAppInfo,
      openDashboard,
      openSettings,
      getLimitHistory: () => history.get(),
      startPillDrag: (x, y) => pill.startDrag(x, y),
      endPillDrag: () => pill.endDrag(),
      fitPopover: (h) => popover.setContentHeight(h),
      quit,
    });

    trayHandle = createTray({
      iconPath: resolveIconPath(),
      getConfig: () => config,
      setConfig: applyConfig,
      togglePopover,
      openDashboard: () => openDashboard(),
      openSettings,
      refresh: () => void engine.refresh(),
      openLogs: () => void shell.openPath(logFilePath),
      openConfigFile: () => void shell.openPath(configStore.filePath),
      quit,
    });

    // Closing any surface hides it; the app lives in the menu bar until Quit.
    for (const win of surfaces()) {
      // Links (About, release notes) open in the browser — never in-app.
      win.webContents.setWindowOpenHandler(({ url }) => {
        if (/^https:\/\//.test(url)) void shell.openExternal(url);
        return { action: 'deny' };
      });
      win.webContents.on('will-navigate', (event, url) => {
        if (!url.startsWith('http://localhost') && !url.startsWith('file://'))
          event.preventDefault();
      });
      win.on('close', (event) => {
        if (!isQuitting) {
          event.preventDefault();
          win.hide();
        }
      });
      win.webContents.on('did-finish-load', () => {
        pushTo(win, IPC.SnapshotPush, engine.getSnapshot());
        pushTo(win, IPC.ConfigPush, config);
      });
    }
    // Nothing opens itself at launch except the pill (if enabled) — and, the
    // very first time, the popover, so a new user can see where claudget lives.
    pill.browser.once('ready-to-show', () => pill.setVisible(config.compact));
    miniBar.browser.once('ready-to-show', () => miniBar.setVisible(config.miniBar));
    if (firstRun) {
      popover.browser.once('ready-to-show', () => {
        // Give the tray a moment to get real bounds before anchoring under it.
        setTimeout(showPopover, 400);
        try {
          fs.writeFileSync(welcomed, new Date().toISOString(), 'utf8');
        } catch {
          // Non-fatal: they'll just see the welcome again.
        }
      });
    }

    globalShortcut.register('CommandOrControl+Alt+U', togglePopover);
    globalShortcut.register('CommandOrControl+Alt+C', () =>
      applyConfig({ clickThrough: !config.clickThrough }),
    );

    // Only assert this when it's actually wanted. It's a slow privileged call and
    // on macOS 26 an unsigned/dev build gets "Operation not permitted" — no reason
    // to pay for it (or log an error) just to set the default of "off" to "off".
    if (config.launchOnLogin) app.setLoginItemSettings({ openAtLogin: true });
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
