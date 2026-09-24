import { useEffect, type JSX } from 'react';
import { useStore } from './store';
import { useTheme } from './lib/theme';
import { getBridge } from './lib/api';
import { TitleBar } from './components/TitleBar';
import { Footer } from './components/Footer';
import { BudgetPanel } from './components/BudgetPanel';
import { LocalPanel } from './components/LocalPanel';
import { Forecast } from './components/Forecast';
import { Insights } from './components/Insights';
import { DashboardNav } from './components/DashboardNav';
import { WidgetOverview } from './components/WidgetOverview';
import { ActivityView } from './components/ActivityView';
import { SessionTable } from './components/SessionTable';
import { LimitHistory } from './components/LimitHistory';
import { Sidebar } from './components/Sidebar';
import { ErrorBoundary, ErrorState, LoadingState } from './components/States';
import { rankLimits, verdictFor } from '../shared/limits';

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
  const view = useStore((s) => s.view);
  const refresh = useStore((s) => s.refresh);

  useEffect(() => {
    void init();
  }, [init]);

  useTheme(config?.theme);
  useClickThroughGuard(config?.clickThrough ?? false);

  let content: JSX.Element;
  if (loading) {
    content = <LoadingState />;
  } else if (error) {
    content = <ErrorState message={error} onRetry={() => void refresh()} />;
  } else if (!snapshot || !config) {
    content = (
      <ErrorState message="No usage data is available yet." onRetry={() => void refresh()} />
    );
  } else if (view === 'sessions') {
    content = (
      <SessionTable
        sessions={snapshot.local.sessions}
        activeSessions={snapshot.local.activeSessions}
        currency={config.currency}
      />
    );
  } else if (view === 'activity') {
    content = <ActivityView local={snapshot.local} currency={config.currency} />;
  } else if (view === 'insights') {
    content = (
      <div className="grid2">
        <div className="grid2__full">
          <LimitHistory now={snapshot.generatedAt} />
        </div>
        <Forecast local={snapshot.local} currency={config.currency} />
        <Insights local={snapshot.local} currency={config.currency} />
        <BudgetPanel
          local={snapshot.local}
          dailyBudgetUSD={config.dailyBudgetUSD}
          monthlyBudgetUSD={config.monthlyBudgetUSD}
          currency={config.currency}
        />
        <div className="grid2__full">
          <LocalPanel
            local={snapshot.local}
            currency={config.currency}
            historyWindowHours={config.historyWindowHours}
          />
        </div>
      </div>
    );
  } else {
    content = <WidgetOverview snapshot={snapshot} withHistory />;
  }

  const ranked = snapshot?.official.available ? rankLimits(snapshot.official.windows) : null;
  const tone = ranked && snapshot ? verdictFor(ranked, snapshot.generatedAt).tone : 'ok';

  return (
    <div className="app app--dash" data-tone={tone} data-view={view}>
      <Sidebar />
      <div className="dash__main">
        <TitleBar />
        <div className="body">
          {/* Narrow windows: tabs instead of the sidebar. */}
          <DashboardNav view={view} />
          <ErrorBoundary>{content}</ErrorBoundary>
        </div>
        {snapshot && config ? (
          <Footer
            localUpdatedAt={snapshot.localUpdatedAt}
            health={snapshot.health}
            officialEnabled={config.enableOfficial}
          />
        ) : null}
      </div>
    </div>
  );
}
