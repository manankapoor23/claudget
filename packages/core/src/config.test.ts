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

describe('OpenCode usage setting', () => {
  it('is opt-in by default and can be enabled in persisted config', () => {
    expect(DEFAULT_CONFIG.enableOpenCode).toBe(false);
    expect(resolveConfig({ enableOpenCode: true }).enableOpenCode).toBe(true);
    expect(mergeConfig(DEFAULT_CONFIG, { enableOpenCode: true }).enableOpenCode).toBe(true);
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

describe('mergeConfig', () => {
  it('applies a valid patch', () => {
    expect(mergeConfig(DEFAULT_CONFIG, { compact: true }).compact).toBe(true);
  });
  it('ignores an invalid patch', () => {
    expect(mergeConfig(DEFAULT_CONFIG, { opacity: 99 }).opacity).toBe(DEFAULT_CONFIG.opacity);
  });
});
