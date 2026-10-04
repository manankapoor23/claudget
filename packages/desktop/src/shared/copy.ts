/**
 * Words that depend on the OS. macOS has a menu bar; Windows and Linux have a
 * system tray (and Windows 11 hides new tray icons behind a chevron), so copy
 * that says "menu bar" everywhere sent Windows users looking in the wrong place.
 */
import { SHORTCUTS, shortcutLabel } from './shortcuts';

/** "menu bar" on macOS, "system tray" elsewhere. */
export function trayName(platform: string): string {
  return platform === 'darwin' ? 'menu bar' : 'system tray';
}

export interface WelcomeCopy {
  title: string;
  /** Where to find claudget again; first in the list, when there's one. */
  findIt: string | null;
}

/** The first-run card's title and its "where is it" line. */
export function welcomeCopy(platform: string, trayAvailable: boolean): WelcomeCopy {
  const open = shortcutLabel(SHORTCUTS.togglePopover, platform);
  if (platform === 'darwin') return { title: 'claudget lives in your menu bar', findIt: null };
  if (platform === 'win32') {
    return {
      title: 'claudget lives in your system tray',
      findIt: `Can't see the icon? Windows may hide it behind the ^ next to the clock. Drag it onto the taskbar to keep it there. ${open} opens claudget from anywhere.`,
    };
  }
  if (!trayAvailable) {
    return {
      title: 'Your desktop has no system tray',
      findIt: `So claudget opens this window instead. Launch it again, or press ${open}, to bring it back.`,
    };
  }
  return {
    title: 'claudget lives in your system tray',
    findIt: `Click its icon, or press ${open} from anywhere.`,
  };
}
