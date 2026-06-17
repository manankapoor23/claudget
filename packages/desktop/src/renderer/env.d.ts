/// <reference types="vite/client" />
import type { WidgetBridge } from '@shared/ipc';

declare global {
  interface Window {
    claudeWidget?: WidgetBridge;
  }
}

export {};
