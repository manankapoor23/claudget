import { useEffect, useRef, type JSX } from 'react';
import { useStore } from '../store';
import { useTheme } from '../lib/theme';
import { getBridge } from '../lib/api';
import { planName } from '../lib/billing';
import { rankLimits, verdictFor } from '../../shared/limits';
import { Welcome } from './Welcome';
import { WidgetOverview } from './WidgetOverview';
import { ErrorState, LoadingState } from './States';

/**
 * The menu-bar dropdown: the everyday glance. The overview, plus the few
 * actions that belong one click from the menu bar — nothing else.
 */
export function PopoverApp(): JSX.Element {
  const snapshot = useStore((s) => s.snapshot);
  const config = useStore((s) => s.config);
  const loading = useStore((s) => s.loading);
  const error = useStore((s) => s.error);
  const updateConfig = useStore((s) => s.updateConfig);
  const bridge = getBridge();
  const bar = useRef<HTMLElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const foot = useRef<HTMLElement>(null);

  // Fit the window to what's actually here — no fixed height, no dead space.
  useEffect(() => {
    const el = content.current;
    if (!el || !bridge) return undefined;
    let frame = 0;
    const fit = (): void => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const body = el.parentElement;
        const pad = body ? parseFloat(getComputedStyle(body).paddingBottom) || 0 : 0;
        const height =
          (bar.current?.offsetHeight ?? 0) +
          el.offsetHeight +
          pad +
          (foot.current?.offsetHeight ?? 0);
        void bridge.windowAction({ type: 'popover-height', height: Math.ceil(height) });
      });
    };
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    fit();
    return () => {
      ro.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [bridge]);

  // The keys a menu-bar popover is expected to answer to.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') void bridge?.windowAction({ type: 'hide' });
      else if (e.metaKey && e.key === ',')
        void bridge?.windowAction({ type: 'open-dashboard', view: 'settings' });
      else if (e.metaKey && e.key.toLowerCase() === 'd')
        void bridge?.windowAction({ type: 'open-dashboard' });
      else if (e.metaKey && e.key.toLowerCase() === 'q')
        void bridge?.windowAction({ type: 'quit' });
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [bridge]);
  useTheme(config?.theme);

  const ranked = snapshot?.official.available ? rankLimits(snapshot.official.windows) : null;
  const tone = ranked && snapshot ? verdictFor(ranked, snapshot.generatedAt).tone : 'ok';
  const live = (snapshot?.local.activeBlock ?? null) !== null;
  const plan = snapshot?.meta.subscriptionType ?? null;
  const appInfo = useStore((s) => s.appInfo);

  return (
    <div className="app app--popover" data-tone={tone} data-view="main">
      <header className="pop__bar" ref={bar}>
        <span className="titlebar__brand">claudget</span>
        {plan ? <span className="titlebar__sub">{planName(plan)}</span> : null}
        <span className="titlebar__spacer" />
        <span className={live ? 'titlebar__live titlebar__live--on' : 'titlebar__live'}>
          <span className="titlebar__live-dot" />
          {live ? 'Live' : 'Idle'}
        </span>
      </header>

      <div className="body">
        <div className="pop__content" ref={content}>
          {appInfo?.firstRun ? <Welcome /> : null}
          {loading ? (
            <LoadingState />
          ) : error || !snapshot || !config ? (
            <ErrorState
              message={error ?? 'No usage data yet.'}
              onRetry={() => void bridge?.refresh()}
            />
          ) : (
            <WidgetOverview snapshot={snapshot} />
          )}
        </div>
      </div>

      <footer className="pop__foot" ref={foot}>
        <button
          type="button"
          className="pop__action pop__action--primary"
          title="Open dashboard (⌘D)"
          onClick={() => void bridge?.windowAction({ type: 'open-dashboard' })}
        >
          Dashboard
        </button>
        <button
          type="button"
          className={config?.compact ? 'pop__action pop__action--on' : 'pop__action'}
          aria-pressed={config?.compact ?? false}
          title="Floating pill: a one-line strip that stays on top"
          onClick={() => void updateConfig({ compact: !(config?.compact ?? false) })}
        >
          Pill
        </button>
        <button
          type="button"
          className={config?.miniBar ? 'pop__action pop__action--on' : 'pop__action'}
          aria-pressed={config?.miniBar ?? false}
          title="Floating bar: both limits and today, always on top"
          onClick={() => void updateConfig({ miniBar: !(config?.miniBar ?? false) })}
        >
          Bar
        </button>
        <span className="pop__spacer" />
        <button
          type="button"
          className="pop__action"
          title="Settings (⌘,)"
          onClick={() => void bridge?.windowAction({ type: 'open-dashboard', view: 'settings' })}
        >
          Settings
        </button>
        <button
          type="button"
          className="pop__action"
          title="Quit claudget (⌘Q)"
          onClick={() => void bridge?.windowAction({ type: 'quit' })}
        >
          Quit
        </button>
      </footer>
    </div>
  );
}
