import type { JSX } from 'react';
import type { LocalUsage, TokenAndCost } from '@claude-widget/core';
import { formatClock, formatCompact, formatUSD } from '../lib/format';
import { StatCard } from './StatCard';
import { ProgressBar } from './ProgressBar';
import { Sparkline } from './Sparkline';
import { Countdown } from './Countdown';

interface LocalPanelProps {
  local: LocalUsage;
  currency: string;
  historyWindowHours: number;
}

function tokensSub(bucket: TokenAndCost, currency: string): string {
  return `${formatUSD(bucket.costUSD, currency)} · ${bucket.count} req`;
}

function ActiveBlock({
  local,
  currency,
}: {
  local: LocalUsage;
  currency: string;
}): JSX.Element | null {
  const block = local.activeBlock;
  if (!block) return null;

  const span = block.elapsedMs + block.remainingMs;
  const progress = span > 0 ? block.elapsedMs / span : 0;

  return (
    <div className="panel">
      <div className="panel__head">
        <span className="panel__title">Current block</span>
        <span className="panel__spacer" />
        <span className="badge">~5h window</span>
      </div>
      <ProgressBar
        value={progress}
        left="Elapsed"
        right={<Countdown resetsAt={block.endAt} prefix="resets in" fallback="—" />}
      />
      <div className="stat-grid" style={{ marginTop: 12 }}>
        <StatCard
          label="Block tokens"
          value={formatCompact(block.tokens.total)}
          sub={formatUSD(block.costUSD, currency)}
        />
        <StatCard
          label="Burn rate"
          value={`${formatCompact(block.tokensPerMinute)}/min`}
          sub={`${block.count} req`}
        />
        <StatCard
          label="Projected"
          value={formatCompact(block.projectedTokens)}
          sub={formatUSD(block.projectedCostUSD, currency)}
        />
        <StatCard
          label="Block start"
          value={formatClock(block.startAt)}
          sub={`${relStart(block.startAt)} ago`}
        />
      </div>
    </div>
  );
}

function relStart(ts: number): string {
  const mins = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  return `${h}h ${mins % 60}m`;
}

export function LocalPanel({ local, currency, historyWindowHours }: LocalPanelProps): JSX.Element {
  const hourly = local.hourly.map((b) => b.tokens.total);
  const maxModel = local.perModel.reduce((m, x) => (x.tokens.total > m ? x.tokens.total : m), 0);
  const topModels = local.perModel.slice(0, 5);

  return (
    <>
      <ActiveBlock local={local} currency={currency} />

      <div className="panel">
        <div className="panel__head">
          <span className="panel__title">Totals</span>
        </div>
        <div className="stat-grid">
          <StatCard
            label="Today"
            value={formatCompact(local.today.tokens.total)}
            sub={tokensSub(local.today, currency)}
          />
          <StatCard
            label="Last 24h"
            value={formatCompact(local.last24h.tokens.total)}
            sub={tokensSub(local.last24h, currency)}
          />
          <StatCard
            label="All time"
            value={formatCompact(local.allTime.tokens.total)}
            sub={tokensSub(local.allTime, currency)}
          />
          <StatCard
            label="Sessions"
            value={formatCompact(local.sessions.length)}
            sub={`${local.activeSessions.length} live`}
          />
        </div>
      </div>

      <div className="panel">
        <div className="panel__head">
          <span className="panel__title">Activity</span>
          <span className="panel__spacer" />
          <span className="badge">last {historyWindowHours}h</span>
        </div>
        <Sparkline values={hourly} />
      </div>

      {topModels.length > 0 ? (
        <div className="panel">
          <div className="panel__head">
            <span className="panel__title">Models</span>
          </div>
          <div className="models">
            {topModels.map((m) => (
              <div
                className="model"
                key={m.model}
                title={`${formatUSD(m.costUSD, currency)} · ${m.count} req`}
              >
                <span className="model__name">{m.label}</span>
                <span className="model__bar">
                  <span
                    style={{ width: `${maxModel > 0 ? (m.tokens.total / maxModel) * 100 : 0}%` }}
                  />
                </span>
                <span className="model__val">{formatCompact(m.tokens.total)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}
