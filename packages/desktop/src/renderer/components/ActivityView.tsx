import { useState, type JSX } from 'react';
import type { LocalUsage } from '@claude-widget/core';
import { formatCompact, formatUSD } from '../lib/format';
import { useCostCopy } from '../lib/billing';
import { BarChart } from './BarChart';
import { sourceLabel } from '../lib/sessions';

export function ActivityView({
  local,
  currency,
}: {
  local: LocalUsage;
  currency: string;
}): JSX.Element {
  const cost = useCostCopy();
  const [metric, setMetric] = useState<'tokens' | 'requests'>('tokens');
  const bars = local.hourly.slice(-24).map((bucket) => ({
    at: bucket.startAt,
    value: metric === 'tokens' ? bucket.tokens.total : bucket.count,
  }));
  const total = metric === 'tokens' ? local.last24h.tokens.total : local.last24h.count;
  // Only worth a panel once at least one transcript says where it ran.
  const sources = local.perSource.some((s) => s.source !== null) ? local.perSource : [];
  const sourceValue = (s: { tokens: { total: number }; count: number }): number =>
    metric === 'tokens' ? s.tokens.total : s.count;
  const sourceTotal = sources.reduce((sum, s) => sum + sourceValue(s), 0);

  return (
    <>
      <div className="view-intro">
        <div>
          <div className="eyebrow">Usage over time</div>
          <h2>Activity</h2>
          <p>
            {cost.included
              ? 'See when your usage spikes and how hard the current block is running.'
              : 'See when your usage spikes and how much the current block is costing.'}
          </p>
        </div>
        <div className="segmented" role="group" aria-label="Activity metric">
          <button
            className={
              metric === 'tokens'
                ? 'segmented__button segmented__button--active'
                : 'segmented__button'
            }
            type="button"
            onClick={() => setMetric('tokens')}
          >
            Tokens
          </button>
          <button
            className={
              metric === 'requests'
                ? 'segmented__button segmented__button--active'
                : 'segmented__button'
            }
            type="button"
            onClick={() => setMetric('requests')}
          >
            Requests
          </button>
        </div>
      </div>
      <div className="panel chart-panel">
        <div className="panel__head">
          <span className="panel__title">Last 24 hours</span>
          <span className="panel__spacer" />
          <span className="chart-total">
            {metric === 'tokens' ? formatCompact(total) + ' tokens' : total + ' requests'}
          </span>
        </div>
        <BarChart
          bars={bars}
          height={120}
          format={(v) => (metric === 'tokens' ? `${formatCompact(v)} tokens` : `${v} requests`)}
          formatScale={(v) => (metric === 'tokens' ? formatCompact(v) : String(v))}
          label={metric === 'tokens' ? 'Tokens per hour' : 'Requests per hour'}
        />
      </div>
      {sources.length > 0 && sourceTotal > 0 ? (
        <div className="panel">
          <div className="panel__head">
            <span className="panel__title">Where you used it</span>
            <span className="panel__spacer" />
            <span className="chart-total">last 30 days</span>
          </div>
          <div className="sources">
            {sources.map((s) => {
              const value = sourceValue(s);
              const share = value / sourceTotal;
              return (
                <div className="source" key={s.source ?? 'unknown'}>
                  <span className="source__name">{sourceLabel(s.source)}</span>
                  <span className="source__bar" aria-hidden="true">
                    <span style={{ width: `${share * 100}%` }} />
                  </span>
                  <span className="source__value">
                    {metric === 'tokens' ? formatCompact(value) : value}
                  </span>
                  <span className="source__share">{Math.round(share * 100)}%</span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
      <div className="stat-grid stat-grid--three">
        <div className="stat stat--accent">
          <span className="stat__label">Today</span>
          <strong className="stat__value">{formatUSD(local.today.costUSD, currency)}</strong>
          <span className="stat__sub">{cost.noun}</span>
        </div>
        <div className="stat">
          <span className="stat__label">This month</span>
          <strong className="stat__value">{formatUSD(local.thisMonth.costUSD, currency)}</strong>
          <span className="stat__sub">month to date</span>
        </div>
        <div className="stat">
          <span className="stat__label">Requests</span>
          <strong className="stat__value">{local.last24h.count}</strong>
          <span className="stat__sub">last 24 hours</span>
        </div>
      </div>
    </>
  );
}
