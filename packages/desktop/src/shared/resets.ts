import type { OfficialWindow } from '@claude-widget/core';
import { formatDurationShort } from './duration';
import { shownWindow } from './limits';
import type { AlertMessage } from './notifications';

const HOUR = 3_600_000;

/** How long before the weekly reset the nudge can come. */
export const NUDGE_WITHIN_MS = 24 * HOUR;
/** ...and only while less than this much of the week is used. */
export const NUDGE_BELOW = 0.5;

/**
 * The weekly window to nudge about now, or null: it resets within a day and
 * less than half of it is used, so there's a good deal left to use before it
 * goes. Uses the live estimate where there is one, like every other surface.
 */
export function weeklyNudge(
  windows: readonly OfficialWindow[],
  now: number,
): OfficialWindow | null {
  const raw = windows.find((w) => w.key === 'seven_day');
  if (!raw || raw.resetsAt === null) return null;
  const w = shownWindow(raw);
  const left = raw.resetsAt - now;
  if (left <= 0 || left > NUDGE_WITHIN_MS) return null;
  return w.utilization < NUDGE_BELOW ? w : null;
}

/** What the nudge says: how much is unused, and when it goes. */
export function nudgeMessage(w: OfficialWindow, now: number, id: string): AlertMessage {
  const unused = Math.max(0, Math.round((1 - w.utilization) * 100));
  const reset = w.resetsAt === null ? '' : ` in ${formatDurationShort(w.resetsAt - now)}`;
  return {
    id: `reset-${id}`,
    title: `${unused}% of your week is unused`,
    body: `Your weekly limit resets${reset}.`,
    sound: false,
    urgent: false,
  };
}

/** Reset times jitter between readings; a new week resets days later. */
const SAME_RESET_MS = 5 * 60_000;
/** A reset noticed later than this (the Mac slept through it) passes quietly. */
export const LATE_MS = HOUR;

/**
 * Notices a new week starting, for the notch line's one-off sweep. It watches
 * the weekly reset time it last saw:
 *
 * - the clock passing it is the week rolling over (celebrated if noticed
 *   within LATE_MS, so a Mac that slept through it doesn't sweep hours late);
 * - a reading with a later reset while the watched one is still ahead is an
 *   early reset (Anthropic resetting limits), also a new week;
 * - a reading with an earlier one just moves the watch.
 *
 * A reset already past when first seen (a stale reading at launch) is never
 * celebrated, and a reading moments after a reset that still carries its
 * time, give or take jitter, isn't watched again.
 */
export class WeekRollover {
  /** The future reset being waited for. */
  private watching: number | null = null;
  /** The last reset that passed, celebrated or not. */
  private passed: number | null = null;
  /** The last reset celebrated: the sweep's id. 0 before any. */
  private swept = 0;

  /** Feeds the weekly reset time (or null) at `now`; returns the sweep id. */
  observe(resetsAt: number | null, now: number): number {
    if (this.watching !== null && now >= this.watching) {
      if (now - this.watching <= LATE_MS) this.swept = this.watching;
      this.passed = this.watching;
      this.watching = null;
    }
    if (resetsAt === null || resetsAt <= now) return this.swept;
    if (this.watching === null) {
      const again = this.passed !== null && Math.abs(resetsAt - this.passed) < SAME_RESET_MS;
      if (!again) this.watching = resetsAt;
    } else if (Math.abs(resetsAt - this.watching) >= SAME_RESET_MS) {
      if (resetsAt > this.watching) {
        this.swept = this.watching;
        this.passed = this.watching;
      }
      this.watching = resetsAt;
    }
    return this.swept;
  }

  /** When the week being watched resets, for a timer; null when none is. */
  get nextAt(): number | null {
    return this.watching;
  }
}
