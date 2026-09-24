import type { JSX } from 'react';
import { useStore, type View } from '../store';

const TABS: Array<{ id: Exclude<View, 'settings'>; label: string; hint: string }> = [
  { id: 'main', label: 'Overview', hint: 'The important numbers first' },
  { id: 'activity', label: 'Activity', hint: 'Usage over time' },
  { id: 'sessions', label: 'Sessions', hint: 'Projects and active work' },
  { id: 'insights', label: 'Insights', hint: 'Patterns in your usage' },
];

export function DashboardNav({ view }: { view: View }): JSX.Element {
  const setView = useStore((s) => s.setView);

  return (
    <nav className="dashboard-nav" aria-label="Dashboard views">
      {TABS.map((tab, i) => (
        <button
          key={tab.id}
          className={
            view === tab.id ? 'dashboard-nav__tab dashboard-nav__tab--active' : 'dashboard-nav__tab'
          }
          type="button"
          title={tab.hint}
          aria-current={view === tab.id ? 'page' : undefined}
          onClick={() => setView(tab.id)}
        >
          <span className="dashboard-nav__num">{String(i + 1).padStart(2, '0')}</span>
          <span className="dashboard-nav__label">{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}
