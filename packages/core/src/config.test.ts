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

describe('window defaults', () => {
  it('keeps the dashboard a normal window and both floating surfaces off', () => {
    expect(DEFAULT_CONFIG.alwaysOnTop).toBe(false);
    expect(DEFAULT_CONFIG.compact).toBe(false);
    expect(DEFAULT_CONFIG.miniBar).toBe(false);
  });
});

describe('limit alert settings', () => {
  it('defaults to alerts on at 80% and 95%', () => {
    expect(DEFAULT_CONFIG.limitAlerts).toBe(true);
    expect(DEFAULT_CONFIG.limitAlertThresholds).toEqual([80, 95]);
  });
  it('rejects out-of-range thresholds without losing the rest of the config', () => {
    const c = resolveConfig({ limitAlertThresholds: [5, 150], theme: 'dark' });
    expect(c.limitAlertThresholds).toEqual([80, 95]);
    expect(c.theme).toBe('dark');
  });
});

describe('pillLimit', () => {
  it('defaults to the 5-hour limit, including for saved configs from before it existed', () => {
    expect(DEFAULT_CONFIG.pillLimit).toBe('fiveHour');
    expect(resolveConfig({ compact: true, theme: 'dark' }).pillLimit).toBe('fiveHour');
  });

  it('keeps a valid choice and falls back on a bad one without losing the rest', () => {
    expect(resolveConfig({ pillLimit: 'weekly' }).pillLimit).toBe('weekly');
    expect(resolveConfig({ pillLimit: 'highest' }).pillLimit).toBe('highest');
    const c = resolveConfig({ pillLimit: 'daily', compact: true });
    expect(c.pillLimit).toBe('fiveHour');
    expect(c.compact).toBe(true);
  });

  it('merges a patch and ignores an invalid one', () => {
    expect(mergeConfig(DEFAULT_CONFIG, { pillLimit: 'weekly' }).pillLimit).toBe('weekly');
    expect(mergeConfig(DEFAULT_CONFIG, { pillLimit: 'nope' }).pillLimit).toBe('fiveHour');
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
