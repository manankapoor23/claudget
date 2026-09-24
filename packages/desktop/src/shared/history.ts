import type { OfficialWindow } from '@claude-widget/core';
import { isDormant, limitLabel } from './limits';

/** One plan-limit window's run, from first sight until it resets. */
export interface LimitCycle {
  /** Window key, e.g. `five_hour`, `seven_day`. */
  key: string;
  label: string;
  /** When this cycle resets (epoch ms) — identifies the cycle. */
  resetsAt: number;
  /** Highest utilisation seen, 0..1. */
  peak: number;
  /** When it first reached 100%, if it did. */
  hitAt: number | null;
  firstSeenAt: number;
  lastSeenAt: number;
}

export interface LimitHistory {
  version: 1;
  cycles: LimitCycle[];
}

export const EMPTY_HISTORY: LimitHistory = { version: 1, cycles: [] };

/** Reset times jitter by seconds between polls; within this they're the same cycle. */
const SAME_CYCLE_MS = 5 * 60 * 1000;
/** How long each kind of cycle is kept. */
const KEEP_MS: Record<string, number> = { five_hour: 14 * 24 * 3600_000 };
const DEFAULT_KEEP_MS = 120 * 24 * 3600_000;

function keepFor(key: string): number {
  return KEEP_MS[key] ?? DEFAULT_KEEP_MS;
}

/**
 * Folds one poll's windows into the history: raises the matching cycle's peak
 * (and notes the first time it hit 100%), or starts a new cycle. Pure — returns
 * the same object when nothing changed, so callers can skip the write.
 */
export function recordWindows(
  history: LimitHistory,
  windows: OfficialWindow[],
  now: number,
): LimitHistory {
  let cycles = history.cycles;
  let changed = false;

  for (const w of windows) {
    if (w.resetsAt === null || isDormant(w)) continue;
    const u = Math.max(0, Math.min(1, w.utilization));
    const i = cycles.findIndex(
      (c) => c.key === w.key && Math.abs(c.resetsAt - (w.resetsAt ?? 0)) < SAME_CYCLE_MS,
    );
    if (i === -1) {
      cycles = [
        ...cycles,
        {
          key: w.key,
          label: limitLabel(w.label),
          resetsAt: w.resetsAt,
          peak: u,
          hitAt: u >= 1 ? now : null,
          firstSeenAt: now,
          lastSeenAt: now,
        },
      ];
      changed = true;
      continue;
    }
    const c = cycles[i]!;
    const peak = Math.max(c.peak, u);
    const hitAt = c.hitAt ?? (u >= 1 ? now : null);
    if (peak !== c.peak || hitAt !== c.hitAt || now - c.lastSeenAt > 60_000) {
      cycles = cycles.map((x, j) => (j === i ? { ...c, peak, hitAt, lastSeenAt: now } : x));
      changed = true;
    }
  }

  const kept = cycles.filter((c) => now - c.resetsAt < keepFor(c.key));
  if (kept.length !== cycles.length) {
    cycles = kept;
    changed = true;
  }
  return changed ? { version: 1, cycles } : history;
}

/** Cycles for one window key, oldest first. */
export function cyclesFor(history: LimitHistory, key: string): LimitCycle[] {
  return history.cycles.filter((c) => c.key === key).sort((a, b) => a.resetsAt - b.resetsAt);
}

/** Accepts only a well-formed history (from disk or IPC); anything else → empty. */
export function parseHistory(input: unknown): LimitHistory {
  if (typeof input !== 'object' || input === null) return EMPTY_HISTORY;
  const raw = (input as { cycles?: unknown }).cycles;
  if (!Array.isArray(raw)) return EMPTY_HISTORY;
  const cycles = raw.filter(
    (c): c is LimitCycle =>
      typeof c === 'object' &&
      c !== null &&
      typeof (c as LimitCycle).key === 'string' &&
      typeof (c as LimitCycle).resetsAt === 'number' &&
      typeof (c as LimitCycle).peak === 'number',
  );
  return { version: 1, cycles };
}
