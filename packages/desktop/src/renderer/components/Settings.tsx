import { useEffect, useState, type ChangeEvent, type JSX, type ReactNode } from 'react';
import type { WidgetConfig } from '@shared/ipc';
import { IS_MAC as MAC } from '../lib/platform';
import { useStore } from '../store';
import { getBridge } from '../lib/api';
import { useTheme } from '../lib/theme';
import { BellIcon, DataIcon, ExternalIcon, InfoIcon, SettingsIcon } from './icons';
import logoUrl from '../assets/claudget-logo.png';

type Tab = 'general' | 'alerts' | 'data' | 'about';

const TABS: Array<{ id: Tab; label: string; Icon: typeof SettingsIcon }> = [
  { id: 'general', label: 'General', Icon: SettingsIcon },
  { id: 'alerts', label: 'Alerts', Icon: BellIcon },
  { id: 'data', label: 'Data', Icon: DataIcon },
  { id: 'about', label: 'About', Icon: InfoIcon },
];

interface Option<T> {
  value: T;
  label: string;
}

const POLL_OPTIONS: Option<number>[] = [
  { value: 180_000, label: 'Every 3 minutes' },
  { value: 300_000, label: 'Every 5 minutes' },
  { value: 600_000, label: 'Every 10 minutes' },
  { value: 900_000, label: 'Every 15 minutes' },
  { value: 1_800_000, label: 'Every 30 minutes' },
];
const HISTORY_OPTIONS: Option<number>[] = [
  { value: 6, label: '6 hours' },
  { value: 12, label: '12 hours' },
  { value: 24, label: '24 hours' },
  { value: 48, label: '2 days' },
  { value: 72, label: '3 days' },
  { value: 168, label: '1 week' },
];
const SESSION_OPTIONS: Option<number>[] = [5, 8, 12, 20, 50].map((n) => ({
  value: n,
  label: String(n),
}));
const THEME_OPTIONS: Option<WidgetConfig['theme']>[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];
const LOG_OPTIONS: Option<WidgetConfig['logLevel']>[] = [
  { value: 'error', label: 'Errors only' },
  { value: 'warn', label: 'Warnings' },
  { value: 'info', label: 'Info' },
  { value: 'debug', label: 'Debug' },
];
const THRESHOLD_CHOICES = [50, 70, 80, 90, 95, 100];

/** A titled inset group of rows, as in System Settings. */
function Group({ title, children }: { title?: string; children: ReactNode }): JSX.Element {
  return (
    <section className="sgroup">
      {title ? <h2 className="sgroup__title">{title}</h2> : null}
      <div className="sgroup__rows">{children}</div>
    </section>
  );
}

function Row({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <div className="srow">
      <div className="srow__text">
        <label className="srow__label" htmlFor={htmlFor}>
          {label}
        </label>
        {hint ? <span className="srow__hint">{hint}</span> : null}
      </div>
      <div className="srow__control">{children}</div>
    </div>
  );
}

function Toggle({
  id,
  on,
  onChange,
}: {
  id: string;
  on: boolean;
  onChange: (on: boolean) => void;
}): JSX.Element {
  return (
    <button
      id={id}
      className={on ? 'switch switch--on' : 'switch'}
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
    />
  );
}

