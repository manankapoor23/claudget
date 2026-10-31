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

describe('notchLine', () => {
  it('is on by default, including for saved configs from before it existed', () => {
    expect(DEFAULT_CONFIG.notchLine).toBe(true);
    expect(resolveConfig({ compact: true, theme: 'dark' }).notchLine).toBe(true);
  });
  it('keeps an explicit off, and repairs a bad value to the default', () => {
    expect(resolveConfig({ notchLine: false }).notchLine).toBe(false);
    const c = resolveConfig({ notchLine: 'yes', theme: 'dark' });
    expect(c.notchLine).toBe(true);
    expect(c.theme).toBe('dark');
  });
  it('turns off through a patch', () => {
    expect(mergeConfig(DEFAULT_CONFIG, { notchLine: false }).notchLine).toBe(false);
  });
});

describe('notchColors', () => {
  const custom = { ok: '#30d158', warn: '#64d2ff', bad: '#bf5af2' };
  it('defaults to orange, amber and red, including for saved configs from before it existed', () => {
    expect(DEFAULT_CONFIG.notchColors).toEqual({ ok: '#ff6b1f', warn: '#ffb224', bad: '#ff453a' });
    expect(resolveConfig({ theme: 'dark' }).notchColors).toEqual(DEFAULT_CONFIG.notchColors);
  });
  it('keeps a saved choice and changes through a patch', () => {
    expect(resolveConfig({ notchColors: custom }).notchColors).toEqual(custom);
    expect(mergeConfig(DEFAULT_CONFIG, { notchColors: custom }).notchColors).toEqual(custom);
  });
  it('repairs a bad colour to the default, keeping the rest of the config', () => {
    const c = resolveConfig({ notchColors: { ...custom, bad: 'purple' }, theme: 'dark' });
    expect(c.notchColors).toEqual(DEFAULT_CONFIG.notchColors);
    expect(c.theme).toBe('dark');
    expect(mergeConfig(DEFAULT_CONFIG, { notchColors: { ok: '#fff' } }).notchColors).toEqual(
      DEFAULT_CONFIG.notchColors,
    );
  });
});

describe('checkForUpdates', () => {
  it('is on by default, including for saved configs from before it existed', () => {
    expect(DEFAULT_CONFIG.checkForUpdates).toBe(true);
    expect(resolveConfig({ theme: 'dark' }).checkForUpdates).toBe(true);
  });
  it('turns off through a patch', () => {
    expect(mergeConfig(DEFAULT_CONFIG, { checkForUpdates: false }).checkForUpdates).toBe(false);
  });
});
