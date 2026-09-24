import { describe, expect, it } from 'vitest';
import { limitLabel, rankLimits, toneOf, verdictFor } from './limits';
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
});
