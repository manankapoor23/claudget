import { describe, expect, it } from 'vitest';
import {
  freshnessLine,
  limitLabel,
  pctSpoken,
  pctText,
  pillWindow,
  rankLimits,
  shownWindow,
  shownWindows,
  toneOf,
  trayTitle,
  verdictFor,
} from './limits';
import { H, NOW, win } from './test-helpers';

describe('limitLabel', () => {
  it('lower-cases what follows a hyphen and capitalises the first letter', () => {
    expect(limitLabel('5-Hour')).toBe('5-hour');
    expect(limitLabel('weekly')).toBe('Weekly');
    expect(limitLabel('Weekly · Opus')).toBe('Weekly · Opus');
  });
});

describe('toneOf', () => {
  it('is ok under 70%, warn from 70%, bad from 90%', () => {
    expect(toneOf(0.69)).toBe('ok');
    expect(toneOf(0.7)).toBe('warn');
    expect(toneOf(0.9)).toBe('bad');
  });
});

describe('rankLimits', () => {
  it('leads with the most-used live limit, not the first one listed', () => {
    const view = rankLimits([win('five_hour', 0.08, 4 * H), win('seven_day', 0.99, 18 * H)]);
    expect(view?.primary.key).toBe('seven_day');
    expect(view?.others.map((w) => w.key)).toEqual(['five_hour']);
  });
  it('sets untouched limits with no reset aside as dormant', () => {
    const view = rankLimits([win('five_hour', 0.2, 3 * H), win('nq', 0, null, 'Nimbus Quill')]);
    expect(view?.dormant.map((w) => w.key)).toEqual(['nq']);
    expect(view?.others).toEqual([]);
  });
  it('returns null when there are no windows', () => {
    expect(rankLimits([])).toBeNull();
  });
});

describe('shownWindow', () => {
  it('shows the official reading as is when there is no estimate', () => {
    const w = shownWindow(win('five_hour', 0.62, 3 * H));
    expect(w.utilization).toBe(0.62);
    expect(w.estimated).toBe(false);
    expect(pctText(w)).toBe('62%');
    expect(pctSpoken(w)).toBe('62 percent used');
  });
  it('shows the estimate, marked, in place of the reading', () => {
    const w = shownWindow({
      ...win('five_hour', 0.62, 3 * H),
      estimate: { utilization: 0.634, usedPct: 63.4, basisAt: NOW - 60_000, afterReset: false },
    });
    expect(w.utilization).toBeCloseTo(0.634);
    expect(w.remainingPct).toBeCloseTo(36.6);
    expect(w.estimated).toBe(true);
    expect(pctText(w)).toBe('~63%');
    expect(pctSpoken(w)).toBe('about 63 percent used, estimated');
  });
});

describe('trayTitle', () => {
  it('reads both limits in the API order, marking only the estimated one', () => {
    const windows = shownWindows([
      {
        ...win('five_hour', 0.62, 3 * H),
        estimate: { utilization: 0.634, usedPct: 63.4, basisAt: NOW, afterReset: false },
      },
      win('seven_day', 0.31, 50 * H),
    ]);
    expect(trayTitle(windows)).toBe('~63% · 31%');
  });
  it('is plain when nothing is estimated, and empty with no limits', () => {
    expect(trayTitle(shownWindows([win('five_hour', 0.62, H), win('seven_day', 0.31, H)]))).toBe(
      '62% · 31%',
    );
    expect(trayTitle([])).toBe('');
  });
});

describe('freshnessLine', () => {
  it('says how old the reading is, and that the number is estimated when it is', () => {
    expect(freshnessLine(false, '14:32')).toBe('As of 14:32');
    expect(freshnessLine(true, '14:32')).toBe('Estimated from live usage · last checked 14:32');
  });
});

describe('pillWindow', () => {
  const five = win('five_hour', 0.2, 3 * H);
  const week = win('seven_day', 0.7, 50 * H);
  it('shows the 5-hour limit by default choice, even when weekly is higher', () => {
    expect(pillWindow([five, week], 'fiveHour')?.key).toBe('five_hour');
  });
  it('shows the weekly limit when chosen', () => {
    expect(pillWindow([five, week], 'weekly')?.key).toBe('seven_day');
  });
  it('shows whichever is higher when chosen (the old behaviour)', () => {
    expect(pillWindow([five, week], 'highest')?.key).toBe('seven_day');
    expect(pillWindow([win('five_hour', 0.9, H), week], 'highest')?.key).toBe('five_hour');
  });
  it('still shows the chosen limit when it is untouched (0%)', () => {
    const idle = win('five_hour', 0, null);
    expect(pillWindow([idle, week], 'fiveHour')?.key).toBe('five_hour');
  });
  it('falls back to the most-used limit when the chosen one is not reported', () => {
    expect(pillWindow([week], 'fiveHour')?.key).toBe('seven_day');
    expect(pillWindow([five], 'weekly')?.key).toBe('five_hour');
  });
  it('is null with no limits (plan limits off or unavailable)', () => {
    expect(pillWindow([], 'fiveHour')).toBeNull();
    expect(pillWindow([], 'highest')).toBeNull();
  });
  it('ranks by the estimate when there is one', () => {
    const live = shownWindows([
      { ...five, estimate: { utilization: 0.75, usedPct: 75, basisAt: NOW, afterReset: false } },
      week,
    ]);
    expect(pillWindow(live, 'highest')?.key).toBe('five_hour');
  });
});

describe('verdictFor', () => {
  it('calls out the binding limit when it is nearly gone', () => {
    const view = rankLimits([win('five_hour', 0.13, 4.5 * H), win('seven_day', 0.99, 18 * H)])!;
    const v = verdictFor(view, NOW);
    expect(v.tone).toBe('bad');
    expect(v.headline).toBe('Weekly limit almost gone');
    expect(v.detail).toMatch(/^1% left · resets in 18h/);
  });
  it("says you're good when every limit is comfortable and on pace", () => {
    // 5-hour: 3.5h left → 30% elapsed, 20% used — behind the clock.
    const view = rankLimits([win('five_hour', 0.2, 3.5 * H), win('seven_day', 0.1, 6 * 24 * H)])!;
    expect(verdictFor(view, NOW)).toMatchObject({ tone: 'ok', headline: "You're good" });
  });
  it('warns when a window is filling much faster than its clock', () => {
    // 5-hour: 4.5h left → 10% elapsed, but 50% used.
    const view = rankLimits([win('five_hour', 0.5, 4.5 * H)])!;
    expect(verdictFor(view, NOW)).toMatchObject({ tone: 'warn', headline: 'Slow down a little' });
  });
  it('reports a limit that is already reached', () => {
    const view = rankLimits([win('seven_day', 1, 2 * H)])!;
    expect(verdictFor(view, NOW)).toMatchObject({ tone: 'bad', headline: 'Weekly limit reached' });
  });
  it('never says a limit is reached on an estimate alone', () => {
    const live = shownWindows([
      {
        ...win('five_hour', 0.97, H),
        estimate: { utilization: 1, usedPct: 100, basisAt: NOW, afterReset: false },
      },
    ]);
    expect(verdictFor(rankLimits(live)!, NOW).headline).toBe('5-hour limit almost gone');
  });
});
