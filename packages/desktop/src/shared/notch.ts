import type { UsageSnapshot, WidgetConfig } from '@claude-widget/core';
import { shownWindow, toneOf, type Tone } from './limits';
import { projectedFullAt } from './pace';

/**
 * What main sends the macOS notch-line helper (native/notch), one JSON line
 * per change. The line's length is the 5-hour %, its tone the same one the
 * pill and popover use, drawn in the colour the user picked for that tone; a
 * null `fiveHour` hides it.
 */
export interface NotchPayload {
  fiveHour: { pct: number; estimated: boolean; tone: Tone; resetsAt: number | null } | null;
  weekly: { pct: number; estimated: boolean } | null;
  /** When the 5-hour limit fills at the current pace, to the minute; null if it won't. */
  fullAt: number | null;
  /** Hovering the notch shows the card. False: the helper takes no mouse input. */
  card: boolean;
  /** `#rrggbb` for each tone, from Settings. */
  colors: NotchColors;
}

export type NotchColors = WidgetConfig['notchColors'];

/** The settings the payload carries; the whole config fits. */
export type NotchPrefs = Pick<WidgetConfig, 'notchCard' | 'notchColors'>;

/**
 * Orange, amber, red: core's defaults, repeated here because the renderer
 * imports this file and must not pull in core's runtime.
 */
export const DEFAULT_NOTCH_COLORS: NotchColors = { ok: '#ff6b1f', warn: '#ffb224', bad: '#ff453a' };

const DEFAULT_PREFS: NotchPrefs = { notchCard: true, notchColors: DEFAULT_NOTCH_COLORS };

const MINUTE = 60_000;

/** Whole percent, clamped: what every other surface shows. */
function pctOf(utilization: number): number {
  return Math.round(Math.max(0, Math.min(1, utilization)) * 100);
}

/**
 * The helper's view of a snapshot. Uses the live estimate where there is one,
 * as the menu bar does. Everything is rounded (whole %, whole minutes) so a
 * new snapshot that changes nothing visible produces an identical payload and
 * is never sent.
 */
export function notchPayload(
  snapshot: UsageSnapshot,
  now: number,
  prefs: NotchPrefs = DEFAULT_PREFS,
): NotchPayload {
  const official = snapshot.official;
  const card = prefs.notchCard;
  const colors = { ...prefs.notchColors };
  const none: NotchPayload = { fiveHour: null, weekly: null, fullAt: null, card, colors };
  if (!official.available) return none;
  const fiveRaw = official.windows.find((w) => w.key === 'five_hour');
  if (!fiveRaw) return none;
  const five = shownWindow(fiveRaw);
  const weekRaw = official.windows.find((w) => w.key === 'seven_day');
  const week = weekRaw ? shownWindow(weekRaw) : null;
  const atLimit = five.utilization >= 1;
  const full = atLimit ? null : projectedFullAt(five, now);
  return {
    fiveHour: {
      pct: pctOf(five.utilization),
      estimated: five.estimated,
      tone: toneOf(five.utilization),
      resetsAt: five.resetsAt,
    },
    weekly: week ? { pct: pctOf(week.utilization), estimated: week.estimated } : null,
    fullAt: full === null ? null : Math.round(full / MINUTE) * MINUTE,
    card,
    colors,
  };
}
