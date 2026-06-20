import type { JSX } from 'react';
import type { LocalUsage } from '@claude-widget/core';
import { formatUSD, formatPct } from '../lib/format';

interface InsightsProps {
  local: LocalUsage;
  currency: string;
}

function basename(p: string): string {
  const parts = p.split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] ?? p;
}

function hourRange(ts: number): string {
  const h = new Date(ts).getHours();
  const fmt = (x: number): string => `${((x + 11) % 12) + 1}${x < 12 ? 'am' : 'pm'}`;
  return `${fmt(h)}–${fmt((h + 1) % 24)}`;
}

/** Lightweight analytics: where the spend goes, the model mix, the busy hour. */
export function Insights({ local, currency }: InsightsProps): JSX.Element | null {
  const top = local.perProject[0];
  const totalCost = local.perModel.reduce((s, m) => s + m.costUSD, 0);
  const models = local.perModel.slice(0, 2);

  let peak: (typeof local.hourly)[number] | null = null;
  for (const b of local.hourly) {
    if (!peak || b.tokens.total > peak.tokens.total) peak = b;
  }

  if (!top && models.length === 0) return null;

  return (
    <div className="panel">
      <div className="panel__head">
        <span className="panel__title">Insights</span>
      </div>
      {top ? (
        <div className="kv">
          <span>Top project</span>
          <b>
            {basename(top.projectPath)} · {formatUSD(top.costUSD, currency)}
          </b>
        </div>
      ) : null}
      {models.length > 0 && totalCost > 0 ? (
        <div className="kv">
          <span>Models</span>
          <b>{models.map((m) => `${m.label} ${formatPct((m.costUSD / totalCost) * 100)}`).join(' · ')}</b>
        </div>
      ) : null}
      {peak && peak.tokens.total > 0 ? (
        <div className="kv">
          <span>Busiest hour</span>
          <b>{hourRange(peak.startAt)}</b>
        </div>
      ) : null}
    </div>
  );
}
