import type { UsageSnapshot, WidgetConfig } from '@claude-widget/core';

export type { UsageSnapshot, WidgetConfig };

/** IPC channel names shared by main, preload and renderer. */
export const IPC = {
  SnapshotPush: 'usage:snapshot',
  GetSnapshot: 'usage:get-snapshot',
  Refresh: 'usage:refresh',
  GetConfig: 'config:get',
  SetConfig: 'config:set',
  ConfigPush: 'config:changed',
  WindowAction: 'window:action',
  /** Transient mouse-ignore toggle used by the click-through hover guard. */
  SetIgnoreMouse: 'window:set-ignore-mouse',
  GetAppInfo: 'app:get-info',
  OpenLogs: 'app:open-logs',
  OpenConfigFile: 'app:open-config-file',
} as const;

/** Transient window operations. Persistent toggles (always-on-top, compact,
 * click-through, opacity) go through `setConfig` so config stays the single
 * source of truth. */
export interface WindowAction {
  type: 'minimize' | 'hide' | 'close';
}

export interface AppInfo {
  appVersion: string;
  cliVersion: string | null;
  platform: string;
  logFilePath: string;
  configFilePath: string;
  claudeDir: string;
  pricingNote: string;
}

/** The API surface exposed to the renderer on `window.claudeWidget`. */
export interface WidgetBridge {
  getSnapshot(): Promise<UsageSnapshot>;
  getConfig(): Promise<WidgetConfig>;
  setConfig(patch: Partial<WidgetConfig>): Promise<WidgetConfig>;
  refresh(): Promise<void>;
  getAppInfo(): Promise<AppInfo>;
  windowAction(action: WindowAction): Promise<void>;
  /** While click-through is enabled, temporarily (un)ignore the mouse so the
   * title-bar controls stay clickable. Fire-and-forget; no response. */
  setIgnoreMouse(ignore: boolean): void;
  openLogs(): Promise<void>;
  openConfigFile(): Promise<void>;
  /** Subscribe to pushed snapshots. Returns an unsubscribe function. */
  onSnapshot(callback: (snapshot: UsageSnapshot) => void): () => void;
  /** Subscribe to config changes (e.g. from the tray). Returns unsubscribe. */
  onConfig(callback: (config: WidgetConfig) => void): () => void;
}
