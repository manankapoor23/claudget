import fs from 'node:fs';
import { app, type BrowserWindow } from 'electron';
import type { Notifier } from './notifier';

/**
 * Developer hooks, both off unless their env var is set:
 *
 * - `CLAUDGET_USER_DATA=<dir>` runs against a separate data directory, so a
 *   dev build can run next to the installed app (the single-instance lock and
 *   all state live in userData). Must run before `requestSingleInstanceLock`.
 * - `CLAUDGET_NOTIFY_TEST=1` sends the Settings → Alerts test notification a
 *   few seconds after launch and logs what the OS made of it. How a packaged
 *   build's notifications are checked without clicking through Settings.
 * - `CLAUDGET_MEMLOG=<file>` appends one JSON line of memory use per process
 *   (main, renderers, GPU, utility) every 15 s — how the before/after numbers
 *   in the memory work were taken.
 */
export function applyUserDataOverride(): void {
  const dir = process.env['CLAUDGET_USER_DATA'];
  if (dir) app.setPath('userData', dir);
}

/**
 * `CLAUDGET_SELFTEST=popover`: opens and closes the popover a few times (the
 * same call a tray click makes) and logs, per open, how long until the window
 * was on screen and whether claudget became the active app (it must not: an
 * app activation is what switches Spaces). The first open is cold when the
 * popover hasn't been built yet.
 */
export function runPopoverSelfTest(deps: {
  open: () => void;
  close: () => void;
  window: () => BrowserWindow | null;
  log: (msg: string, data: Record<string, unknown>) => void;
}): void {
  if (process.env['CLAUDGET_SELFTEST'] !== 'popover') return;
  let activations = 0;
  app.on('did-become-active', () => {
    activations += 1;
  });
  const once = (i: number): void => {
    const t0 = performance.now();
    const before = activations;
    deps.open();
    const poll = setInterval(() => {
      const win = deps.window();
      if (!win || !win.isVisible()) return;
      clearInterval(poll);
      const visibleMs = Math.round((performance.now() - t0) * 10) / 10;
      setTimeout(() => {
        deps.log('selftest popover', {
          run: i,
          visibleMs,
          focused: win.isFocused(),
          appActivated: activations > before,
          allSpaces: win.isVisibleOnAllWorkspaces(),
        });
        deps.close();
        if (i < 5) setTimeout(() => once(i + 1), 1500);
      }, 300);
    }, 1);
  };
  setTimeout(() => once(1), 500);
}

export function startMemoryLog(): void {
  const file = process.env['CLAUDGET_MEMLOG'];
  if (!file) return;
  const write = (): void => {
    const main = process.memoryUsage();
    const line = {
      t: Date.now(),
      main: {
        rssKB: Math.round(main.rss / 1024),
        heapUsedKB: Math.round(main.heapUsed / 1024),
        heapTotalKB: Math.round(main.heapTotal / 1024),
        externalKB: Math.round(main.external / 1024),
        arrayBuffersKB: Math.round(main.arrayBuffers / 1024),
      },
      processes: app.getAppMetrics().map((m) => ({
        pid: m.pid,
        type: m.type,
        name: m.name ?? null,
        workingSetKB: m.memory.workingSetSize,
        privateKB: m.memory.privateBytes ?? null,
      })),
    };
    try {
      fs.appendFileSync(file, JSON.stringify(line) + '\n');
    } catch {
      // diagnostics only
    }
  };
  write();
  setInterval(write, 15_000).unref();
}

export function runNotificationSelfTest(
  notifier: Notifier,
  log: (msg: string, data: Record<string, unknown>) => void,
): void {
  if (!process.env['CLAUDGET_NOTIFY_TEST']) return;
  setTimeout(() => {
    void notifier.test().then((outcome) => {
      log('selftest notification', { ...outcome });
      log('selftest notification status', { ...notifier.status() });
    });
  }, 3_000);
}
