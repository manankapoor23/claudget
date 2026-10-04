/**
 * Keyboard shortcuts, spelled the way each OS spells them: ⌘D on a Mac,
 * Ctrl+D on Windows and Linux. One table drives both the labels and the
 * key handling, so they can't disagree.
 */

export interface Shortcut {
  /** The primary key: Cmd on macOS, Ctrl elsewhere. */
  mod: boolean;
  alt?: boolean;
  shift?: boolean;
  /** `KeyboardEvent.key`, compared case-insensitively. */
  key: string;
}

/** The subset of a KeyboardEvent that matching needs. */
export interface KeyLike {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

const isMac = (platform: string): boolean => platform === 'darwin';

/** "⌘D", "⌥⌘C" on macOS; "Ctrl+D", "Ctrl+Alt+C" elsewhere. */
export function shortcutLabel(s: Shortcut, platform: string): string {
  const key = s.key.length === 1 ? s.key.toUpperCase() : s.key;
  if (isMac(platform)) {
    return `${s.alt ? '⌥' : ''}${s.shift ? '⇧' : ''}${s.mod ? '⌘' : ''}${key}`;
  }
  return [s.mod ? 'Ctrl' : null, s.alt ? 'Alt' : null, s.shift ? 'Shift' : null, key]
    .filter(Boolean)
    .join('+');
}

/**
 * Whether a key event is this shortcut. On macOS the modifier is Cmd and Ctrl
 * must be up; elsewhere it is Ctrl and the Windows/Super key must be up (the
 * OS owns Win+ shortcuts). Alt and Shift must match exactly, so Ctrl+D never
 * fires for Ctrl+Alt+D.
 */
export function matchesShortcut(e: KeyLike, s: Shortcut, platform: string): boolean {
  const mac = isMac(platform);
  const primary = mac ? e.metaKey : e.ctrlKey;
  const other = mac ? e.ctrlKey : e.metaKey;
  if (primary !== s.mod || other) return false;
  if (e.altKey !== Boolean(s.alt) || e.shiftKey !== Boolean(s.shift)) return false;
  return e.key.toLowerCase() === s.key.toLowerCase();
}

/** The shortcuts claudget answers to, named once. */
export const SHORTCUTS = {
  openDashboard: { mod: true, key: 'd' },
  openSettings: { mod: true, key: ',' },
  quit: { mod: true, key: 'q' },
  /** Global (registered in main as CommandOrControl+Alt+…). */
  togglePopover: { mod: true, alt: true, key: 'u' },
  toggleClickThrough: { mod: true, alt: true, key: 'c' },
} as const satisfies Record<string, Shortcut>;
