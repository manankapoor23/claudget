import { useEffect, type JSX } from 'react';
import { App } from './App';
import { PillApp } from './components/PillApp';
import { PopoverApp } from './components/PopoverApp';
import { MiniBarApp } from './components/MiniBarApp';
import { SettingsApp } from './components/Settings';
import { currentSurface } from './lib/surface';
import { useStore } from './store';

const surface = currentSurface();

/**
 * Picks what this window draws. The dashboard (App) initialises the store and
 * theme itself; the popover and pill set their own theme.
 */
export function Root(): JSX.Element {
  const init = useStore((s) => s.init);
  useEffect(() => {
    if (surface === 'popover' || surface === 'pill') void init();
  }, [init]);
  useEffect(() => {
    document.documentElement.dataset.surface = surface;
  }, []);

  if (surface === 'popover') return <PopoverApp />;
  if (surface === 'pill') return <PillApp />;
  if (surface === 'settings') return <SettingsApp />;
  if (surface === 'minibar') return <MiniBarApp />;
  return <App />;
}
