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

/** What WeekRollover remembers between runs. */
export interface RolloverState {
  /** The future weekly reset being waited for. */
  watching: number | null;
  /** The latest reset that has passed. */
  passed: number | null;
  /** The latest reset whose sweep has been shown (or skipped for reduced motion). */
  shown: number | null;
}

export const EMPTY_ROLLOVER: RolloverState = { watching: null, passed: null, shown: null };

/** Accepts only a well-formed saved state; anything else starts empty. */
export function parseRollover(input: unknown): RolloverState {
  const r = input as Partial<Record<keyof RolloverState, unknown>> | null;
  const field = (v: unknown): number | null => (Number.isFinite(v) ? (v as number) : null);
  if (typeof r !== 'object' || r === null) return { ...EMPTY_ROLLOVER };
  return { watching: field(r.watching), passed: field(r.passed), shown: field(r.shown) };
}

/**
 * Notices a new week starting, for the notch line's sweep, and keeps that
 * sweep pending until it has been shown — a week that began while the Mac
 * slept, or while claudget wasn't running, still gets it, the first time
 * the user is there to see it. Saved between runs, so a reset that passed
 * while claudget was quit is noticed at the next launch.
 *
 * - The clock passing the watched reset is the week rolling over.
 * - A reading with a later reset while the watched one is still ahead is an
 *   early reset (Anthropic resetting limits): also a new week.
 * - A reading with an earlier one just moves the watch.
 * - A reset already past when first seen, with nothing watched (a stale
 *   reading on the first run), isn't a rollover claudget saw happen.
 * - A reading moments after a reset that still carries its time, give or
 *   take jitter, isn't watched again.
 */
export class WeekRollover {
  private s: RolloverState;

  constructor(state: RolloverState = EMPTY_ROLLOVER) {
    this.s = { ...state };
  }

  /** Feeds the weekly reset time (or null) at `now`. */
  observe(resetsAt: number | null, now: number): void {
    const s = this.s;
    if (s.watching !== null && now >= s.watching) {
      s.passed = s.watching;
      s.watching = null;
    }
    if (resetsAt === null || resetsAt <= now) return;
    if (s.watching === null) {
      const again = s.passed !== null && Math.abs(resetsAt - s.passed) < SAME_RESET_MS;
      if (!again) s.watching = resetsAt;
    } else if (Math.abs(resetsAt - s.watching) >= SAME_RESET_MS) {
      if (resetsAt > s.watching) s.passed = s.watching;
      s.watching = resetsAt;
    }
  }

  /** The reset whose sweep is still to be shown (its time, epoch ms), or 0. */
  get pending(): number {
    const { passed, shown } = this.s;
    return passed !== null && passed > (shown ?? 0) ? passed : 0;
  }

  /** The helper has shown (or, with reduced motion, skipped) this sweep. */
  markShown(id: number): void {
    if (Number.isFinite(id) && id > 0) this.s.shown = Math.max(this.s.shown ?? 0, id);
  }

  /** When the week being watched resets, for a timer; null when none is. */
  get nextAt(): number | null {
    return this.s.watching;
  }

  /** A copy of what to save. */
  get state(): RolloverState {
    return { ...this.s };
  }
}
