import type { JSX } from 'react';
import { useStore } from '../store';
import { getBridge } from '../lib/api';
import {
  BackIcon,
  ClickThroughIcon,
  CloseIcon,
  MinusIcon,
  PinIcon,
  RefreshIcon,
  SettingsIcon,
} from './icons';

export function TitleBar(): JSX.Element {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const config = useStore((s) => s.config);
  const updateConfig = useStore((s) => s.updateConfig);
  const refresh = useStore((s) => s.refresh);
  const subscription = useStore((s) => s.snapshot?.meta.subscriptionType ?? null);

  const inSettings = view === 'settings';
  const alwaysOnTop = config?.alwaysOnTop ?? false;
  const clickThrough = config?.clickThrough ?? false;

  return (
    <div className="titlebar" data-ct-interactive>
      <div className="titlebar__brand">
        <span className="titlebar__logo" />
        <span>Claude Usage</span>
        {subscription ? <span className="titlebar__sub">{subscription}</span> : null}
      </div>
      <div className="titlebar__spacer" />
      <div className="titlebar__actions">
        {inSettings ? (
          <button className="iconbtn" type="button" title="Back" onClick={() => setView('main')}>
            <BackIcon />
          </button>
        ) : (
          <>
            <button
              className="iconbtn"
              type="button"
              title="Refresh now"
              onClick={() => void refresh()}
            >
              <RefreshIcon />
            </button>
            <button
              className={alwaysOnTop ? 'iconbtn iconbtn--active' : 'iconbtn'}
              type="button"
              title={alwaysOnTop ? 'Always on top: on' : 'Always on top: off'}
              onClick={() => void updateConfig({ alwaysOnTop: !alwaysOnTop })}
            >
              <PinIcon />
            </button>
            <button
              className="iconbtn"
              type="button"
              title="Settings"
              onClick={() => setView('settings')}
            >
              <SettingsIcon />
            </button>
          </>
        )}
        <button
          className={clickThrough ? 'iconbtn iconbtn--active' : 'iconbtn'}
          type="button"
          title={clickThrough ? 'Click-through: on (clicks pass through)' : 'Click-through: off'}
          onClick={() => void updateConfig({ clickThrough: !clickThrough })}
        >
          <ClickThroughIcon />
        </button>
        <button
          className="iconbtn"
          type="button"
          title="Minimize"
          onClick={() => void getBridge()?.windowAction({ type: 'minimize' })}
        >
          <MinusIcon />
        </button>
        <button
          className="iconbtn iconbtn--danger"
          type="button"
          title="Hide to tray"
          onClick={() => void getBridge()?.windowAction({ type: 'hide' })}
        >
          <CloseIcon />
        </button>
      </div>
    </div>
  );
}
