import type { JSX } from 'react';
import { IS_MAC as MAC } from '../lib/platform';
import { useStore, type View } from '../store';
import { planName } from '../lib/billing';
import { ActivityIcon, InsightsIcon, OverviewIcon, SessionsIcon } from './icons';
import { Footer } from './Footer';

export const VIEWS: Array<{ id: View; label: string; key: string; Icon: typeof OverviewIcon }> = [
  { id: 'main', label: 'Overview', key: '1', Icon: OverviewIcon },
  { id: 'activity', label: 'Activity', key: '2', Icon: ActivityIcon },
  { id: 'sessions', label: 'Sessions', key: '3', Icon: SessionsIcon },
  { id: 'insights', label: 'Insights', key: '4', Icon: InsightsIcon },
];

/**
 * The dashboard's source list, as in Finder or Mail: views up top, the plan
 * and data freshness at the bottom. Shown when the window is wide enough;
 * narrower windows fall back to tabs.
 */
export function Sidebar(): JSX.Element {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const snapshot = useStore((s) => s.snapshot);
  const config = useStore((s) => s.config);
  const plan = snapshot?.meta.subscriptionType ?? null;

  return (
    <aside className="side" aria-label="Views">
      <div className="side__head">{MAC ? null : <span className="side__brand">claudget</span>}</div>
      <nav className="side__nav">
        {VIEWS.map(({ id, label, key, Icon }) => (
          <button
            key={id}
            type="button"
            className={view === id ? 'side__item side__item--on' : 'side__item'}
            aria-current={view === id ? 'page' : undefined}
            onClick={() => setView(id)}
          >
            <Icon />
            <span>{label}</span>
            {MAC ? <kbd>⌘{key}</kbd> : null}
          </button>
        ))}
      </nav>
      <div className="side__foot">
        {plan ? <span className="side__plan">{planName(plan)} plan</span> : null}
        {snapshot && config ? (
          <Footer
            localUpdatedAt={snapshot.localUpdatedAt}
            health={snapshot.health}
            officialEnabled={config.enableOfficial}
          />
        ) : null}
      </div>
    </aside>
  );
}
