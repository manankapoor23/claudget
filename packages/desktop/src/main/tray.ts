import { Menu, Tray, nativeImage } from 'electron';
import type { WidgetConfig } from '@claude-widget/core';

export interface TrayDeps {
  iconPath: string;
  getConfig: () => WidgetConfig;
  setConfig: (patch: Partial<WidgetConfig>) => void;
  toggleVisibility: () => void;
  refresh: () => void;
  openLogs: () => void;
  openConfigFile: () => void;
  quit: () => void;
}

export interface TrayHandle {
  tray: Tray;
  /** Rebuild the menu to reflect the latest config (checkbox states). */
  syncMenu: () => void;
}

export function createTray(deps: TrayDeps): TrayHandle {
  const image = nativeImage.createFromPath(deps.iconPath);
  const trayImage = image.isEmpty()
    ? nativeImage.createEmpty()
    : image.resize({ width: 16, height: 16 });
  const tray = new Tray(trayImage);
  tray.setToolTip('Claude Usage Widget');

  const syncMenu = (): void => {
    const cfg = deps.getConfig();
    const menu = Menu.buildFromTemplate([
      { label: 'Show / Hide', click: () => deps.toggleVisibility() },
      { type: 'separator' },
      {
        label: 'Always on top',
        type: 'checkbox',
        checked: cfg.alwaysOnTop,
        click: () => deps.setConfig({ alwaysOnTop: !cfg.alwaysOnTop }),
      },
      {
        label: 'Click-through',
        type: 'checkbox',
        checked: cfg.clickThrough,
        click: () => deps.setConfig({ clickThrough: !cfg.clickThrough }),
      },
      {
        label: 'Compact mode',
        type: 'checkbox',
        checked: cfg.compact,
        click: () => deps.setConfig({ compact: !cfg.compact }),
      },
      { type: 'separator' },
      { label: 'Refresh now', click: () => deps.refresh() },
      { label: 'Open logs', click: () => deps.openLogs() },
      { label: 'Open config file', click: () => deps.openConfigFile() },
      { type: 'separator' },
      { label: 'Quit', click: () => deps.quit() },
    ]);
    tray.setContextMenu(menu);
  };

  syncMenu();
  tray.on('click', () => deps.toggleVisibility());
  return { tray, syncMenu };
}
