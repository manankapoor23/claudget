import fs from 'node:fs';
import path from 'node:path';
import { Menu, Tray, nativeImage, type NativeImage } from 'electron';
import type { UsageSnapshot, WidgetConfig } from '@claude-widget/core';
import {
  ESTIMATE_CAVEAT,
  freshnessLine,
  isDormant,
  pctText,
  rankLimits,
  shownWindows,
  verdictFor,
  type Tone,
} from '../shared/limits';

export interface TrayDeps {
  /** resources/tray: the cropped, per-scale tray icons (Windows, Linux). */
  trayIconDir: string;
  getConfig: () => WidgetConfig;
  setConfig: (patch: Partial<WidgetConfig>) => void;
  togglePopover: () => void;
  showPopover: () => void;
  openDashboard: () => void;
  openSettings: () => void;
  refresh: () => void;
  openLogs: () => void;
  openConfigFile: () => void;
  quit: () => void;
}

export interface TrayHandle {
  tray: Tray;
  /** Rebuild the menu to reflect the latest config (checkbox states). */
  syncMenu: () => void;
  /** Update the menu-bar title, tooltip and state dot from a snapshot. */
  setStatus: (snapshot: UsageSnapshot) => void;
  /**
   * Windows: re-applies the tooltip. When Explorer restarts, Electron puts
   * the icon back but without its tooltip.
   */
  reassert: () => void;
}

type Rgb = [number, number, number];

const GLYPH_COLOURS: Record<Exclude<Tone, 'ok'>, Rgb> = {
  warn: [245, 165, 36],
  bad: [255, 69, 58],
};

/**
 * The menu-bar glyph: three ascending bars, a usage meter. Drawn as a @2x
 * bitmap with anti-aliased rounded ends. Black-on-alpha for the normal state,
 * marked as a template so macOS tints it for light, dark and highlighted menu
 * bars like every native icon; amber/red when a limit is close (colour is the
 * signal, so those stay un-templated).
 */
function glyphImage(rgb: Rgb | null): NativeImage {
  const scale = 2;
  const size = 16 * scale;
  const barW = 2.6 * scale;
  const gap = 1.7 * scale;
  const heights = [5.5, 8.5, 11.5].map((h) => h * scale);
  const bottom = 13.5 * scale;
  const left = (size - (barW * 3 + gap * 2)) / 2;
  const r = barW / 2;
  const [cr, cg, cb] = rgb ?? [0, 0, 0];
  const buf = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let a = 0;
      heights.forEach((h, i) => {
        const x0 = left + i * (barW + gap);
        // Signed distance to a vertical capsule (rounded rect with r = barW/2).
        const px = x + 0.5 - (x0 + r);
        const top = bottom - h + r;
        const bot = bottom - r;
        const py = y + 0.5 - Math.min(Math.max(y + 0.5, top), bot);
        const d = Math.hypot(px, py) - r;
        a = Math.max(a, Math.min(1, Math.max(0, 0.5 - d)));
      });
      const i = (y * size + x) * 4;
      // BGRA, premultiplied.
      buf[i] = Math.round(cb * a);
      buf[i + 1] = Math.round(cg * a);
      buf[i + 2] = Math.round(cr * a);
      buf[i + 3] = Math.round(255 * a);
    }
  }
  const img = nativeImage.createFromBitmap(buf, { width: size, height: size, scaleFactor: scale });
  if (!rgb) img.setTemplateImage(true);
  return img;
}

/**
 * Windows and Linux: the app mark, cropped tight and pre-scaled (see
 * scripts/make-tray-icons.mjs). Windows gets every scale so the notification
 * area picks the sharp one at 100–200%; Linux panels scale the icon to fit
 * themselves, so they get one larger image to scale down from.
 */
function markImage(dir: string, platform: NodeJS.Platform): NativeImage {
  if (platform === 'linux') {
    try {
      return nativeImage.createFromBuffer(fs.readFileSync(path.join(dir, 'tray@2x.png')), {
        scaleFactor: 1,
      });
    } catch {
      return nativeImage.createEmpty();
    }
  }
  // Loads tray.png plus its @1.25x/@1.5x/@2x/@3x siblings.
  return nativeImage.createFromPath(path.join(dir, 'tray.png'));
}

