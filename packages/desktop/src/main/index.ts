import fs from 'node:fs';
import path from 'node:path';
import {
  app,
  globalShortcut,
  Menu,
  nativeTheme,
  powerMonitor,
  screen,
  shell,
  type BrowserWindow,
  type Rectangle,
} from 'electron';
import {
  FileCalibrationStore,
  PRICING_NOTE,
  UsageEngine,
  type UsageSnapshot,
  type WidgetConfig,
} from '@claude-widget/core';
import { autoUpdater } from 'electron-updater';
import { buildAppMenu } from './app-menu';
import { detectCliVersion, resolveIconPath, resolveTrayIconDir } from './app-paths';
import { probeCompositor, transparencyFor } from './compositor';
import { queryPointer } from './x11';
import { readSandboxFacts, sandboxStatus } from './sandbox';
import { applyUserDataOverride, runPopoverSelfTest, startMemoryLog } from './diagnostics';
import { BudgetAlerter } from './budget-alerts';
import { ConfigStore } from './config-store';
import { registerIpc } from './ipc';
import { hasStatusNotifierHost, launchSurface, trayLikelyVisible } from './launch-policy';
import { LazyWindow } from './lazy-window';
import { createAppLogger } from './logger';
import { LimitAlerter } from './limit-alerts';
import { LimitHistoryStore } from './limit-history';
import { MiniBar } from './minibar';
import { NotchLine, resolveNotchHelper } from './notch';
import { SettingsWindow } from './settings-window';
import { Pill } from './pill';
import { Popover } from './popover';
import { createTray, type TrayHandle } from './tray';
import { WidgetWindow } from './window';
import { IPC, type AppInfo, type DashboardView } from '../shared/ipc';
import { popoverAnchor } from '../shared/placement';
import { notchPayload } from '../shared/notch';

