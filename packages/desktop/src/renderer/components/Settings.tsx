import type { ChangeEvent, JSX, ReactNode } from 'react';
import type { AppInfo, WidgetConfig } from '@shared/ipc';
import { getBridge } from '../lib/api';
import { ExternalIcon } from './icons';

interface SettingsProps {
  config: WidgetConfig;
  appInfo: AppInfo | null;
  onChange: (patch: Partial<WidgetConfig>) => void;
}

interface Option<T> {
  value: T;
  label: string;
}

const POLL_OPTIONS: Option<number>[] = [
  { value: 180_000, label: 'Every 3 min' },
  { value: 300_000, label: 'Every 5 min' },
  { value: 600_000, label: 'Every 10 min' },
  { value: 900_000, label: 'Every 15 min' },
  { value: 1_800_000, label: 'Every 30 min' },
];

const HISTORY_OPTIONS: Option<number>[] = [
  { value: 6, label: '6 hours' },
  { value: 12, label: '12 hours' },
  { value: 24, label: '24 hours' },
  { value: 48, label: '2 days' },
  { value: 72, label: '3 days' },
  { value: 168, label: '1 week' },
];

const SESSION_OPTIONS: Option<number>[] = [
  { value: 5, label: '5' },
  { value: 8, label: '8' },
  { value: 12, label: '12' },
  { value: 20, label: '20' },
  { value: 50, label: '50' },
];

const THEME_OPTIONS: Option<WidgetConfig['theme']>[] = [
  { value: 'system', label: 'System' },
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
];

const LOG_OPTIONS: Option<WidgetConfig['logLevel']>[] = [
  { value: 'error', label: 'Error' },
  { value: 'warn', label: 'Warn' },
  { value: 'info', label: 'Info' },
  { value: 'debug', label: 'Debug' },
];

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <div className="field">
      <div className="field__label">
        {label}
        {hint ? <div className="field__hint">{hint}</div> : null}
      </div>
      {children}
    </div>
  );
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }): JSX.Element {
  return (
    <button
      className={on ? 'switch switch--on' : 'switch'}
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onClick}
    />
  );
}

