import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, mergeConfig, resolveConfig } from './config';

describe('resolveConfig', () => {
  it('returns defaults for empty/undefined input', () => {
    expect(resolveConfig({})).toEqual(DEFAULT_CONFIG);
    expect(resolveConfig(undefined).enableOfficial).toBe(true);
  });

  it('keeps valid fields and falls back per-field on invalid ones', () => {
    const c = resolveConfig({
      theme: 'dark',
      officialPollIntervalMs: 5, // below the 180s floor → invalid
      compact: 'nope', // wrong type → invalid
    });
    expect(c.theme).toBe('dark');
    expect(c.officialPollIntervalMs).toBe(DEFAULT_CONFIG.officialPollIntervalMs);
    expect(c.compact).toBe(DEFAULT_CONFIG.compact);
  });
});

describe('mergeConfig', () => {
  it('applies a valid patch', () => {
    expect(mergeConfig(DEFAULT_CONFIG, { compact: true }).compact).toBe(true);
  });
  it('ignores an invalid patch', () => {
    expect(mergeConfig(DEFAULT_CONFIG, { opacity: 99 }).opacity).toBe(DEFAULT_CONFIG.opacity);
  });
});
