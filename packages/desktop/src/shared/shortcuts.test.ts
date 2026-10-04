import { describe, expect, it } from 'vitest';
import { matchesShortcut, SHORTCUTS, shortcutLabel, type KeyLike } from './shortcuts';
import { trayName, welcomeCopy } from './copy';

const key = (k: string, mods: Partial<KeyLike> = {}): KeyLike => ({
  key: k,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

describe('shortcutLabel', () => {
  it('spells Mac shortcuts with symbols', () => {
    expect(shortcutLabel(SHORTCUTS.openDashboard, 'darwin')).toBe('⌘D');
    expect(shortcutLabel(SHORTCUTS.openSettings, 'darwin')).toBe('⌘,');
    expect(shortcutLabel(SHORTCUTS.toggleClickThrough, 'darwin')).toBe('⌥⌘C');
  });
  it('spells Windows and Linux shortcuts with Ctrl', () => {
    for (const p of ['win32', 'linux']) {
      expect(shortcutLabel(SHORTCUTS.openDashboard, p)).toBe('Ctrl+D');
      expect(shortcutLabel(SHORTCUTS.openSettings, p)).toBe('Ctrl+,');
      expect(shortcutLabel(SHORTCUTS.quit, p)).toBe('Ctrl+Q');
      expect(shortcutLabel(SHORTCUTS.toggleClickThrough, p)).toBe('Ctrl+Alt+C');
      expect(shortcutLabel(SHORTCUTS.togglePopover, p)).toBe('Ctrl+Alt+U');
    }
  });
});

describe('matchesShortcut', () => {
  it('takes Cmd on macOS, not Ctrl', () => {
    expect(matchesShortcut(key('d', { metaKey: true }), SHORTCUTS.openDashboard, 'darwin')).toBe(
      true,
    );
    expect(matchesShortcut(key('d', { ctrlKey: true }), SHORTCUTS.openDashboard, 'darwin')).toBe(
      false,
    );
  });
  it('takes Ctrl on Windows and Linux, not the Windows key', () => {
    for (const p of ['win32', 'linux']) {
      expect(matchesShortcut(key('D', { ctrlKey: true }), SHORTCUTS.openDashboard, p)).toBe(true);
      expect(matchesShortcut(key(',', { ctrlKey: true }), SHORTCUTS.openSettings, p)).toBe(true);
      expect(matchesShortcut(key('q', { ctrlKey: true }), SHORTCUTS.quit, p)).toBe(true);
      expect(matchesShortcut(key('d', { metaKey: true }), SHORTCUTS.openDashboard, p)).toBe(false);
    }
  });
  it("doesn't fire Ctrl+D for the global Ctrl+Alt+… shortcuts", () => {
    const ev = key('c', { ctrlKey: true, altKey: true });
    expect(matchesShortcut(ev, SHORTCUTS.openDashboard, 'win32')).toBe(false);
    expect(matchesShortcut(ev, SHORTCUTS.toggleClickThrough, 'win32')).toBe(true);
    expect(
      matchesShortcut(key('q', { ctrlKey: true, shiftKey: true }), SHORTCUTS.quit, 'linux'),
    ).toBe(false);
  });
  it('ignores bare keys', () => {
    expect(matchesShortcut(key('d'), SHORTCUTS.openDashboard, 'linux')).toBe(false);
  });
});

describe('OS-aware copy', () => {
  it('says menu bar on macOS and system tray elsewhere', () => {
    expect(trayName('darwin')).toBe('menu bar');
    expect(trayName('win32')).toBe('system tray');
    expect(trayName('linux')).toBe('system tray');
  });
  it('keeps the macOS welcome as it was', () => {
    expect(welcomeCopy('darwin', true)).toEqual({
      title: 'claudget lives in your menu bar',
      findIt: null,
    });
  });
  it('points Windows users at the hidden-icons chevron', () => {
    const c = welcomeCopy('win32', true);
    expect(c.title).toBe('claudget lives in your system tray');
    expect(c.findIt).toMatch(/\^/);
    expect(c.findIt).toMatch(/Ctrl\+Alt\+U/);
    expect(c.findIt).not.toMatch(/menu bar|⌘/);
  });
  it('is honest on Linux desktops without a tray', () => {
    expect(welcomeCopy('linux', false).title).toBe('Your desktop has no system tray');
    expect(welcomeCopy('linux', true).title).toBe('claudget lives in your system tray');
  });
});
