import type { JSX } from 'react';
import type { LocalUsage } from '@claude-widget/core';
import { formatUSD } from '../lib/format';

interface ForecastProps {
  local: LocalUsage;
  currency: string;
}

/**
 * "At this rate" projections: spend by the current block reset (already computed
 * in the active block) and a month projection = month-to-date scaled by
 * (days in month / days elapsed). Renders nothing if there's no signal yet.
 */
export function Forecast({ local, currency }: ForecastProps): JSX.Element | null {
  const block = local.activeBlock;
  const monthSoFar = local.thisMonth.costUSD;

  const now = new Date();
  const daysElapsed = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const projectedMonth = daysElapsed > 0 ? (monthSoFar / daysElapsed) * daysInMonth : 0;

  if (!block && monthSoFar <= 0) return null;

  return (
    <div className="panel">
      <div className="panel__head">
        <span className="panel__title">At this rate</span>
      </div>
      {block ? (
        <div className="kv">
          <span>By block reset</span>
          <b>{formatUSD(block.projectedCostUSD, currency)}</b>
        </div>
      ) : null}
      <div className="kv">
        <span>This month (projected)</span>
        <b>{formatUSD(projectedMonth, currency)}</b>
      </div>
      <div className="kv">
        <span>Month so far</span>
        <b>{formatUSD(monthSoFar, currency)}</b>
      </div>
    </div>
  );
}
