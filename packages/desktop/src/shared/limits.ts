import type { OfficialWindow } from '@claude-widget/core';
import { formatDurationShort } from './duration';
import { paceFor } from './pace';

export type Tone = 'ok' | 'warn' | 'bad';

const RANK: Record<Tone, number> = { ok: 0, warn: 1, bad: 2 };

export function toneOf(fraction: number): Tone {
  if (fraction >= 0.9) return 'bad';
  if (fraction >= 0.7) return 'warn';
  return 'ok';
}

export function worst(a: Tone, b: Tone): Tone {
  return RANK[b] > RANK[a] ? b : a;
}

/**
 * The API's labels arrive as "5-Hour", "Weekly", "Nimbus Quill". Keep the
 * first letter capitalised and lower-case what follows a hyphen, so "5-Hour"
 * reads as "5-hour" next to "Weekly".
 */
export function limitLabel(label: string): string {
  const s = label.trim().replace(/-([A-Z])/g, (_, c: string) => `-${c.toLowerCase()}`);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** A limit that has never been touched and has no reset: nothing to watch. */
export function isDormant(w: OfficialWindow): boolean {
  return w.utilization <= 0 && w.resetsAt === null;
}

export interface LimitsView<T extends OfficialWindow = OfficialWindow> {
  /** The limit that matters most right now — the one closest to cutting you off. */
  primary: T;
  /** Everything else that's live, in the API's order. */
  others: T[];
  /** Untouched limits, shown as a single dim line. */
  dormant: T[];
}

/**
 * Picks the binding constraint. Showing the 5-hour window by default told a
 * user at 99% weekly they were "On track"; the most-consumed limit leads now.
 */
export function rankLimits<T extends OfficialWindow>(windows: T[]): LimitsView<T> | null {
  const live = windows.filter((w) => !isDormant(w));
  const dormant = windows.filter(isDormant);
  const pool = live.length > 0 ? live : windows;
  if (pool.length === 0) return null;
  const primary = pool.reduce((a, b) => (b.utilization > a.utilization ? b : a));
  return {
    primary,
    others: pool.filter((w) => w !== primary),
    dormant: live.length > 0 ? dormant : [],
  };
}

/** A limit as shown: the live estimate in place of the reading, when there is one. */
export interface ShownWindow extends OfficialWindow {
  /** True while the % is estimated from local usage, not yet confirmed by Anthropic. */
  estimated: boolean;
}

/**
 * What to show for a limit: the engine's live estimate where it has one (see
 * core estimate/), else exactly what Anthropic said. Alerts and the limit
 * history keep reading the official windows; this is for display only.
 */
export function shownWindow(w: OfficialWindow): ShownWindow {
  const e = w.estimate;
  if (!e) return { ...w, estimated: false };
  return {
    ...w,
    utilization: e.utilization,
    usedPct: e.usedPct,
    remainingPct: 100 - e.usedPct,
    estimated: true,
  };
}

export function shownWindows(windows: OfficialWindow[]): ShownWindow[] {
  return windows.map(shownWindow);
}

/** "63%", or "~63%" while estimated. */
export function pctText(w: { utilization: number; estimated?: boolean }): string {
  const n = Math.round(Math.max(0, Math.min(1, w.utilization)) * 100);
  return `${w.estimated ? '~' : ''}${n}%`;
}

/** For screen readers: "63 percent used", or "about 63 percent used, estimated". */
export function pctSpoken(w: { utilization: number; estimated?: boolean }): string {
  const n = Math.round(Math.max(0, Math.min(1, w.utilization)) * 100);
  return w.estimated ? `about ${n} percent used, estimated` : `${n} percent used`;
}

/**
 * The menu-bar title: the first two live limits in the API's stable order
 * (5-hour, weekly), each estimated one wearing its own "~": "~63% · 31%".
 */
export function trayTitle(windows: ShownWindow[]): string {
  return windows
    .filter((w) => !isDormant(w))
    .slice(0, 2)
    .map(pctText)
    .join(' · ');
}

/**
 * How fresh the numbers are, for a tooltip: "As of 14:32", or "Estimated from
 * live usage · last checked 14:32". `clock` is the reading's time, formatted.
 */
export function freshnessLine(estimated: boolean, clock: string): string {
  return estimated ? `Estimated from live usage · last checked ${clock}` : `As of ${clock}`;
}

/** Why an estimate can be low: said wherever the "~" is explained. */
export const ESTIMATE_CAVEAT =
  'Usage on other devices or claude.ai shows up at the next check with Anthropic.';

export type PillLimit = 'fiveHour' | 'weekly' | 'highest';

const PILL_KEYS: Record<Exclude<PillLimit, 'highest'>, string> = {
  fiveHour: 'five_hour',
  weekly: 'seven_day',
};

/**
 * The limit the floating pill shows. The chosen one when Anthropic reports
 * it; "highest", or a choice that isn't reported, shows the most-used limit
 * (the old behaviour). Null when there are no limits at all.
 */
export function pillWindow<T extends OfficialWindow>(windows: T[], choice: PillLimit): T | null {
  if (choice !== 'highest') {
    const chosen = windows.find((w) => w.key === PILL_KEYS[choice]);
    if (chosen) return chosen;
  }
  return rankLimits(windows)?.primary ?? null;
}

export interface Verdict {
  tone: Tone;
  /** Plain-language headline: how you're doing, in words. */
  headline: string;
  /** The one fact that backs it up. */
  detail: string;
}

function resetPhrase(w: OfficialWindow, now: number): string {
  return w.resetsAt === null
    ? 'no reset scheduled'
    : `resets in ${formatDurationShort(w.resetsAt - now)}`;
}

/**
 * One verdict across every limit: the worst of "how full is it" and "how fast
 * are you going", phrased the way you'd say it out loud.
 */
export function verdictFor(view: LimitsView, now: number): Verdict {
  const p = view.primary;
  const label = limitLabel(p.label).toLowerCase();
  const left = Math.max(0, Math.round(100 - p.utilization * 100));
  // An estimate can reach 100% but never says the limit is hit: only Anthropic can.
  const estimated = (p as Partial<ShownWindow>).estimated === true;

  if (p.utilization >= 1 && !estimated) {
    return {
      tone: 'bad',
      headline: `${limitLabel(p.label)} limit reached`,
      detail: `Back ${resetPhrase(p, now).replace('resets ', '')}`,
    };
  }
  if (p.utilization >= 0.9) {
    return {
      tone: 'bad',
      headline: `${limitLabel(p.label)} limit almost gone`,
      detail: `${left}% left · ${resetPhrase(p, now)}`,
    };
  }
  if (p.utilization >= 0.7) {
    return {
      tone: 'warn',
      headline: `Getting close on ${label}`,
      detail: `${left}% left · ${resetPhrase(p, now)}`,
    };
  }

  // Nothing is full, so pace decides: are you outrunning any window's clock?
  let fastest: { w: OfficialWindow; tone: Tone } | null = null;
  for (const w of [p, ...view.others]) {
    const pace = paceFor(w, now);
    if (pace && pace.tone !== 'ok' && (!fastest || RANK[pace.tone] > RANK[fastest.tone])) {
      fastest = { w, tone: pace.tone };
    }
  }
  if (fastest) {
    const name = limitLabel(fastest.w.label).toLowerCase();
    return fastest.tone === 'bad'
      ? {
          tone: 'warn',
          headline: 'Slow down a little',
          detail: `On this pace you'll hit the ${name} limit before it resets`,
        }
      : {
          tone: 'ok',
          headline: 'A touch ahead of pace',
          detail: `${name} is filling slightly faster than the clock`,
        };
  }
  return { tone: 'ok', headline: "You're good", detail: 'Plenty left in every limit' };
}
