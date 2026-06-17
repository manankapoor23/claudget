import { create } from 'zustand';
import type { AppInfo, UsageSnapshot, WidgetConfig } from '@shared/ipc';
import { getBridge } from './lib/api';

type View = 'main' | 'settings';

interface WidgetState {
  snapshot: UsageSnapshot | null;
  config: WidgetConfig | null;
  appInfo: AppInfo | null;
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
      set({ loading: false, error: 'This window must run inside the Claude Usage Widget app.' });
      return;
    }

    api.onSnapshot((snapshot) => set({ snapshot }));
    api.onConfig((config) => set({ config }));

    try {
      const [snapshot, config, appInfo] = await Promise.all([
        api.getSnapshot(),
        api.getConfig(),
        api.getAppInfo(),
      ]);
      set({ snapshot, config, appInfo, loading: false, error: null });
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : String(err) });
    }
  },

  updateConfig: async (patch) => {
    const api = getBridge();
    if (!api) return;
    const config = await api.setConfig(patch);
    set({ config });
  },

  refresh: async () => {
    const api = getBridge();
    if (!api) return;
    await api.refresh();
  },
}));
