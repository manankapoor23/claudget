import { describe, expect, it } from 'vitest';
import { launchSurface, parseNameHasOwner, trayLikelyVisible } from './launch-policy';

describe('launchSurface', () => {
  it('opens nothing on a normal launch with a tray', () => {
    for (const platform of ['darwin', 'win32', 'linux'] as const) {
      expect(launchSurface({ platform, firstRun: false, trayAvailable: true })).toBeNull();
    }
  });

  it('greets a first launch with the popover on macOS', () => {
    expect(launchSurface({ platform: 'darwin', firstRun: true, trayAvailable: true })).toBe(
      'popover',
    );
  });

  it('greets a first launch with the dashboard on Windows and Linux', () => {
    // Windows 11 hides a new tray icon behind the chevron: a window is findable.
    expect(launchSurface({ platform: 'win32', firstRun: true, trayAvailable: true })).toBe(
      'dashboard',
    );
    expect(launchSurface({ platform: 'linux', firstRun: true, trayAvailable: true })).toBe(
      'dashboard',
    );
  });

  it('opens the dashboard on every launch when there is no tray', () => {
    expect(launchSurface({ platform: 'linux', firstRun: false, trayAvailable: false })).toBe(
      'dashboard',
    );
    expect(launchSurface({ platform: 'linux', firstRun: true, trayAvailable: false })).toBe(
      'dashboard',
    );
  });
});

describe('parseNameHasOwner', () => {
  it('reads gdbus and dbus-send replies', () => {
    expect(parseNameHasOwner('(true,)\n')).toBe(true);
    expect(parseNameHasOwner('(false,)\n')).toBe(false);
    expect(parseNameHasOwner('method return time=1 sender=x\n   boolean true\n')).toBe(true);
    expect(parseNameHasOwner('method return time=1 sender=x\n   boolean false\n')).toBe(false);
    expect(parseNameHasOwner('')).toBeNull();
  });
});

describe('trayLikelyVisible', () => {
  it('trusts the menu bar and the notification area', () => {
    expect(trayLikelyVisible('darwin', null, undefined)).toBe(true);
    expect(trayLikelyVisible('win32', false, undefined)).toBe(true);
  });

  it('on Linux, goes by whether a StatusNotifier host is running', () => {
    expect(trayLikelyVisible('linux', true, 'GNOME')).toBe(true);
    expect(trayLikelyVisible('linux', false, 'KDE')).toBe(false);
  });

  it('on Linux without D-Bus answers, assumes stock GNOME has no tray', () => {
    expect(trayLikelyVisible('linux', null, 'ubuntu:GNOME')).toBe(false);
    expect(trayLikelyVisible('linux', null, 'KDE')).toBe(true);
    expect(trayLikelyVisible('linux', null, undefined)).toBe(true);
  });
});
