import { Menu, Tray, nativeImage, type NativeImage } from 'electron';
import type { UsageSnapshot, WidgetConfig } from '@claude-widget/core';
import { isDormant, rankLimits, verdictFor, type Tone } from '../shared/limits';

export interface TrayDeps {
  iconPath: string;
  getConfig: () => WidgetConfig;
  setConfig: (patch: Partial<WidgetConfig>) => void;
  togglePopover: () => void;
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

function pct(fraction: number): string {
  return `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%`;
}

export function createTray(deps: TrayDeps): TrayHandle {
  const mac = process.platform === 'darwin';
  const image = nativeImage.createFromPath(deps.iconPath);
  const logo = image.isEmpty()
    ? nativeImage.createEmpty()
    : image.resize({ width: 16, height: 16 });
  // macOS gets the native template glyph; other trays don't tint template
  // images (a black glyph would vanish on a dark taskbar), so they keep the logo.
  const icons: Record<Tone, NativeImage> = mac
    ? {
        ok: glyphImage(null),
        warn: glyphImage(GLYPH_COLOURS.warn),
        bad: glyphImage(GLYPH_COLOURS.bad),
      }
    : { ok: logo, warn: logo, bad: logo };
  const tray = new Tray(icons.ok);
  tray.setToolTip('claudget');
  let currentTone: Tone = 'ok';

  const buildMenu = (): Menu => {
    const cfg = deps.getConfig();
    return Menu.buildFromTemplate([
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
  const syncMenu = (): void => {
    menu = buildMenu();
  };

  // Left click is the glance (the popover); the menu is one right-click away.
  // Not using setContextMenu: on macOS that would hijack the left click too.
  tray.on('click', () => deps.togglePopover());
  tray.on('right-click', () => tray.popUpContextMenu(menu));

  const setStatus = (snapshot: UsageSnapshot): void => {
    const { official } = snapshot;
    const live = official.available ? official.windows.filter((w) => !isDormant(w)) : [];
    const ranked = official.available ? rankLimits(official.windows) : null;
    const verdict = ranked ? verdictFor(ranked, snapshot.generatedAt) : null;

    // Stable order (5-hour, weekly) so the eye learns where each number lives.
    const title =
      live.length > 0
        ? live
            .slice(0, 2)
            .map((w) => pct(w.utilization))
            .join(' · ')
        : '';
    if (process.platform === 'darwin') tray.setTitle(title, { fontType: 'monospacedDigit' });
    tray.setToolTip(verdict ? `claudget — ${verdict.headline}\n${verdict.detail}` : 'claudget');

    const tone: Tone = verdict?.tone ?? 'ok';
    if (tone !== currentTone) {
      currentTone = tone;
      tray.setImage(icons[tone]);
    }
  };

  return { tray, syncMenu, setStatus };
}
