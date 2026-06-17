import type { JSX } from 'react';
import type { UsageSnapshot } from '@claude-widget/core';
import { formatCompact, formatUSD } from '../lib/format';
import { RadialGauge } from './RadialGauge';
import { Countdown } from './Countdown';
import { StatCard } from './StatCard';

interface CompactViewProps {
  snapshot: UsageSnapshot;
  currency: string;
}

/** Minimal layout for compact mode: headline limits + live burn. */
export function CompactView({ snapshot, currency }: CompactViewProps): JSX.Element {
  const { official, local } = snapshot;
  const block = local.activeBlock;
  const showGauges = official.available && official.windows.length > 0;

  return (
    <div className="body">
      {showGauges ? (
        <div className="gauges">
          {official.windows.slice(0, 2).map((w) => (
            <RadialGauge
              key={w.key}
              value={w.utilization}
              size={72}
              label={w.label}
              sub={<Countdown resetsAt={w.resetsAt} prefix="" fallback="—" />}
            />
          ))}
        </div>
      ) : (
        <div className="stat-grid">
          <StatCard
            label="Today"
            value={formatCompact(local.today.tokens.total)}
            sub={formatUSD(local.today.costUSD, currency)}
          />
          <StatCard
            label="Last 24h"
            value={formatCompact(local.last24h.tokens.total)}
            sub={formatUSD(local.last24h.costUSD, currency)}
          />
        </div>
      )}

      {block ? (
        <div className="kv">
          <span>Block · {formatCompact(block.tokensPerMinute)}/min</span>
          <b>
            <Countdown resetsAt={block.endAt} prefix="resets in" fallback="—" />
          </b>
        </div>
      ) : showGauges ? (
        <div className="kv">
          <span>Today</span>
          <b>
            {formatCompact(local.today.tokens.total)} · {formatUSD(local.today.costUSD, currency)}
          </b>
        </div>
      ) : null}
    </div>
  );
}
