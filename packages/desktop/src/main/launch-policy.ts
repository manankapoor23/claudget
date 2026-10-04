import { execFile } from 'node:child_process';

/** What, if anything, opens by itself when claudget starts. */
export type LaunchSurface = 'dashboard' | 'popover' | null;

export interface LaunchFacts {
  platform: NodeJS.Platform;
  firstRun: boolean;
  /** False when there is (probably) nowhere to show a tray icon. */
  trayAvailable: boolean;
}

/**
 * claudget lives in the menu bar / tray, so normally nothing opens at launch,
 * except on the very first run, to show a new user where it went:
 *
 * - macOS and Windows: the popover, under the menu-bar / tray icon.
 * - Linux: the dashboard. Tray icons are hit-and-miss there, and a window is
 *   what app catalogs (AppImageHub) and first-time users expect to see.
 * - Anywhere a tray can't be shown (stock GNOME has none): the dashboard,
 *   every launch, or the app would be running with no way to see it.
 */
export function launchSurface({ platform, firstRun, trayAvailable }: LaunchFacts): LaunchSurface {
  if (!trayAvailable) return 'dashboard';
  if (!firstRun) return null;
  return platform === 'linux' ? 'dashboard' : 'popover';
}

/** Reads `gdbus`/`dbus-send` output for NameHasOwner: `(true,)` / `boolean true`. */
export function parseNameHasOwner(stdout: string): boolean | null {
  if (/\btrue\b/.test(stdout)) return true;
  if (/\bfalse\b/.test(stdout)) return false;
  return null;
}

/**
 * Linux only: is a StatusNotifierItem host running (KDE, Ubuntu's GNOME with
 * AppIndicator, most panels)? Stock GNOME has none, and Electron's tray icon
 * then silently goes nowhere. Resolves null when it can't tell (no D-Bus
 * tools); callers fall back to the desktop name.
 */
export async function hasStatusNotifierHost(): Promise<boolean | null> {
  const run = (cmd: string, args: string[]): Promise<string | null> =>
    new Promise((resolve) => {
      execFile(cmd, args, { timeout: 1500 }, (err, stdout) => resolve(err ? null : stdout));
    });
  const name = 'org.kde.StatusNotifierWatcher';
  const viaGdbus = await run('gdbus', [
    'call',
    '--session',
    '--dest',
    'org.freedesktop.DBus',
    '--object-path',
    '/org/freedesktop/DBus',
    '--method',
    'org.freedesktop.DBus.NameHasOwner',
    name,
  ]);
  if (viaGdbus !== null) return parseNameHasOwner(viaGdbus);
  const viaDbusSend = await run('dbus-send', [
    '--session',
    '--print-reply',
    '--dest=org.freedesktop.DBus',
    '/org/freedesktop/DBus',
    'org.freedesktop.DBus.NameHasOwner',
    `string:${name}`,
  ]);
  return viaDbusSend !== null ? parseNameHasOwner(viaDbusSend) : null;
}

/**
 * Best guess at whether a tray icon will be visible. Only Linux is in doubt:
 * macOS always has the menu bar and Windows always has a notification area.
 * Without an SNI host, a few X11 panels still show Electron's XEmbed
 * fallback, but stock GNOME (the common case) shows nothing.
 */
export function trayLikelyVisible(
  platform: NodeJS.Platform,
  sniHost: boolean | null,
  desktop: string | undefined,
): boolean {
  if (platform !== 'linux') return true;
  if (sniHost !== null) return sniHost;
  return !/gnome/i.test(desktop ?? '');
}
