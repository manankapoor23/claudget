import { ipcMain, shell, type BrowserWindow } from 'electron';
import type { UsageEngine, WidgetConfig } from '@claude-widget/core';
import { IPC, type AppInfo, type WindowAction } from '../shared/ipc';

export interface IpcDeps {
  engine: UsageEngine;
  getConfig: () => WidgetConfig;
  setConfig: (patch: Partial<WidgetConfig>) => WidgetConfig;
  getWindow: () => BrowserWindow | null;
  getAppInfo: () => AppInfo;
  requestClose: () => void;
}

/** Registers all `ipcMain` handlers. Renderer↔main is invoke/handle only. */
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
  ipcMain.handle(IPC.WindowAction, (_event, action: WindowAction) => {
    const win = deps.getWindow();
    if (!win) return;
    switch (action.type) {
      case 'minimize':
        win.minimize();
        break;
      case 'hide':
        win.hide();
        break;
      case 'close':
        deps.requestClose();
        break;
    }
  });

  // Transient hover guard: keep the title bar clickable while click-through is on.
  // `forward: true` keeps mouse-move events flowing so the renderer can detect
  // when the cursor leaves the interactive zone and re-enable pass-through.
  ipcMain.on(IPC.SetIgnoreMouse, (_event, ignore: boolean) => {
    const win = deps.getWindow();
    if (!win) return;
    win.setIgnoreMouseEvents(Boolean(ignore), { forward: true });
  });
}
