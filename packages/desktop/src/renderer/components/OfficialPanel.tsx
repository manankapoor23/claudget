import type { JSX } from 'react';
import type { OfficialStatus, OfficialUsage, OfficialWindow } from '@claude-widget/core';
import { formatCompact, formatPct } from '../lib/format';
import { RadialGauge } from './RadialGauge';
import { Countdown } from './Countdown';

interface OfficialPanelProps {
  official: OfficialUsage;
}

const GUIDANCE: Record<OfficialStatus, string> = {
  ok: '',
  disabled:
    'Plan-limit polling is off. Turn it on in Settings to track your 5-hour and weekly limits.',
  'no-credentials':
    'Sign in with the Claude Code CLI (run `claude`) to show your subscription limits here.',
  expired: 'Your Claude Code login expired. Run `claude` once to refresh it, then this updates.',
  unauthorized: 'Anthropic rejected the stored credentials. Run `claude` to sign in again.',
  'rate-limited': 'Anthropic is rate-limiting usage checks. Showing the last known values.',
  'network-error': 'Could not reach Anthropic. Local usage keeps updating in the meantime.',
  'parse-error': 'Anthropic returned an unexpected response. Local usage keeps updating.',
  'never-fetched': 'Fetching your subscription limits…',
};

function Badge({ official }: { official: OfficialUsage }): JSX.Element {
  if (official.status === 'ok' && !official.stale) {
    return <span className="badge badge--ok">Live</span>;
  }
  if (official.stale) return <span className="badge badge--warn">Cached</span>;
  if (official.status === 'disabled') return <span className="badge">Off</span>;
  if (official.status === 'never-fetched') return <span className="badge">…</span>;
  return <span className="badge badge--bad">Unavailable</span>;
}

function gaugeSize(count: number): number {
  if (count >= 3) return 78;
  return 96;
}

function WindowKv({ w }: { w: OfficialWindow }): JSX.Element {
  const usage =
    w.used != null && w.limit != null
      ? `${formatCompact(w.used)} / ${formatCompact(w.limit)} · `
      : '';
  return (
    <div className="kv">
      <span>{w.label}</span>
      <b>
        {usage}
        <Countdown resetsAt={w.resetsAt} prefix="resets in" fallback="no reset" />
      </b>
    </div>
  );
}

export function OfficialPanel({ official }: OfficialPanelProps): JSX.Element {
  const showData = official.available && official.windows.length > 0;
  const size = gaugeSize(official.windows.length);

  return (
    <div className="panel">
      <div className="panel__head">
        <span className="panel__title">Plan usage</span>
        <span className="panel__spacer" />
        <Badge official={official} />
      </div>

      {showData ? (
        <>
          <div className="gauges">
            {official.windows.map((w) => (
              <RadialGauge
                key={w.key}
                value={w.utilization}
                size={size}
                label={w.label}
                sub={`${formatPct(w.remainingPct)} left`}
              />
            ))}
          </div>
          <div style={{ marginTop: 10 }}>
            {official.windows.map((w) => (
              <WindowKv key={w.key} w={w} />
            ))}
          </div>
        </>
      ) : (
        <div className="notice">{official.message ?? GUIDANCE[official.status]}</div>
      )}
    </div>
  );
}