function Select<T extends string | number>({
  id,
  value,
  options,
  onChange,
}: {
  id: string;
  value: T;
  options: Option<T>[];
  onChange: (v: T) => void;
}): JSX.Element {
  const known = options.some((o) => o.value === value);
  const handle = (e: ChangeEvent<HTMLSelectElement>): void => {
    const raw = e.target.value;
    onChange((typeof value === 'number' ? Number(raw) : raw) as T);
  };
  return (
    <select id={id} className="select" value={String(value)} onChange={handle}>
      {known ? null : <option value={String(value)}>{String(value)}</option>}
      {options.map((o) => (
        <option key={String(o.value)} value={String(o.value)}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: Option<T>[];
  onChange: (v: T) => void;
  label: string;
}): JSX.Element {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={
            value === o.value ? 'segmented__button segmented__button--active' : 'segmented__button'
          }
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Budget amount in USD; commits on blur/enter so typing "150" isn't three saves. */
function MoneyInput({
  id,
  value,
  onChange,
}: {
  id: string;
  value: number | null;
  onChange: (v: number | null) => void;
}): JSX.Element {
  const [draft, setDraft] = useState(value === null ? '' : String(value));
  useEffect(() => setDraft(value === null ? '' : String(value)), [value]);
  const commit = (): void => {
    const raw = draft.trim();
    if (raw === '') return onChange(null);
    const n = Number(raw);
    onChange(Number.isFinite(n) && n >= 0 ? n : value);
  };
  return (
    <span className="money">
      <span aria-hidden>$</span>
      <input
        id={id}
        className="select money__input"
        type="number"
        min={0}
        step={1}
        placeholder="Off"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
        }}
      />
    </span>
  );
}

function General({
  c,
  set,
}: {
  c: WidgetConfig;
  set: (p: Partial<WidgetConfig>) => void;
}): JSX.Element {
  return (
    <>
      <Group>
        <Row label="Appearance">
          <Segmented
            label="Appearance"
            value={c.theme}
            options={THEME_OPTIONS}
            onChange={(theme) => set({ theme })}
          />
        </Row>
      </Group>
      <Group title="Menu bar">
        <Row
          label="Floating pill"
          hint="A one-line strip that stays on top. Click it for more."
          htmlFor="set-pill"
        >
          <Toggle id="set-pill" on={c.compact} onChange={(compact) => set({ compact })} />
        </Row>
        <Row
          label="Floating bar"
          hint="Both limits and today in one strip that stays on top. Drag its edges to resize."
          htmlFor="set-bar"
        >
          <Toggle id="set-bar" on={c.miniBar} onChange={(miniBar) => set({ miniBar })} />
        </Row>
        <Row label="Open at login" htmlFor="set-login">
          <Toggle
            id="set-login"
            on={c.launchOnLogin}
            onChange={(launchOnLogin) => set({ launchOnLogin })}
          />
        </Row>
        {MAC ? null : (
          <Row label="Show in taskbar" htmlFor="set-taskbar">
            <Toggle
              id="set-taskbar"
              on={c.showInTaskbar}
              onChange={(showInTaskbar) => set({ showInTaskbar })}
            />
          </Row>
        )}
      </Group>
      <Group title="Dashboard window">
        <Row label="Keep on top" hint="Float above other windows." htmlFor="set-top">
          <Toggle
            id="set-top"
            on={c.alwaysOnTop}
            onChange={(alwaysOnTop) => set({ alwaysOnTop })}
          />
        </Row>
        <Row
          label="Click-through"
          hint="Clicks pass through to the app underneath. ⌥⌘C toggles it."
          htmlFor="set-ct"
        >
          <Toggle
            id="set-ct"
            on={c.clickThrough}
            onChange={(clickThrough) => set({ clickThrough })}
          />
        </Row>
        <Row label="Opacity" htmlFor="set-opacity">
          <span className="range-row">
            <input
              id="set-opacity"
              className="range"
              type="range"
              min={0.3}
              max={1}
              step={0.05}
              value={c.opacity}
              onChange={(e) => set({ opacity: Number(e.target.value) })}
            />
            <output htmlFor="set-opacity">{Math.round(c.opacity * 100)}%</output>
          </span>
        </Row>
      </Group>
    </>
  );
}

function Alerts({
  c,
  set,
}: {
  c: WidgetConfig;
  set: (p: Partial<WidgetConfig>) => void;
}): JSX.Element {
  const chosen = new Set(c.limitAlertThresholds);
  const toggle = (t: number): void => {
    const next = new Set(chosen);
    if (next.has(t)) next.delete(t);
    else next.add(t);
    if (next.size === 0) return; // keep at least one
    set({ limitAlertThresholds: [...next].sort((a, b) => a - b) });
  };
  return (
    <>
      <Group title="Plan limits">
        <Row
          label="Notify me"
          hint="Once per threshold per window, then quiet until it resets."
          htmlFor="set-alerts"
        >
          <Toggle
            id="set-alerts"
            on={c.limitAlerts}
            onChange={(limitAlerts) => set({ limitAlerts })}
          />
        </Row>
        <Row label="When a limit reaches">
          <div className="chips" role="group" aria-label="Alert thresholds">
            {THRESHOLD_CHOICES.map((t) => (
              <button
                key={t}
                type="button"
                className={chosen.has(t) ? 'chip chip--on' : 'chip'}
                aria-pressed={chosen.has(t)}
                disabled={!c.limitAlerts}
                onClick={() => toggle(t)}
              >
                {t}%
              </button>
            ))}
          </div>
        </Row>
      </Group>
      <Group title="Budgets">
        <Row
          label="Daily"
          hint="Priced at API list rates. Notifies at 80% and 100%."
          htmlFor="set-daily"
        >
          <MoneyInput
            id="set-daily"
            value={c.dailyBudgetUSD}
            onChange={(dailyBudgetUSD) => set({ dailyBudgetUSD })}
          />
        </Row>
        <Row label="Monthly" htmlFor="set-monthly">
          <MoneyInput
            id="set-monthly"
            value={c.monthlyBudgetUSD}
            onChange={(monthlyBudgetUSD) => set({ monthlyBudgetUSD })}
          />
        </Row>
      </Group>
    </>
  );
}

function Data({
  c,
  set,
}: {
  c: WidgetConfig;
  set: (p: Partial<WidgetConfig>) => void;
}): JSX.Element {
  const official = useStore((s) => s.snapshot?.official ?? null);
  const appInfo = useStore((s) => s.appInfo);
  const bridge = getBridge();
  const status =
    !c.enableOfficial || !official
      ? null
      : official.available && !official.stale
        ? 'Connected'
        : official.stale
          ? 'Showing cached limits'
          : (official.message ?? 'Not connected');
  return (
    <>
      <Group title="Plan limits">
        <Row
          label="Track plan limits"
          hint="Reads your Claude Code login and asks Anthropic for your 5-hour and weekly limits."
          htmlFor="set-official"
        >
          <Toggle
            id="set-official"
            on={c.enableOfficial}
            onChange={(enableOfficial) => set({ enableOfficial })}
          />
        </Row>
        {c.enableOfficial ? (
          <Row label="Check for updates" hint={status ?? undefined} htmlFor="set-poll">
            <Select
              id="set-poll"
              value={c.officialPollIntervalMs}
              options={POLL_OPTIONS}
              onChange={(officialPollIntervalMs) => set({ officialPollIntervalMs })}
            />
          </Row>
        ) : null}
      </Group>
      <Group title="Local usage">
        <Row
          label="OpenCode usage"
          hint="Read saved token usage from OpenCode's local database. No account or active session needed."
          htmlFor="set-opencode"
        >
          <Toggle
            id="set-opencode"
            on={c.enableOpenCode}
            onChange={(enableOpenCode) => set({ enableOpenCode })}
          />
        </Row>
        <Row
          label="Activity window"
          hint="How far back the Activity chart goes."
          htmlFor="set-window"
        >
          <Select
            id="set-window"
            value={c.historyWindowHours}
            options={HISTORY_OPTIONS}
            onChange={(historyWindowHours) => set({ historyWindowHours })}
          />
        </Row>
        <Row label="Recent sessions" hint="How many the Sessions list keeps." htmlFor="set-recent">
          <Select
            id="set-recent"
            value={c.recentSessionLimit}
            options={SESSION_OPTIONS}
            onChange={(recentSessionLimit) => set({ recentSessionLimit })}
          />
        </Row>
        <Row label="Claude folder" hint={appInfo?.claudeDir ?? '~/.claude'}>
          <span className="srow__static">Read only</span>
        </Row>
      </Group>
      <Group title="Troubleshooting">
        <Row label="Log detail" htmlFor="set-log">
          <Select
            id="set-log"
            value={c.logLevel}
            options={LOG_OPTIONS}
            onChange={(logLevel) => set({ logLevel })}
          />
        </Row>
        <Row label="Files">
          <span className="btns">
            <button className="btn2" type="button" onClick={() => void bridge?.openLogs()}>
              Logs <ExternalIcon />
            </button>
            <button className="btn2" type="button" onClick={() => void bridge?.openConfigFile()}>
              Config file <ExternalIcon />
            </button>
          </span>
        </Row>
      </Group>
    </>
  );
}

function About(): JSX.Element {
  const appInfo = useStore((s) => s.appInfo);
  return (
    <div className="about">
      <img className="about__icon" src={logoUrl} alt="" />
      <h2 className="about__name">claudget</h2>
      <p className="about__version">Version {appInfo?.appVersion ?? '—'}</p>
      <p className="about__line">
        Claude Code usage in your menu bar. Reads your local transcripts. The only things it fetches
        are your plan limits, from Anthropic, and updates, from GitHub on Windows and Linux.
      </p>
      <Group>
        <Row label="Claude Code">
          <span className="srow__static">{appInfo?.cliVersion ?? 'Not detected'}</span>
        </Row>
        <Row label="Pricing">
          <span className="srow__static srow__static--wrap">{appInfo?.pricingNote ?? '—'}</span>
        </Row>
      </Group>
      <p className="about__links">
        <a href="https://claudget.vercel.app" target="_blank" rel="noreferrer">
          Website
        </a>
        <a href="https://github.com/manankapoor23/claudget" target="_blank" rel="noreferrer">
          GitHub
        </a>
        <a
          href="https://github.com/manankapoor23/claudget/releases/latest"
          target="_blank"
          rel="noreferrer"
        >
          Release notes
        </a>
      </p>
    </div>
  );
}

/** The ⌘, window: toolbar tabs over grouped settings, as on the Mac. */
export function SettingsApp(): JSX.Element {
  const init = useStore((s) => s.init);
  const config = useStore((s) => s.config);
  const updateConfig = useStore((s) => s.updateConfig);
  const [tab, setTab] = useState<Tab>('general');
  useTheme(config?.theme);
  useEffect(() => {
    void init();
  }, [init]);
  // ⌘W closes the window like any other on the Mac.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'w') {
        e.preventDefault();
        void getBridge()?.windowAction({ type: 'hide' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const set = (patch: Partial<WidgetConfig>): void => void updateConfig(patch);

  return (
    <div className="app app--settings">
      <header className="set__bar">
        <nav className="set__tabs" role="tablist" aria-label="Settings">
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={tab === id ? 'set__tab set__tab--on' : 'set__tab'}
              onClick={() => setTab(id)}
            >
              <Icon size={18} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </header>
      <div className="set__body" role="tabpanel">
        {!config ? null : tab === 'general' ? (
          <General c={config} set={set} />
        ) : tab === 'alerts' ? (
          <Alerts c={config} set={set} />
        ) : tab === 'data' ? (
          <Data c={config} set={set} />
        ) : (
          <About />
        )}
      </div>
    </div>
  );
}
