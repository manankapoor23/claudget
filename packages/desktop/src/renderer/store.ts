import { create } from 'zustand';
import type { AppInfo, LimitHistory, UsageSnapshot, WidgetConfig } from '@shared/ipc';
import { EMPTY_HISTORY } from '../shared/history';
import { getBridge } from './lib/api';
import { createDemoData } from './demo';

/** Dashboard views. Settings is its own window now (⌘,), not a view. */
export type View = 'main' | 'activity' | 'sessions' | 'insights';

interface WidgetState {
  snapshot: UsageSnapshot | null;
  config: WidgetConfig | null;
  appInfo: AppInfo | null;
  history: LimitHistory;
  loading: boolean;
  error: string | null;
  view: View;
  initialized: boolean;
  setView: (view: View) => void;
  init: () => Promise<void>;
  updateConfig: (patch: Partial<WidgetConfig>) => Promise<void>;
  refresh: () => Promise<void>;
}

export const useStore = create<WidgetState>()((set, get) => ({
  snapshot: null,
  config: null,
  appInfo: null,
  history: EMPTY_HISTORY,
  loading: true,
  error: null,
  view: 'main',
  initialized: false,

  setView: (view) => set({ view }),

  init: async () => {
    if (get().initialized) return;
    set({ initialized: true });

    const api = getBridge();
    if (!api) {
      if (new URLSearchParams(window.location.search).has('demo')) {
        const demo = createDemoData();
        set({ ...demo, loading: false, error: null });
      } else {
        set({ loading: false, error: 'This window must run inside the claudget app.' });
      }
      return;
    }

    api.onSnapshot((snapshot) => set({ snapshot }));
    api.onConfig((config) => set({ config }));
    api.onNavigate((view) => {
      if (view !== 'settings') set({ view });
    });
    api.onLimitHistory((history) => set({ history }));

    try {
      const [snapshot, config, appInfo, history] = await Promise.all([
        api.getSnapshot(),
        api.getConfig(),
        api.getAppInfo(),
        api.getLimitHistory(),
      ]);
      set({ snapshot, config, appInfo, history, loading: false, error: null });
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : String(err) });
    }
  },

  updateConfig: async (patch) => {
    const api = getBridge();
    if (!api) {
      const config = get().config;
      if (config && new URLSearchParams(window.location.search).has('demo')) {
        set({ config: { ...config, ...patch } });
      }
      return;
    }
    const config = await api.setConfig(patch);
    set({ config });
  },

  refresh: async () => {
    const api = getBridge();
    if (!api) return;
    await api.refresh();
  },
}));
