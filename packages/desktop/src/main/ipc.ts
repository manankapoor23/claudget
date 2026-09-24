import fs from 'node:fs';
import { BrowserWindow, ipcMain, shell } from 'electron';
import type { UsageEngine, WidgetConfig } from '@claude-widget/core';
import {
  IPC,
  type AppInfo,
  type DashboardView,
  type LimitHistory,
  type WindowAction,
} from '../shared/ipc';

export interface IpcDeps {
  engine: UsageEngine;
  getConfig: () => WidgetConfig;
  setConfig: (patch: Partial<WidgetConfig>) => WidgetConfig;
  getAppInfo: () => AppInfo;
  openDashboard: (view?: DashboardView) => void;
  openSettings: () => void;
  getLimitHistory: () => LimitHistory;
  startPillDrag: (offsetX: number, offsetY: number) => void;
  endPillDrag: () => void;
  fitPopover: (height: number) => void;
  quit: () => void;
}

/**
 * Registers all `ipcMain` handlers. Renderer↔main is invoke/handle only.
 * There are several windows now (popover, pill, dashboard), so window actions
 * apply to the one that sent them — never to a hard-wired "the" window.
 */
export function registerIpc(deps: IpcDeps): void {
  ipcMain.handle(IPC.GetSnapshot, () => deps.engine.getSnapshot());
  ipcMain.handle(IPC.GetConfig, () => deps.getConfig());
  ipcMain.handle(IPC.SetConfig, (_event, patch: Partial<WidgetConfig>) =>
    deps.setConfig(patch ?? {}),
  );
  ipcMain.handle(IPC.Refresh, () => deps.engine.refresh());
  ipcMain.handle(IPC.GetAppInfo, () => deps.getAppInfo());
  ipcMain.handle(IPC.OpenLogs, () => shell.openPath(deps.getAppInfo().logFilePath));
  ipcMain.handle(IPC.OpenConfigFile, () => shell.openPath(deps.getAppInfo().configFilePath));
  ipcMain.handle(IPC.GetLimitHistory, () => deps.getLimitHistory());
  // Only ever opens a folder claudget itself reported as a session's project —
  // never an arbitrary path handed over by the renderer.
  ipcMain.handle(IPC.RevealProject, async (_event, target: unknown) => {
    if (typeof target !== 'string') return false;
    const known = deps.engine.getSnapshot().local.sessions.some((s) => s.projectPath === target);
    if (!known || !fs.existsSync(target) || !fs.statSync(target).isDirectory()) return false;
    return (await shell.openPath(target)) === '';
  });
  ipcMain.handle(IPC.WindowAction, (event, action: WindowAction) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    switch (action.type) {
      case 'minimize':
        win?.minimize();
        break;
      case 'hide':
      case 'close':
        win?.hide();
        break;
      case 'open-dashboard':
        if (action.view === 'settings') deps.openSettings();
        else deps.openDashboard(action.view);
        break;
      case 'open-settings':
        deps.openSettings();
        break;
      case 'pill-drag':
        if (action.phase === 'start') deps.startPillDrag(action.offsetX, action.offsetY);
        else deps.endPillDrag();
        break;
      case 'popover-height':
        deps.fitPopover(action.height);
        break;
      case 'quit':
        deps.quit();
        break;
    }
  });

  // Transient hover guard: keep the title bar clickable while click-through is on.
  // `forward: true` keeps mouse-move events flowing so the renderer can detect
  // when the cursor leaves the interactive zone and re-enable pass-through.
  ipcMain.on(IPC.SetIgnoreMouse, (event, ignore: boolean) => {
    BrowserWindow.fromWebContents(event.sender)?.setIgnoreMouseEvents(Boolean(ignore), {
      forward: true,
    });
  });
}
