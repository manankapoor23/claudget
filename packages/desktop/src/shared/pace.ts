import type { OfficialWindow } from '@claude-widget/core';

/** Known plan-window lengths, used to turn "resets at" into "% elapsed". */
const WINDOW_MS: Record<string, number> = {
  five_hour: 5 * 60 * 60 * 1000,
  seven_day: 7 * 24 * 60 * 60 * 1000,
};

export interface Pace {
  tone: 'ok' | 'warn' | 'bad';
  head: string;
  /** 0..100 share of the window that has already elapsed. */
  elapsedPct: number;
}

/**
 * On-track / ahead / burning vs the window: compares how much you've used
 * against how much of the window has elapsed. Null when the window's length or
 * reset time is unknown.
 */
export function paceFor(w: OfficialWindow, now: number): Pace | null {
  const len = WINDOW_MS[w.key];
  if (len == null || w.resetsAt == null) return null;
  const elapsedPct = Math.max(0, Math.min(100, ((len - (w.resetsAt - now)) / len) * 100));
  const diff = w.usedPct - elapsedPct;
  if (diff > 15) return { tone: 'bad', head: 'Burning fast', elapsedPct };
  if (diff > 5) return { tone: 'warn', head: 'Ahead of pace', elapsedPct };
  return { tone: 'ok', head: 'On track', elapsedPct };
}

/**
 * When the window fills at the current average rate, or null if it won't
 * before it resets (or there's too little history to say). The rate is the
 * share used so far over the time elapsed so far — simple, and honest about
 * what it is: a straight-line projection, not a forecast.
 */
export function projectedFullAt(w: OfficialWindow, now: number): number | null {
  const len = WINDOW_MS[w.key];
  if (len == null || w.resetsAt == null || w.utilization <= 0) return null;
  if (w.utilization >= 1) return now;
  const elapsed = len - (w.resetsAt - now);
  // Under ~5% of the window elapsed, the rate is too noisy to project from.
  if (elapsed < len * 0.05) return null;
  const perMs = w.utilization / elapsed;
  const fullAt = now + (1 - w.utilization) / perMs;
  return fullAt < w.resetsAt ? fullAt : null;
}
