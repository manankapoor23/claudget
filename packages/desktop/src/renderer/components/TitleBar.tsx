import { useEffect, useRef, useState, type JSX } from 'react';
import { IS_MAC as MAC } from '../lib/platform';
import { useStore } from '../store';
import { getBridge } from '../lib/api';
import { planName } from '../lib/billing';
import { CheckIcon, CloseIcon, MoreIcon, PinIcon } from './icons';
import { VIEWS } from './Sidebar';
import logoUrl from '../assets/claudget-logo.png';

interface MenuItem {
  label: string;
  checked?: boolean;
  onSelect: () => void;
}

/** A small popover menu; closes on selection, outside click, or Escape. */
function OverflowMenu({ items }: { items: MenuItem[] }): JSX.Element {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: MouseEvent): void => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="menu" ref={root}>
      <button
        className={open ? 'iconbtn iconbtn--open' : 'iconbtn'}
        type="button"
        title="More"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <MoreIcon />
      </button>
      {open ? (
        // Marked interactive so it stays clickable while click-through is on.
        <div className="menu__pop" role="menu" data-ct-interactive>
          {items.map((item) => (
            <button
              key={item.label}
              className="menu__item"
              type="button"
              role={item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
              aria-checked={item.checked}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
            >
              <span className="menu__check">{item.checked ? <CheckIcon /> : null}</span>
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function TitleBar(): JSX.Element {
  const view = useStore((s) => s.view);
  const config = useStore((s) => s.config);
  const updateConfig = useStore((s) => s.updateConfig);
  const refresh = useStore((s) => s.refresh);
  const subscription = useStore((s) => s.snapshot?.meta.subscriptionType ?? null);
  const live = useStore((s) => (s.snapshot?.local.activeBlock ?? null) !== null);
  const bridge = getBridge();

  const alwaysOnTop = config?.alwaysOnTop ?? false;
  const clickThrough = config?.clickThrough ?? false;
  const title = VIEWS.find((v) => v.id === view)?.label ?? 'Overview';

  return (
    <div className={MAC ? 'titlebar titlebar--mac' : 'titlebar'} data-ct-interactive>
      {/* Narrow: the brand. Wide (sidebar showing): the current view, like a toolbar title. */}
      <div className="titlebar__brand">
        <img className="titlebar__logo" src={logoUrl} alt="" />
        <span>claudget</span>
        {subscription ? <span className="titlebar__sub">{planName(subscription)}</span> : null}
      </div>
      <h1 className="titlebar__view">{title}</h1>
      <div className="titlebar__spacer" />
      <span className={live ? 'titlebar__live titlebar__live--on' : 'titlebar__live'}>
        <span className="titlebar__live-dot" />
        {live ? 'Live' : 'Idle'}
      </span>
      {MAC ? null : (
        // macOS has native window controls and an app menu for all of this.
        <div className="titlebar__actions">
          <button
            className={alwaysOnTop ? 'iconbtn iconbtn--active' : 'iconbtn'}
            type="button"
            title={alwaysOnTop ? 'Keep on top: on' : 'Keep on top: off'}
            onClick={() => void updateConfig({ alwaysOnTop: !alwaysOnTop })}
          >
            <PinIcon />
          </button>
          <OverflowMenu
            items={[
              { label: 'Refresh now', onSelect: () => void refresh() },
              {
                label: 'Click-through',
                checked: clickThrough,
                onSelect: () => void updateConfig({ clickThrough: !clickThrough }),
              },
              {
                label: 'Floating pill',
                checked: config?.compact ?? false,
                onSelect: () => void updateConfig({ compact: !(config?.compact ?? false) }),
              },
              {
                label: 'Floating bar',
                checked: config?.miniBar ?? false,
                onSelect: () => void updateConfig({ miniBar: !(config?.miniBar ?? false) }),
              },
              {
                label: 'Settings',
                onSelect: () => void bridge?.windowAction({ type: 'open-settings' }),
              },
              {
                label: 'Minimize',
                onSelect: () => void bridge?.windowAction({ type: 'minimize' }),
              },
            ]}
          />
          <button
            className="iconbtn iconbtn--danger"
            type="button"
            title="Close"
            onClick={() => void bridge?.windowAction({ type: 'hide' })}
          >
            <CloseIcon />
          </button>
        </div>
      )}
    </div>
  );
}
