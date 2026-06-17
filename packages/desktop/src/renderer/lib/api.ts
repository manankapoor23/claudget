import type { WidgetBridge } from '@shared/ipc';

/** Returns the preload bridge, or null if it is unavailable (e.g. opened outside Electron). */
export function getBridge(): WidgetBridge | null {
  if (typeof window !== 'undefined' && window.claudeWidget) return window.claudeWidget;
  return null;
}
