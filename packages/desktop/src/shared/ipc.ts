import type { UsageSnapshot as CoreUsageSnapshot, WidgetConfig } from '@claude-widget/core';
import type { LimitHistory } from './history';

export interface OpenCodeUsageBucket {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
  /** Cost reported in OpenCode's local records; null when it was not stored. */
  costUSD: number | null;
  count: number;
}

export interface OpenCodeUsageModel extends OpenCodeUsageBucket {
  model: string;
}

export interface OpenCodeUsage {
  status: 'available' | 'not-found' | 'error';
  allTime: OpenCodeUsageBucket;
  today: OpenCodeUsageBucket;
  models: OpenCodeUsageModel[];
  /** Session-level totals are fallback aggregates, not request counts. */
  granularity: 'request' | 'session' | null;
  message: string | null;
  updatedAt: number | null;
}

export type UsageSnapshot = CoreUsageSnapshot & { opencode?: OpenCodeUsage };
export type { LimitHistory, WidgetConfig };

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
  /** Main → dashboard: switch to a view. */
  Navigate: 'app:navigate',
  GetLimitHistory: 'history:get',
  LimitHistoryPush: 'history:changed',
  /** Open a session's project folder in the file manager. */
  RevealProject: 'app:reveal-project',
} as const;

/**
 * Which window a renderer is drawing. One renderer bundle serves all three,
 * selected by the `?surface=` query main loads it with.
 * - `popover`: the menu-bar dropdown — the everyday glance.
 * - `pill`: the optional floating strip (config `compact`).
 * - `dashboard`: the full window, opened on demand.
 * - `settings`: the ⌘, window.
 * - `minibar`: the optional floating bar (config `miniBar`).
 */
export type Surface = 'popover' | 'pill' | 'dashboard' | 'settings' | 'minibar';

export type DashboardView = 'main' | 'activity' | 'sessions' | 'insights' | 'settings';

/** Transient window operations, applied to the window that sent them unless
 * they name another surface. Persistent toggles (always-on-top, the pill,
 * click-through, opacity) go through `setConfig` so config stays the single
 * source of truth. */
export type WindowAction =
  | { type: 'minimize' | 'hide' | 'close' }
  | { type: 'open-dashboard'; view?: DashboardView }
  | { type: 'open-settings' }
  /** Pill: follow the cursor from this in-window offset until `end`. */
  | { type: 'pill-drag'; phase: 'start'; offsetX: number; offsetY: number }
  | { type: 'pill-drag'; phase: 'end' }
  /** Popover: fit the window to this content height. */
  | { type: 'popover-height'; height: number }
  | { type: 'quit' };

export interface AppInfo {
  appVersion: string;
  cliVersion: string | null;
  platform: string;
  logFilePath: string;
  configFilePath: string;
  claudeDir: string;
  pricingNote: string;
  /** True on the very first launch — the popover shows a short welcome. */
  firstRun: boolean;
}

/** The API surface exposed to the renderer on `window.claudeWidget`. */
export interface WidgetBridge {
  /** `process.platform`, available synchronously so the first paint is right. */
  readonly platform: string;
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
  /** Dashboard only: main asks to show a view. Returns unsubscribe. */
  onNavigate(callback: (view: DashboardView) => void): () => void;
  getLimitHistory(): Promise<LimitHistory>;
  onLimitHistory(callback: (history: LimitHistory) => void): () => void;
  /** Opens a session's project folder in Finder / Explorer. Resolves false if refused. */
  revealProject(path: string): Promise<boolean>;
}
