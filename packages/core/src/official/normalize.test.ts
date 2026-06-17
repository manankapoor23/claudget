import { describe, expect, it } from 'vitest';
import { normalizeOfficialPayload } from './normalize';

const NOW = Date.parse('2026-06-17T12:00:00.000Z');

describe('normalizeOfficialPayload', () => {
  it('maps keyed windows with fractional utilisation and ISO reset', () => {
    const ws = normalizeOfficialPayload(
      {
        five_hour: { utilization: 0.5, resets_at: '2026-06-17T15:00:00.000Z' },
        seven_day: { utilization: 0.2, resets_at: '2026-06-20T00:00:00.000Z' },
      },
      NOW,
    );
    expect(ws.length).toBe(2);
    const five = ws.find((w) => w.key === 'five_hour');
    expect(five?.usedPct).toBeCloseTo(50);
    expect(five?.remainingPct).toBeCloseTo(50);
    expect(five?.resetsAt).toBe(Date.parse('2026-06-17T15:00:00.000Z'));
    // five_hour should sort before seven_day
    expect(ws[0]?.key).toBe('five_hour');
  });

  it('treats utilisation > 1 as a percentage', () => {
    const ws = normalizeOfficialPayload({ weekly: { utilization: 73 } }, NOW);
    expect(ws[0]?.usedPct).toBeCloseTo(73);
  });

  it('derives utilisation from used/limit', () => {
    const ws = normalizeOfficialPayload({ session: { used: 50, limit: 200 } }, NOW);
    expect(ws[0]?.usedPct).toBeCloseTo(25);
  });

  it('handles seconds-until-reset', () => {
    const ws = normalizeOfficialPayload(
      { five_hour: { utilization: 0.1, resets_in_seconds: 3600 } },
      NOW,
    );
    expect(ws[0]?.resetsAt).toBe(NOW + 3_600_000);
  });

  it('parses an array shape', () => {
    const ws = normalizeOfficialPayload({ limits: [{ type: 'five_hour', utilization: 0.1 }] }, NOW);
    expect(ws[0]?.key).toBe('five_hour');
  });

  it('returns empty for unrecognised payloads', () => {
    expect(normalizeOfficialPayload({ foo: 'bar' }, NOW)).toEqual([]);
    expect(normalizeOfficialPayload(null, NOW)).toEqual([]);
    expect(normalizeOfficialPayload(42, NOW)).toEqual([]);
  });
});
