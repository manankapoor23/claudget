import { Menu, type MenuItemConstructorOptions } from 'electron';
import type { WidgetConfig } from '@claude-widget/core';
import type { DashboardView } from '../shared/ipc';

export interface AppMenuDeps {
  getConfig: () => WidgetConfig;
  setConfig: (patch: Partial<WidgetConfig>) => void;
  openDashboard: (view?: DashboardView) => void;
  openSettings: () => void;
  refresh: () => void;
  quit: () => void;
}

/**
 * The menu bar a regular Mac app has while the dashboard is open: standard
 * roles (so ⌘W, ⌘M, ⌘H, copy/paste behave exactly as users expect) plus
 * claudget's own commands with conventional shortcuts.
 */
export function buildAppMenu(deps: AppMenuDeps): Menu {
  const cfg = deps.getConfig();
  const view = (label: string, id: DashboardView, key: string): MenuItemConstructorOptions => ({
    label,
    accelerator: `CmdOrCtrl+${key}`,
    click: () => deps.openDashboard(id),
  });

  const template: MenuItemConstructorOptions[] = [
    {
      label: 'claudget',
      submenu: [
        { role: 'about', label: 'About claudget' },
        { type: 'separator' },
        {
          label: 'Settings…',
          accelerator: 'CmdOrCtrl+,',
          click: () => deps.openSettings(),
        },
        { type: 'separator' },
        { role: 'hide', label: 'Hide claudget' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { label: 'Quit claudget', accelerator: 'CmdOrCtrl+Q', click: () => deps.quit() },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        view('Overview', 'main', '1'),
        view('Activity', 'activity', '2'),
        view('Sessions', 'sessions', '3'),
        view('Insights', 'insights', '4'),
        { type: 'separator' },
        { label: 'Refresh', accelerator: 'CmdOrCtrl+R', click: () => deps.refresh() },
        { type: 'separator' },
        {
          label: 'Floating Pill',
          type: 'checkbox',
          checked: cfg.compact,
          click: () => deps.setConfig({ compact: !cfg.compact }),
        },
        {
          label: 'Floating Bar',
          type: 'checkbox',
          checked: cfg.miniBar,
          click: () => deps.setConfig({ miniBar: !cfg.miniBar }),
        },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'close' },
        { type: 'separator' },
        {
          label: 'Keep on Top',
          type: 'checkbox',
          checked: cfg.alwaysOnTop,
          click: () => deps.setConfig({ alwaysOnTop: !cfg.alwaysOnTop }),
        },
        {
          label: 'Click-Through',
          type: 'checkbox',
          accelerator: 'CmdOrCtrl+Alt+C',
          // Shown for discoverability; the global shortcut already handles it.
          registerAccelerator: false,
          checked: cfg.clickThrough,
          click: () => deps.setConfig({ clickThrough: !cfg.clickThrough }),
        },
        { type: 'separator' },
        { role: 'front' },
      ],
    },
  ];
  return Menu.buildFromTemplate(template);
}
