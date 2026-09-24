import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import {
  IPC,
  type DashboardView,
  type LimitHistory,
  type UsageSnapshot,
  type WidgetBridge,
  type WidgetConfig,
  type WindowAction,
} from '../shared/ipc';

const bridge: WidgetBridge = {
  platform: process.platform,
  getSnapshot: () => ipcRenderer.invoke(IPC.GetSnapshot),
  getConfig: () => ipcRenderer.invoke(IPC.GetConfig),
  setConfig: (patch) => ipcRenderer.invoke(IPC.SetConfig, patch),
  refresh: () => ipcRenderer.invoke(IPC.Refresh),
  getAppInfo: () => ipcRenderer.invoke(IPC.GetAppInfo),
  windowAction: (action: WindowAction) => ipcRenderer.invoke(IPC.WindowAction, action),
  setIgnoreMouse: (ignore: boolean) => ipcRenderer.send(IPC.SetIgnoreMouse, ignore),
  openLogs: () => ipcRenderer.invoke(IPC.OpenLogs),
  openConfigFile: () => ipcRenderer.invoke(IPC.OpenConfigFile),
  onSnapshot: (callback) => {
    const listener = (_event: IpcRendererEvent, snapshot: UsageSnapshot): void =>
      callback(snapshot);
    ipcRenderer.on(IPC.SnapshotPush, listener);
    return () => ipcRenderer.removeListener(IPC.SnapshotPush, listener);
  },
  onConfig: (callback) => {
    const listener = (_event: IpcRendererEvent, config: WidgetConfig): void => callback(config);
    ipcRenderer.on(IPC.ConfigPush, listener);
    return () => ipcRenderer.removeListener(IPC.ConfigPush, listener);
  },
  getLimitHistory: () => ipcRenderer.invoke(IPC.GetLimitHistory),
  onLimitHistory: (callback) => {
    const listener = (_event: IpcRendererEvent, history: LimitHistory): void => callback(history);
    ipcRenderer.on(IPC.LimitHistoryPush, listener);
    return () => ipcRenderer.removeListener(IPC.LimitHistoryPush, listener);
  },
  revealProject: (path: string) => ipcRenderer.invoke(IPC.RevealProject, path),
  onNavigate: (callback) => {
    const listener = (_event: IpcRendererEvent, view: DashboardView): void => callback(view);
    ipcRenderer.on(IPC.Navigate, listener);
    return () => ipcRenderer.removeListener(IPC.Navigate, listener);
  },
};

contextBridge.exposeInMainWorld('claudeWidget', bridge);
