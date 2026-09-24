import type { OfficialWindow } from '@claude-widget/core';

export const H = 3_600_000;
export const NOW = Date.UTC(2026, 8, 24, 12, 0, 0);

/** A plan-limit window as the official endpoint would report it. */
export function win(
  key: string,
  utilization: number,
  resetsInMs: number | null,
  label = key === 'five_hour' ? '5-Hour' : key === 'seven_day' ? 'Weekly' : key,
): OfficialWindow {
  return {
    key,
    label,
    utilization,
    usedPct: utilization * 100,
    remainingPct: 100 - utilization * 100,
    resetsAt: resetsInMs === null ? null : NOW + resetsInMs,
    used: null,
    limit: null,
  };
}