function NumberSelect({
  value,
  options,
  onChange,
}: {
  value: number;
  options: Option<number>[];
  onChange: (v: number) => void;
}): JSX.Element {
  const known = options.some((o) => o.value === value);
  const handle = (e: ChangeEvent<HTMLSelectElement>): void => onChange(Number(e.target.value));
  return (
    <select className="select" value={value} onChange={handle}>
      {known ? null : <option value={value}>{value}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function MoneyInput({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
}): JSX.Element {
  const handle = (e: ChangeEvent<HTMLInputElement>): void => {
    const raw = e.target.value.trim();
    if (raw === '') return onChange(null);
    const n = Number(raw);
    onChange(Number.isFinite(n) && n >= 0 ? n : null);
  };
  return (
    <input
      className="select"
      type="number"
      min={0}
      step={1}
      placeholder="off"
      value={value ?? ''}
      onChange={handle}
      style={{ width: 90 }}
    />
  );
}

function Kv({ k, v }: { k: string; v: string }): JSX.Element {
  return (
    <div className="kv">
      <span>{k}</span>
      <b>{v}</b>
    </div>
  );
}

export function Settings({ config, appInfo, onChange }: SettingsProps): JSX.Element {
  return (
    <div className="body">
      <div className="settings">
        <div className="field__group-title">Appearance</div>

        <Field label="Theme">
          <select
            className="select"
            value={config.theme}
            onChange={(e) => onChange({ theme: e.target.value as WidgetConfig['theme'] })}
          >
            {THEME_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Compact mode" hint="Shrink to a minimal always-on glance.">
          <Toggle on={config.compact} onClick={() => onChange({ compact: !config.compact })} />
        </Field>

        <Field label="Always on top">
          <Toggle
            on={config.alwaysOnTop}
            onClick={() => onChange({ alwaysOnTop: !config.alwaysOnTop })}
          />
        </Field>

        <Field label="Click-through" hint="Ignore the mouse so clicks pass to windows beneath.">
          <Toggle
            on={config.clickThrough}
            onClick={() => onChange({ clickThrough: !config.clickThrough })}
          />
        </Field>

        <Field label="Show in taskbar">
          <Toggle
            on={config.showInTaskbar}
            onClick={() => onChange({ showInTaskbar: !config.showInTaskbar })}
          />
        </Field>

        <Field label="Launch on login">
          <Toggle
            on={config.launchOnLogin}
            onClick={() => onChange({ launchOnLogin: !config.launchOnLogin })}
          />
        </Field>

        <Field label={`Opacity · ${Math.round(config.opacity * 100)}%`}>
          <input
            className="range"
            type="range"
            min={0.3}
            max={1}
            step={0.05}
            value={config.opacity}
            onChange={(e) => onChange({ opacity: Number(e.target.value) })}
          />
        </Field>

        <div className="field__group-title">Data</div>

        <Field
          label="Track plan limits"
          hint="Optional. Adds 5-hour & weekly plan gauges by polling Anthropic. Off by default — everything else is fully local."
        >
          <Toggle
            on={config.enableOfficial}
            onClick={() => onChange({ enableOfficial: !config.enableOfficial })}
          />
        </Field>

        {config.enableOfficial ? (
          <Field label="Refresh limits" hint="Minimum 3 min — the endpoint is rate-limited.">
            <NumberSelect
              value={config.officialPollIntervalMs}
              options={POLL_OPTIONS}
              onChange={(v) => onChange({ officialPollIntervalMs: v })}
            />
          </Field>
        ) : null}

        <Field label="Activity window" hint="Span shown in the activity sparkline.">
          <NumberSelect
            value={config.historyWindowHours}
            options={HISTORY_OPTIONS}
            onChange={(v) => onChange({ historyWindowHours: v })}
          />
        </Field>

        <Field label="Recent sessions">
          <NumberSelect
            value={config.recentSessionLimit}
            options={SESSION_OPTIONS}
            onChange={(v) => onChange({ recentSessionLimit: v })}
          />
        </Field>

        <div className="field__group-title">Budgets</div>

        <Field
          label="Daily budget (USD)"
          hint="Get a notification at 80% and 100% of today's spend. Empty = off."
        >
          <MoneyInput
            value={config.dailyBudgetUSD}
            onChange={(v) => onChange({ dailyBudgetUSD: v })}
          />
        </Field>

        <Field
          label="Monthly budget (USD)"
          hint="Get a notification at 80% and 100% of this month's spend. Empty = off."
        >
          <MoneyInput
            value={config.monthlyBudgetUSD}
            onChange={(v) => onChange({ monthlyBudgetUSD: v })}
          />
        </Field>

        <div className="field__group-title">Diagnostics</div>

        <Field label="Log level">
          <select
            className="select"
            value={config.logLevel}
            onChange={(e) => onChange({ logLevel: e.target.value as WidgetConfig['logLevel'] })}
          >
            {LOG_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>

        {appInfo ? (
          <>
            <div className="field__group-title">About</div>
            <Kv k="Widget version" v={appInfo.appVersion} />
            <Kv k="Claude CLI" v={appInfo.cliVersion ?? 'not detected'} />
            <Kv k="Platform" v={appInfo.platform} />
            <Kv k="Claude directory" v={appInfo.claudeDir} />
            <div className="btn-row">
              <button
                className="btn"
                type="button"
                onClick={() => void getBridge()?.openConfigFile()}
              >
                <ExternalIcon /> Config file
              </button>
              <button className="btn" type="button" onClick={() => void getBridge()?.openLogs()}>
                <ExternalIcon /> Logs
              </button>
            </div>
            <div className="field__hint" style={{ marginTop: 10 }}>
              {appInfo.pricingNote}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
