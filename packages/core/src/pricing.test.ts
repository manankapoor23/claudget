import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PRICING,
  estimateCost,
  lookupPricing,
  modelLabel,
  normalizeModelId,
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
    expect(modelLabel('claude-fable-5')).toBe('Fable');
  });
});

describe('lookupPricing', () => {
  it('matches by family for variant ids', () => {
    expect(lookupPricing('claude-opus-4-8[1m]', DEFAULT_PRICING)).toEqual(DEFAULT_PRICING['opus']);
    expect(lookupPricing('claude-haiku-4-5-20251001', DEFAULT_PRICING)).toEqual(
      DEFAULT_PRICING['haiku'],
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
