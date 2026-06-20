import type { JSX } from 'react';
import type { LocalUsage } from '@claude-widget/core';
import { formatUSD, formatPct } from '../lib/format';
import { ProgressBar } from './ProgressBar';

interface BudgetPanelProps {
  local: LocalUsage;
  dailyBudgetUSD: number | null;
  monthlyBudgetUSD: number | null;
  currency: string;
}

interface Row {
  label: string;
  spent: number;
  budget: number;
}

/** Visible spend-vs-budget bars. Renders only the budgets actually configured. */
export function BudgetPanel({
  local,
  dailyBudgetUSD,
  monthlyBudgetUSD,
  currency,
}: BudgetPanelProps): JSX.Element | null {
  const rows: Row[] = [];
  if (dailyBudgetUSD && dailyBudgetUSD > 0) {
    rows.push({ label: 'Today', spent: local.today.costUSD, budget: dailyBudgetUSD });
  }
  if (monthlyBudgetUSD && monthlyBudgetUSD > 0) {
    rows.push({ label: 'This month', spent: local.thisMonth.costUSD, budget: monthlyBudgetUSD });
  }
  if (rows.length === 0) return null;

  return (
    <div className="panel">
      <div className="panel__head">
        <span className="panel__title">Budget</span>
      </div>
      {rows.map((r) => {
        const frac = r.budget > 0 ? r.spent / r.budget : 0;
        const tone = frac >= 1 ? 'bad' : frac >= 0.8 ? 'warn' : 'good';
        return (
          <div key={r.label} style={{ marginTop: 8 }}>
            <ProgressBar
              value={frac}
              tone={tone}
              left={r.label}
              right={`${formatUSD(r.spent, currency)} / ${formatUSD(r.budget, currency)}`}
              metaRight={formatPct(Math.min(frac, 1) * 100)}
            />
          </div>
        );
      })}
    </div>
  );
}
