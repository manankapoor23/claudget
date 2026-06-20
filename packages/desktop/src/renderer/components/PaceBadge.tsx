import type { JSX } from 'react';
import type { UsageSnapshot } from '@claude-widget/core';

interface PaceBadgeProps {
  snapshot: UsageSnapshot;
}

/** Known plan-window lengths, used to turn "resets at" into "% elapsed". */
const WINDOW_MS: Record<string, number> = {
  five_hour: 5 * 60 * 60 * 1000,
  seven_day: 7 * 24 * 60 * 60 * 1000,
};

/**
 * On-track / ahead / behind vs your plan window: compares how much you've used
 * against how much of the window has elapsed. Needs an official window with a
 * known length + reset time; renders nothing otherwise.
 */
export function PaceBadge({ snapshot }: PaceBadgeProps): JSX.Element | null {
  if (!snapshot.official.available) return null;

  const win = snapshot.official.windows.find(
    (w) => w.resetsAt != null && WINDOW_MS[w.key] != null,
  );
  if (!win || win.resetsAt == null) return null;

  const len = WINDOW_MS[win.key];
  if (len == null) return null;
  const remaining = win.resetsAt - snapshot.generatedAt;
  const elapsedPct = Math.max(0, Math.min(100, ((len - remaining) / len) * 100));
  const diff = win.usedPct - elapsedPct;

  let tone: 'ok' | 'warn' | 'bad';
  let head: string;
  let nudge: string;
  if (diff > 15) {
    tone = 'bad';
    head = 'Burning fast';
    nudge = 'ease off — you may hit the limit before reset';
  } else if (diff > 5) {
    tone = 'warn';
    head = 'Ahead of pace';
    nudge = 'a touch faster than the clock';
  } else {
    tone = 'ok';
    head = 'On track';
    nudge = 'plenty left for this window';
  }

  return (
    <div className="panel">
      <div className="panel__head">
        <span className="panel__title">{win.label} pace</span>
        <span className="panel__spacer" />
        <span className={`badge badge--${tone}`}>{head}</span>
      </div>
      <div className="kv">
        <span>{Math.round(win.usedPct)}% used · {Math.round(elapsedPct)}% of window elapsed</span>
      </div>
      <div className="field__hint">{nudge}</div>
    </div>
  );
}
