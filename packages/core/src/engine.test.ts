import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from './config';
import { UsageEngine } from './engine';
import type { Logger } from './logger';
import type { UsageSnapshot } from './types';

const silent = {
  info() {},
  warn() {},
  error() {},
  debug() {},
  setLevel() {},
  child() {
    return silent;
  },
} as unknown as Logger;

function engineWithCounter(): { engine: UsageEngine; snapshots: () => number } {
  const engine = new UsageEngine({
    config: { ...DEFAULT_CONFIG, enableOfficial: false, claudeDir: '/nonexistent-claudget-test' },
    logger: silent,
  });
  let n = 0;
  engine.on('snapshot', (_s: UsageSnapshot) => {
    n += 1;
  });
  return { engine, snapshots: () => n };
}

describe('UsageEngine.updateConfig', () => {
  /**
   * Regression: a snapshot is a full re-aggregate of every entry plus an IPC
   * structured clone. The opacity slider emits ~30-60 patches/second, so pushing
   * a snapshot per cosmetic patch starves the main process (beachball on macOS).
   */
  it('does not emit a snapshot for presentation-only patches', () => {
    const { engine, snapshots } = engineWithCounter();
    engine.updateConfig({ opacity: 0.5 });
    engine.updateConfig({ theme: 'dark' });
    engine.updateConfig({ alwaysOnTop: false });
    engine.updateConfig({ compact: true });
    engine.updateConfig({ clickThrough: true });
    engine.updateConfig({ showInTaskbar: false });
    expect(snapshots()).toBe(0);
  });

  it('still emits a snapshot when a data-affecting field changes', () => {
    const { engine, snapshots } = engineWithCounter();
    engine.updateConfig({ historyWindowHours: 48 });
    expect(snapshots()).toBe(1);
    engine.updateConfig({ recentSessionLimit: 20 });
    expect(snapshots()).toBe(2);
    engine.updateConfig({ dailyBudgetUSD: 25 });
    expect(snapshots()).toBe(3);
  });

  it('does not emit when a patch sets a field to its existing value', () => {
    const { engine, snapshots } = engineWithCounter();
    engine.updateConfig({ historyWindowHours: DEFAULT_CONFIG.historyWindowHours });
    expect(snapshots()).toBe(0);
  });

  it('still applies presentation-only patches to the stored config', () => {
    const { engine } = engineWithCounter();
    expect(engine.updateConfig({ opacity: 0.5 }).opacity).toBe(0.5);
    expect(engine.getConfig().opacity).toBe(0.5);
  });
});
