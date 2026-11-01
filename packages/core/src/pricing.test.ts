import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PRICING,
  estimateCost,
  lookupPricing,
  modelLabel,
  normalizeModelId,
  promptCost,
} from './pricing';

describe('normalizeModelId', () => {
  it('strips prefix, 1m suffix and date stamp', () => {
    expect(normalizeModelId('claude-opus-4-8[1m]')).toBe('opus-4-8');
    expect(normalizeModelId('claude-haiku-4-5-20251001')).toBe('haiku-4-5');
    expect(normalizeModelId('claude-sonnet-4-6')).toBe('sonnet-4-6');
  });
});

describe('modelLabel', () => {
  it('produces friendly labels', () => {
    expect(modelLabel('claude-opus-4-8')).toBe('Opus 4.8');
    expect(modelLabel('claude-sonnet-4-6')).toBe('Sonnet 4.6');
    expect(modelLabel('claude-fable-5')).toBe('Fable 5');
    expect(modelLabel('claude-opus-5')).toBe('Opus 5');
    expect(modelLabel('claude-opus-5-5')).toBe('Opus 5.5');
    expect(modelLabel('claude-opus-4-20250514')).toBe('Opus 4');
    expect(modelLabel('claude-opus-4-1-20250805')).toBe('Opus 4.1');
    expect(modelLabel('claude-fable-5-1[1m]')).toBe('Fable 5.1');
  });
});

describe('lookupPricing', () => {
  const price = (model: string) => {
    const p = lookupPricing(model, DEFAULT_PRICING);
    return p && [p.input, p.output, p.cacheRead];
  };

  it('prices each model version at its own list price', () => {
    expect(price('claude-opus-4-1-20250805')).toEqual([15, 75, 1.5]);
    expect(price('claude-opus-4-20250514')).toEqual([15, 75, 1.5]);
    expect(price('claude-opus-4-5')).toEqual([5, 25, 0.5]);
    expect(price('claude-opus-4-8[1m]')).toEqual([5, 25, 0.5]);
    expect(price('claude-opus-5')).toEqual([5, 25, 0.5]);
    expect(price('claude-opus-5-5')).toEqual([4, 20, 0.2]);
    expect(price('claude-sonnet-4-6')).toEqual([3, 15, 0.3]);
    expect(price('claude-sonnet-5-5')).toEqual([2, 10, 0.2]);
    expect(price('claude-haiku-4-5-20251001')).toEqual([1, 5, 0.1]);
    expect(price('claude-fable-5')).toEqual([10, 50, 1]);
    expect(price('claude-fable-5-1')).toEqual([10, 50, 0.25]);
  });

  it('prices cache writes at 1.25× input for 5 minutes and 2× for an hour', () => {
    const p = lookupPricing('claude-opus-4-8', DEFAULT_PRICING)!;
    expect([p.cacheWrite5m, p.cacheWrite1h]).toEqual([6.25, 10]);
  });

  it("falls back to the family's newest model for a version it doesn't list", () => {
    expect(lookupPricing('claude-opus-6', DEFAULT_PRICING)).toEqual(DEFAULT_PRICING['opus-5-5']);
    expect(lookupPricing('claude-sonnet-9', DEFAULT_PRICING)).toEqual(
      DEFAULT_PRICING['sonnet-5-5'],
    );
  });
  it('returns null for unknown families', () => {
    expect(lookupPricing('gpt-4o', DEFAULT_PRICING)).toBeNull();
  });
});

describe('estimateCost', () => {
  it('prices a million input tokens at the sonnet rate', () => {
    const r = estimateCost(
      { input: 1_000_000, output: 0, cacheCreation: 0, cacheRead: 0, total: 1_000_000 },
      'claude-sonnet-4-6',
      DEFAULT_PRICING,
    );
    expect(r.priced).toBe(true);
    expect(r.costUSD).toBeCloseTo(3, 6);
  });

  it('prices 1-hour cache writes at their own rate', () => {
    const tokens = {
      input: 0,
      output: 0,
      cacheCreation: 3_000_000,
      cacheCreation1h: 1_000_000,
      cacheRead: 0,
      total: 3_000_000,
    };
    // Opus 4.8: $6.25 per million for 5-minute writes, $10 for 1-hour ones.
    expect(estimateCost(tokens, 'claude-opus-4-8').costUSD).toBeCloseTo(2 * 6.25 + 10, 6);
    expect(promptCost(tokens, 'claude-opus-4-8')?.actualUSD).toBeCloseTo(2 * 6.25 + 10, 6);
  });

  it('reports unpriced for unknown models', () => {
    const r = estimateCost(
      { input: 100, output: 0, cacheCreation: 0, cacheRead: 0, total: 100 },
      'some-other-model',
      DEFAULT_PRICING,
    );
    expect(r.priced).toBe(false);
    expect(r.costUSD).toBe(0);
  });
});

describe('promptCost', () => {
  const tokens = (input: number, cacheCreation: number, cacheRead: number, output = 0) => ({
    input,
    output,
    cacheCreation,
    cacheRead,
    total: input + output + cacheCreation + cacheRead,
  });

  it('prices the prompt as billed, and as if every token were fresh input', () => {
    // Sonnet: $3 input, $3.75 cache write, $0.30 cache read per million.
    const p = promptCost(tokens(1_000_000, 1_000_000, 10_000_000), 'claude-sonnet-4-6');
    expect(p?.actualUSD).toBeCloseTo(3 + 3.75 + 3, 6);
    expect(p?.uncachedUSD).toBeCloseTo(12 * 3, 6);
  });

  it('leaves output out: it costs the same either way', () => {
    const a = promptCost(tokens(1000, 0, 0), 'claude-opus-4-8');
    const b = promptCost(tokens(1000, 0, 0, 5_000_000), 'claude-opus-4-8');
    expect(b).toEqual(a);
  });

  it('is null for a model with no price', () => {
    expect(promptCost(tokens(1000, 0, 0), 'gpt-9')).toBeNull();
  });
});
