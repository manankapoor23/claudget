import { useEffect, type JSX } from 'react';
import { useStore } from './store';
import { getBridge } from './lib/api';
import { TitleBar } from './components/TitleBar';
import { Footer } from './components/Footer';
import { OfficialPanel } from './components/OfficialPanel';
import { LocalPanel } from './components/LocalPanel';
import { SessionList } from './components/SessionList';
import { CompactView } from './components/CompactView';
import { Settings } from './components/Settings';
import { ErrorBoundary, ErrorState, LoadingState } from './components/States';

function useTheme(theme: 'system' | 'dark' | 'light' | undefined): void {
  useEffect(() => {
    const effective = theme ?? 'system';
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = (): void => {
      const resolved = effective === 'system' ? (mq.matches ? 'dark' : 'light') : effective;
      document.documentElement.dataset.theme = resolved;
    };
    apply();
    if (effective !== 'system') return undefined;
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
}

/**
 * While click-through is on, the OS window ignores the mouse — which would also
 * make the title-bar controls (incl. the click-through toggle) unreachable. To
 * avoid that trap we forward mouse-move events and dynamically un-ignore the
 * mouse whenever the cursor is over an element marked `[data-ct-interactive]`,
 * re-enabling pass-through as soon as it leaves. Result: empty/body areas click
 * through, but the title bar always stays usable.
 */
function useClickThroughGuard(active: boolean): void {
  useEffect(() => {
    const bridge = getBridge();
    if (!active || !bridge) return;

    let ignoring = true; // matches the base state main sets when click-through is on
    bridge.setIgnoreMouse(true);

    const onMove = (e: MouseEvent): void => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const overInteractive = !!el?.closest('[data-ct-interactive]');
      if (overInteractive && ignoring) {
        ignoring = false;
        bridge.setIgnoreMouse(false);
      } else if (!overInteractive && !ignoring) {
        ignoring = true;
        bridge.setIgnoreMouse(true);
      }
    };

    window.addEventListener('mousemove', onMove);
    return () => {
      window.removeEventListener('mousemove', onMove);
      // Leaving click-through mode: hand full interactivity back.
      bridge.setIgnoreMouse(false);
    };
  }, [active]);
}

export function App(): JSX.Element {
  const init = useStore((s) => s.init);
  const loading = useStore((s) => s.loading);
  const error = useStore((s) => s.error);
  const snapshot = useStore((s) => s.snapshot);
  const config = useStore((s) => s.config);
  const appInfo = useStore((s) => s.appInfo);
  const view = useStore((s) => s.view);
  const updateConfig = useStore((s) => s.updateConfig);
  const refresh = useStore((s) => s.refresh);

  useEffect(() => {
    void init();
  }, [init]);

  useTheme(config?.theme);
  useClickThroughGuard(config?.clickThrough ?? false);

  const compact = config?.compact ?? false;

  let body: JSX.Element;
  if (loading) {
    body = <LoadingState />;
  } else if (error) {
    body = <ErrorState message={error} onRetry={() => void refresh()} />;
  } else if (!snapshot || !config) {
    body = <ErrorState message="No usage data is available yet." onRetry={() => void refresh()} />;
  } else if (view === 'settings') {
    body = (
      <Settings config={config} appInfo={appInfo} onChange={(patch) => void updateConfig(patch)} />
    );
  } else if (compact) {
    body = <CompactView snapshot={snapshot} currency={config.currency} />;
  } else {
    body = (
      <div className="body">
        <OfficialPanel official={snapshot.official} />
        <LocalPanel
          local={snapshot.local}
          currency={config.currency}
          historyWindowHours={config.historyWindowHours}
        />
        <SessionList
          sessions={snapshot.local.sessions}
          activeSessions={snapshot.local.activeSessions}
          limit={config.recentSessionLimit}
        />
      </div>
    );
  }

  const showFooter = !!snapshot && !!config && !compact;

  return (
    <div className={compact ? 'app app--compact' : 'app'}>
      <TitleBar />
      <ErrorBoundary>{body}</ErrorBoundary>
      {showFooter && snapshot ? (
        <Footer
          generatedAt={snapshot.generatedAt}
          health={snapshot.health}
          officialEnabled={config.enableOfficial}
          files={snapshot.local.stats.files}
        />
      ) : null}
    </div>
  );
}