export function createTray(deps: TrayDeps): TrayHandle {
  const mac = process.platform === 'darwin';
  const linux = process.platform === 'linux';
  const mark = mac ? nativeImage.createEmpty() : markImage(deps.trayIconDir, process.platform);
  // macOS gets the native template glyph; other trays don't tint template
  // images (a black glyph would vanish on a dark taskbar), so they keep the
  // orange mark, which reads on light and dark taskbars alike.
  const icons: Record<Tone, NativeImage> = mac
    ? {
        ok: glyphImage(null),
        warn: glyphImage(GLYPH_COLOURS.warn),
        bad: glyphImage(GLYPH_COLOURS.bad),
      }
    : { ok: mark, warn: mark, bad: mark };
  const tray = new Tray(icons.ok);
  tray.setToolTip('claudget');
  let currentTone: Tone = 'ok';
  let currentTitle: string | null = null;
  let currentTooltip = 'claudget';

  const buildMenu = (): Menu => {
    const cfg = deps.getConfig();
    return Menu.buildFromTemplate([
      // Linux: some trays (AppIndicator) open this menu on any click and never
      // report the click itself, so the menu has to lead to the glance too.
      ...(linux
        ? [
            { label: 'Open claudget', click: () => deps.showPopover() },
            { type: 'separator' as const },
          ]
        : []),
      { label: 'Open dashboard', click: () => deps.openDashboard() },
      {
        label: 'Floating pill',
        type: 'checkbox',
        checked: cfg.compact,
        click: () => deps.setConfig({ compact: !cfg.compact }),
      },
      {
        label: 'Floating bar',
        type: 'checkbox',
        checked: cfg.miniBar,
        click: () => deps.setConfig({ miniBar: !cfg.miniBar }),
      },
      { type: 'separator' },
      {
        label: 'Dashboard always on top',
        type: 'checkbox',
        checked: cfg.alwaysOnTop,
        click: () => deps.setConfig({ alwaysOnTop: !cfg.alwaysOnTop }),
      },
      {
        label: 'Dashboard click-through',
        type: 'checkbox',
        checked: cfg.clickThrough,
        click: () => deps.setConfig({ clickThrough: !cfg.clickThrough }),
      },
      { type: 'separator' },
      { label: 'Settings…', click: () => deps.openSettings() },
      { label: 'Refresh now', click: () => deps.refresh() },
      { label: 'Open logs', click: () => deps.openLogs() },
      { label: 'Open config file', click: () => deps.openConfigFile() },
      { type: 'separator' },
      { label: 'Quit claudget', click: () => deps.quit() },
    ]);
  };
  let menu = buildMenu();
  // Linux has no popUpContextMenu: the tray host draws the menu itself, from
  // the one handed over with setContextMenu (and needs it again on change).
  if (linux) tray.setContextMenu(menu);
  const syncMenu = (): void => {
    menu = buildMenu();
    if (linux) tray.setContextMenu(menu);
  };

  // Left click is the glance (the popover); the menu is one right-click away.
  // Not using setContextMenu on macOS/Windows: on macOS it would hijack the
  // left click too.
  tray.on('click', () => deps.togglePopover());
  if (!linux) tray.on('right-click', () => tray.popUpContextMenu(menu));

  // The title follows the live estimate, which can change with every local
  // update (~300ms apart while a session streams). The menu bar doesn't need
  // more than two redraws a second: hold the newest title and apply it then.
  const TITLE_MIN_GAP_MS = 500;
  let titleSetAt = 0;
  let pendingTitle: string | null = null;
  let titleTimer: NodeJS.Timeout | null = null;
  const applyTitle = (title: string): void => {
    if (process.platform !== 'darwin') return;
    pendingTitle = title;
    const wait = titleSetAt + TITLE_MIN_GAP_MS - Date.now();
    if (wait > 0) {
      titleTimer ??= setTimeout(() => {
        titleTimer = null;
        if (pendingTitle !== null) applyTitle(pendingTitle);
      }, wait);
      return;
    }
    pendingTitle = null;
    // Snapshots arrive often and most leave the limits untouched; only touch
    // the menu bar when the text changes.
    if (title === currentTitle || tray.isDestroyed()) return;
    currentTitle = title;
    titleSetAt = Date.now();
    tray.setTitle(title, { fontType: 'monospacedDigit' });
  };

  const setStatus = (snapshot: UsageSnapshot): void => {
    const { official } = snapshot;
    // Display only: the live estimate where there is one (marked "~").
    const windows = official.available ? shownWindows(official.windows) : [];
    const live = windows.filter((w) => !isDormant(w));
    const ranked = rankLimits(windows);
    const verdict = ranked ? verdictFor(ranked, snapshot.generatedAt) : null;

    // Stable order (5-hour, weekly) so the eye learns where each number lives.
    // An estimated number wears a "~" of its own: "~63% · 31%".
    applyTitle(live.length > 0 ? live.slice(0, 2).map(pctText).join(' · ') : '');
    // The % comes from Anthropic, polled every few minutes: say how old it is,
    // so a number that hasn't moved reads as "not re-checked yet", not "stuck",
    // and say so when it's an estimate on top of that reading.
    const asOf =
      official.available && official.fetchedAt
        ? limitsAsOf(
            official.fetchedAt,
            live.slice(0, 2).some((w) => w.estimated),
          )
        : '';
    const tooltip = verdict
      ? `claudget — ${verdict.headline}\n${verdict.detail}${asOf}`
      : 'claudget';
    if (tooltip !== currentTooltip) {
      currentTooltip = tooltip;
      tray.setToolTip(tooltip);
    }

    const tone: Tone = verdict?.tone ?? 'ok';
    if (tone !== currentTone) {
      currentTone = tone;
      tray.setImage(icons[tone]);
    }
  };

  const reassert = (): void => {
    if (tray.isDestroyed()) return;
    tray.setToolTip(currentTooltip);
  };

  return { tray, syncMenu, setStatus, reassert };
}

/**
 * "\nLimits as of 14:32", or, while a number is estimated, "\nEstimated from
 * live usage · last checked 14:32" and why it may read low. A clock time, so
 * the tooltip never needs re-rendering just because time passed.
 */
function limitsAsOf(fetchedAt: number, estimated: boolean): string {
  const clock = new Date(fetchedAt).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
  return estimated
    ? `\n${freshnessLine(true, clock)}\n${ESTIMATE_CAVEAT}`
    : `\nLimits as of ${clock}`;
}