applyUserDataOverride();
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

    // What the live % estimate has learned about the limits, kept across restarts.
    const calibration = new FileCalibrationStore(
      path.join(userData, 'limit-calibration.json'),
      logger,
    );
    const engine = new UsageEngine({ config, logger, cliVersion, calibrationStore: calibration });

    // Linux: transparent windows need a compositor, or their clear pixels are
    // drawn black. Ask the X server before the first window is made.
    const transparency =
      process.platform === 'linux'
        ? transparencyFor(
            process.platform,
            process.env['XDG_SESSION_TYPE'],
            await probeCompositor().catch(() => null),
          )
        : 'transparent';
    if (process.platform === 'linux') {
      logger.info('Display', {
        session: process.env['XDG_SESSION_TYPE'] ?? null,
        transparency,
        sandbox: sandboxStatus({
          ...readSandboxFacts(),
          noSandboxSwitch: app.commandLine.hasSwitch('no-sandbox'),
        }).reason,
      });
    }

    const renderer = {
      preloadPath: path.join(__dirname, '../preload/index.js'),
      rendererUrl: process.env['ELECTRON_RENDERER_URL'],
      rendererFile: path.join(__dirname, '../renderer/index.html'),
      opaque: transparency === 'opaque',
    };

    // Native menus, dialogs and the tray follow the user's theme choice.
    nativeTheme.themeSource = config.theme;

    const history = new LimitHistoryStore(path.join(userData, 'limit-history.json'), logger);
    const welcomed = path.join(userData, 'welcomed');
    const firstRun = !fs.existsSync(welcomed);
    let trayHandle: TrayHandle | null = null;
    let trayAvailable = true;

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
    /** Windows that have painted once; a fresh one is shown only after that. */
    const painted = new WeakSet<BrowserWindow>();
    const whenPainted = (win: BrowserWindow, fn: () => void): void => {
      if (painted.has(win)) fn();
      else win.once('ready-to-show', fn);
    };

    // Everything a surface window needs regardless of which one it is.
    const wire = (win: BrowserWindow): void => {
      win.once('ready-to-show', () => painted.add(win));
      // Links (About, release notes) open in the browser — never in-app.
      win.webContents.setWindowOpenHandler(({ url }) => {
        if (/^https:\/\//.test(url)) void shell.openExternal(url);
        return { action: 'deny' };
      });
      win.webContents.on('will-navigate', (event, url) => {
        if (!url.startsWith('http://localhost') && !url.startsWith('file://'))
          event.preventDefault();
      });
      // Closing hides; the app lives in the menu bar until Quit. A hidden
      // dashboard or settings window is then destroyed after a few idle
      // minutes, so reopening right away is instant and later is cheap.
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
      // A dead renderer leaves a blank window behind for good. Drop it; the
      // next open builds a fresh one.
      win.webContents.on('render-process-gone', (_event, details) => {
        logger.warn('Renderer gone; dropping its window', { reason: details.reason });
        if (!win.isDestroyed()) win.destroy();
        if (!isQuitting) setTimeout(syncFloating, 1000);
      });
    };

    // Someone is about to look: if the plan limits are at least 180s old, check
    // them now. Hooked per window instance, since these windows are created on
    // demand (and the dashboard re-created after it idles out).
    const nudgeOnShow = (win: BrowserWindow): void => {
      win.on('show', () => engine.nudgeOfficial('opened'));
    };

    // Five surfaces, one renderer bundle, and each window is its own renderer
    // process (~40-60 MB), so none exists until it's wanted:
    //   popover   — the menu-bar dropdown, the everyday glance; created soon
    //               after launch and kept, so a click opens it instantly
    //   pill, bar — the optional floating surfaces; exist only while enabled
    //   dashboard, settings — opened on demand; destroyed once they have
    //               been closed (hidden) for a few minutes
    const IDLE_DESTROY_MS = 3 * 60_000;
    const dashboard = new LazyWindow({
      create: () =>
        new WidgetWindow({
          ...renderer,
          iconPath: resolveIconPath(),
          statePath: path.join(userData, 'window-state.json'),
          config,
        }),
      onCreate: (d) => {
        wire(d.browser);
        nudgeOnShow(d.browser);
        d.browser.on('hide', syncActivation);
        d.browser.on('closed', syncActivation);
      },
      idleDestroyMs: IDLE_DESTROY_MS,
    });
    const settingsWin = new LazyWindow({
      create: () => new SettingsWindow({ ...renderer, iconPath: resolveIconPath() }),
      onCreate: (s) => {
        wire(s.browser);
        s.browser.on('hide', syncActivation);
        s.browser.on('closed', syncActivation);
      },
      idleDestroyMs: IDLE_DESTROY_MS,
    });
    const popover = new LazyWindow({
      create: () => new Popover(renderer),
      onCreate: (p) => {
        wire(p.browser);
        nudgeOnShow(p.browser);
      },
    });
    const pill = new LazyWindow({
      create: () =>
        new Pill({ ...renderer, statePath: path.join(userData, 'pill-state.json'), logger }),
      onCreate: (p) => wire(p.browser),
    });
    const miniBar = new LazyWindow({
      create: () =>
        new MiniBar({ ...renderer, statePath: path.join(userData, 'minibar-state.json') }),
      onCreate: (m) => wire(m.browser),
    });
    const surfaces = (): BrowserWindow[] =>
      [dashboard, popover, pill, settingsWin, miniBar].flatMap((w) => {
        const live = w.peek();
        return live ? [live.browser] : [];
      });

    const broadcast = (channel: string, payload: unknown): void => {
      for (const win of surfaces()) pushTo(win, channel, payload);
    };
    const sendSnapshot = (snapshot: UsageSnapshot): void => broadcast(IPC.SnapshotPush, snapshot);
    const sendConfig = (cfg: WidgetConfig): void => broadcast(IPC.ConfigPush, cfg);

    /** The pill and the floating bar exist exactly while they're switched on. */
    const setFloating = <T extends Pill | MiniBar>(lazy: LazyWindow<T>, on: boolean): void => {
      if (!on) return lazy.destroy();
      const w = lazy.get();
      whenPainted(w.browser, () => {
        if (!w.browser.isDestroyed()) w.setVisible(true);
      });
    };
    function syncFloating(): void {
      setFloating(pill, config.compact);
      setFloating(miniBar, config.miniBar);
    }

    // macOS: claudget is menu-bar-only until a real window (dashboard or
    // settings) opens; then it's a regular app — Dock icon, app menu,
    // ⌘-shortcuts — until the last of them closes.
    const MAC = process.platform === 'darwin';
    const becomeRegular = (): void => {
      if (!MAC) return;
      void app.setActivationPolicy('regular');
      app.focus({ steal: true });
    };
    function syncActivation(): void {
      if (!MAC) return;
      if (!dashboard.isVisible() && !settingsWin.isVisible()) {
        void app.setActivationPolicy('accessory');
      }
    }
    const openDashboard = (view?: DashboardView): void => {
      if (view === 'settings') return openSettings();
      popover.peek()?.hide();
      const d = dashboard.get();
      whenPainted(d.browser, () => {
        if (d.browser.isDestroyed()) return;
        becomeRegular();
        d.show();
        if (!view) return;
        const contents = d.browser.webContents;
        const navigate = (): void => pushTo(d.browser, IPC.Navigate, view);
        if (contents.isLoading()) contents.once('did-finish-load', navigate);
        else navigate();
      });
    };
    const openSettings = (): void => {
      popover.peek()?.hide();
      const s = settingsWin.get();
      whenPainted(s.browser, () => {
        if (s.browser.isDestroyed()) return;
        becomeRegular();
        s.show();
      });
    };
    // Clicking the Dock icon brings the dashboard back.
    app.on('activate', () => openDashboard());
    // Where to put the popover. The tray icon's bounds where the OS reports
    // them; on Linux it reports zeros, so a click on the tray is anchored at
    // the pointer that made it, and remembered for the keyboard shortcut.
    // Linux asks the X server where the pointer is: Chromium's own answer is
    // its last-seen position, stale while the pointer was over the panel.
    let lastTrayPoint: Rectangle | null = null;
    const pointer = async (): Promise<{ x: number; y: number }> => {
      if (process.platform === 'linux') {
        const p = await queryPointer().catch(() => null);
        if (p) {
          const scale = screen.getPrimaryDisplay().scaleFactor || 1;
          return { x: Math.round(p.x / scale), y: Math.round(p.y / scale) };
        }
      }
      return screen.getCursorScreenPoint();
    };
    /** What opened it: a tray click, the tray menu's "Open claudget", or anything else. */
    type PopoverSource = 'tray' | 'menu' | 'other';
    const popoverAt = async (source: PopoverSource): Promise<Rectangle | null> => {
      const bounds = trayHandle?.tray.getBounds() ?? null;
      // From the menu the pointer is on a menu item, a little off the icon;
      // the last click on the icon itself is the better anchor.
      const usePointer = source === 'tray' || (source === 'menu' && !lastTrayPoint);
      const cursor = usePointer ? await pointer() : null;
      const anchor = popoverAnchor(bounds, cursor);
      if (source === 'tray' && anchor) lastTrayPoint = anchor;
      logger.debug('Popover anchor', { source, bounds, cursor, anchor: anchor ?? lastTrayPoint });
      return anchor ?? lastTrayPoint;
    };
    const togglePopover = (source: PopoverSource = 'other'): void => {
      void popoverAt(source).then((anchor) => {
        const p = popover.get();
        whenPainted(p.browser, () => {
          if (!p.browser.isDestroyed()) p.toggle(anchor);
        });
      });
    };
    const showPopover = (source: PopoverSource = 'other'): void => {
      void popoverAt(source).then((anchor) => {
        const p = popover.get();
        whenPainted(p.browser, () => {
          if (!p.browser.isDestroyed()) p.show(anchor);
        });
      });
    };
    // Relaunching shows the glance — or, with no tray to anchor it to, the
    // dashboard, which is the only way in.
    onSecondInstance = () => (trayAvailable ? showPopover() : openDashboard());

    // macOS, notched MacBooks: the 5-hour limit as a line round the notch,
    // drawn by a small native helper. See main/notch.ts.
    const notchHelper = MAC ? resolveNotchHelper(app.isPackaged, app.getAppPath()) : null;
    if (MAC) logger.info('Notch helper', { path: notchHelper });
    const notch = MAC
      ? new NotchLine({
          helperPath: notchHelper,
          logger: logger.child('notch'),
          onOpen: () => togglePopover('other'),
        })
      : null;
    // Plan limits off means there's no 5-hour % to draw: don't run it at all.
    const notchWanted = (cfg: WidgetConfig): boolean => cfg.notchLine && cfg.enableOfficial;
    if (notch) {
      notch.update(notchPayload(engine.getSnapshot(), Date.now()));
      void notch.reprobe().then(() => notch.setEnabled(notchWanted(config)));
      // Lid closed or opened, a display plugged in, scaling changed.
      let displayTimer: ReturnType<typeof setTimeout> | null = null;
      const displaysChanged = (): void => {
        if (displayTimer) clearTimeout(displayTimer);
        displayTimer = setTimeout(() => notch.displaysChanged(), 1_000);
      };
      screen.on('display-added', displaysChanged);
      screen.on('display-removed', displaysChanged);
      screen.on('display-metrics-changed', displaysChanged);
      engine.on('snapshot', (s) => notch.update(notchPayload(s, Date.now())));
    }

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

    // Plan limits are polled every few minutes. When the Mac wakes with an old
    // reading, check now (the popover and dashboard do the same when shown,
    // see nudgeOnShow) — the engine only polls if the last check is at least
    // 180s old, so these can never raise the request rate.
    // Give the network a moment to come back after wake.
    powerMonitor.on('resume', () => setTimeout(() => engine.nudgeOfficial('wake'), 5_000));

    // ponytail: only do the expensive bits when the field they depend on actually
    // changed. The opacity slider fires onChange on every pointer move (~30-60/s),
    // and setLoginItemSettings alone is a ~9ms privileged LaunchServices call on
    // macOS 26 — unconditionally re-running it beachballed the whole app mid-drag.
    const applyConfig = (patch: Partial<WidgetConfig>): WidgetConfig => {
      const prev = config;
      config = configStore.set(patch);
      engine.updateConfig(patch);
      if (config.theme !== prev.theme) nativeTheme.themeSource = config.theme;
      dashboard.peek()?.applyConfig(config);
      if (config.compact !== prev.compact || config.miniBar !== prev.miniBar) syncFloating();
      if (config.logLevel !== prev.logLevel) logger.setLevel(config.logLevel);
      notch?.setEnabled(notchWanted(config));
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
      trayAvailable,
      notch: notch?.hasNotch ?? null,
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
    nativeTheme.on('updated', () => dashboard.peek()?.syncGround());

    registerIpc({
      engine,
      getConfig: () => config,
      setConfig: applyConfig,
      getAppInfo,
      openDashboard,
      openSettings,
      getLimitHistory: () => history.get(),
      startPillDrag: (x, y) => pill.peek()?.startDrag(x, y),
      endPillDrag: () => pill.peek()?.endDrag(),
      nudgePill: (dx, dy) => pill.peek()?.nudge(dx, dy),
      shapePill: (rect, radius) => pill.peek()?.setShapeFrom(rect, radius),
      fitPopover: (h) => popover.peek()?.setContentHeight(h),
      quit,
    });

    try {
      trayHandle = createTray({
        trayIconDir: resolveTrayIconDir(),
        getConfig: () => config,
        setConfig: applyConfig,
        togglePopover: () => togglePopover('tray'),
        showPopover: () => showPopover('menu'),
        openDashboard: () => openDashboard(),
        openSettings,
        refresh: () => void engine.refresh(),
        openLogs: () => void shell.openPath(logFilePath),
        openConfigFile: () => void shell.openPath(configStore.filePath),
        quit,
      });
    } catch (err) {
      logger.error('Could not create the tray icon', err);
    }
    // Linux: a tray icon only shows if the desktop hosts one (stock GNOME
    // doesn't). Without one, the dashboard is the way in.
    const sniHost = process.platform === 'linux' ? await hasStatusNotifierHost() : null;
    trayAvailable =
      trayHandle !== null &&
      trayLikelyVisible(process.platform, sniHost, process.env['XDG_CURRENT_DESKTOP']);
    logger.info('Tray', { trayAvailable, sniHost });

    // Nothing opens itself at launch except the pill / bar (if enabled), plus
    // the first-run hello (popover on macOS/Windows, dashboard on Linux), and
    // the dashboard whenever there's no tray to reach claudget from.
    syncFloating();
    const atLaunch = launchSurface({ platform: process.platform, firstRun, trayAvailable });
    // Give the tray a moment to get real bounds before anchoring under it.
    if (atLaunch === 'popover') setTimeout(showPopover, 400);
    else if (atLaunch === 'dashboard') openDashboard();
    if (firstRun) {
      try {
        fs.writeFileSync(welcomed, new Date().toISOString(), 'utf8');
      } catch {
        // Non-fatal: they'll just see the welcome again.
      }
    }

    globalShortcut.register('CommandOrControl+Alt+U', () => togglePopover());

    // Windows: when Explorer restarts (a crash, an update), it puts tray
    // icons back without their tooltips and forgets which windows asked to
    // stay off the taskbar, so the pill and the floating bar turned up as
    // taskbar buttons. Explorer announces itself with the registered
    // "TaskbarCreated" message, whose number Electron can't look up for us,
    // and no work-area or display event comes with it. So, every few seconds,
    // re-assert both: a tooltip set to the same text and a DeleteTab on a
    // window that has no tab are no-ops for the shell, a couple of Win32
    // calls in all. Shown windows also re-assert when they're shown.
    if (process.platform === 'win32') {
      const reassertShell = (): void => {
        trayHandle?.reassert();
        for (const w of [pill.peek(), miniBar.peek()]) {
          if (w && !w.browser.isDestroyed() && w.browser.isVisible())
            w.browser.setSkipTaskbar(true);
        }
        const d = dashboard.peek();
        if (d && !d.browser.isDestroyed() && !config.showInTaskbar) d.browser.setSkipTaskbar(true);
      };
      setInterval(reassertShell, 10_000).unref();
    }
    globalShortcut.register('CommandOrControl+Alt+C', () =>
      applyConfig({ clickThrough: !config.clickThrough }),
    );

    // Only assert this when it's actually wanted. It's a slow privileged call and
    // on macOS 26 an unsigned/dev build gets "Operation not permitted" — no reason
    // to pay for it (or log an error) just to set the default of "off" to "off".
    if (config.launchOnLogin) app.setLoginItemSettings({ openAtLogin: true });
    app.on('will-quit', () => {
      globalShortcut.unregisterAll();
      notch?.dispose();
      calibration.flush();
      void engine.stop();
    });

    await engine.start();
    logger.info('Engine started');
    // Build the popover once launch has settled, so the first click on the
    // menu-bar item shows it at once instead of waiting on a new renderer.
    if (trayAvailable && !process.env['CLAUDGET_SELFTEST']) setTimeout(() => popover.get(), 1500);
    startMemoryLog();
    runPopoverSelfTest({
      open: togglePopover,
      close: () => popover.peek()?.hide(),
      window: () => popover.peek()?.browser ?? null,
      log: (msg, data) => logger.info(msg, data),
    });

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
