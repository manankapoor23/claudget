/**
 * One dataset behind every product mock on the page, so the menu bar, the
 * popover, the pill, the bar and the dashboard tell the same story — the way
 * the real app does, since every surface renders one snapshot.
 *
 * The story: Thursday Sep 24, 2:30 PM. The 5-hour window opened at noon, so
 * half of it has passed with 62% used — ahead of pace. The app's projection
 * (packages/desktop/src/shared/pace.ts: the average rate so far, as a straight
 * line) puts it full at 4:01 PM. Numbers are formatted the way the app formats
 * them (renderer/lib/format.ts: "26M", "198k", "4.8M"). Everything is a fixed
 * string, never computed from the clock, so server and client always agree.
 */

export type Tone = "ok" | "warn" | "bad";

/** Same thresholds as the app's `toneOf` (packages/desktop/src/shared/limits.ts). */
export function toneOf(pct: number): Tone {
  if (pct >= 90) return "bad";
  if (pct >= 70) return "warn";
  return "ok";
}

export interface DemoLimit {
  label: string;
  /** Percent used. */
  pct: number;
  /** Percent of the window that has passed — where the pace tick sits. */
  tick: number;
  left: string;
  /** Only when the pace so far would fill it before reset. */
  fullBy: string | null;
}

export const FIVE_HOUR: DemoLimit = {
  label: "5-hour",
  pct: 62,
  tick: 50,
  left: "2h 30m left",
  fullBy: "4:01 PM",
};

/** Resets Sunday 4:30 PM: 74 of 168 hours left. */
export const WEEKLY: DemoLimit = {
  label: "Weekly",
  pct: 31,
  tick: 55.5,
  left: "3d 2h left",
  fullBy: null,
};

export const CLOCK = { time: "2:30 PM", day: "Thu Sep 24", date: "9/24/2026" };

export const TODAY = { tokens: "26M", rate: "198k", requests: "89" };

/**
 * Tokens per hour, in millions, from 3 PM yesterday to the current hour: an
 * afternoon session, a light evening, a quiet night, a morning session, a
 * lunch dip, and the current window running hot. Today's hours sum to 26.1M.
 */
export const HOURLY: number[] = [
  3.1, 4.2, 2.8, 1.5, 0.6, // 3p–7p
  0.9, 1.4, 0.3, 0, // 8p–11p
  0, 0, 0, 0, 0, 0, 0, 0, // 12a–7a
  0.4, 1.8, 3.4, 3.7, // 8a–11a
  1.2, 9.4, 6.2, // 12p, 1p, and 2p so far
];

/** Hour of day for each bar in HOURLY (the first bar is 3 PM). */
export const HOURLY_START = 15;

export const SESSIONS = [
  { name: "claudget", tokens: "18M", share: 1, live: true },
  { name: "atlas", tokens: "4.8M", share: 0.26, live: false },
  { name: "pin2fit", tokens: "2.1M", share: 0.11, live: false },
];

/** Peak of each weekly window, oldest first; `hit` = it cut you off. Windows end on Sundays. */
export const WEEKS = [
  { label: "Aug 23", peak: 48 },
  { label: "Aug 30", peak: 71 },
  { label: "Sep 6", peak: 100, hit: true },
  { label: "Sep 13", peak: 64 },
  { label: "Sep 20", peak: 92 },
  { label: "now", peak: 31, live: true },
];

/** The last 14 five-hour windows. */
export const WINDOWS = [34, 58, 100, 22, 41, 88, 100, 17, 52, 76, 29, 64, 95, 62].map(
  (peak, i, all) => ({ peak, hit: peak >= 100, live: i === all.length - 1 }),
);
