import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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

describe('UsageEngine local freshness', () => {
  it('does not advance localUpdatedAt when a rescan finds no new usage', async () => {
    const claudeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claudget-engine-'));
    const projectsDir = path.join(claudeDir, 'projects', '-Users-test-project');
    const transcript = path.join(projectsDir, 'session.jsonl');
    fs.mkdirSync(projectsDir, { recursive: true });

    const line = (id: string): string =>
      JSON.stringify({
        type: 'assistant',
        timestamp: '2026-09-09T00:00:00.000Z',
        uuid: id,
        requestId: id,
        sessionId: 'session-1',
        message: {
          id,
          model: 'claude-sonnet-4-20250514',
          usage: { input_tokens: 10, output_tokens: 5 },
        },
      });

    let now = 1_000;
    try {
      fs.writeFileSync(transcript, line('one') + '\n');
      const engine = new UsageEngine({
        config: { ...DEFAULT_CONFIG, enableOfficial: false, claudeDir },
        logger: silent,
        now: () => now,
      });

      await engine.fullRescan();
      expect(engine.getSnapshot().localUpdatedAt).toBe(1_000);

      now = 2_000;
      await engine.fullRescan();
      expect(engine.getSnapshot().localUpdatedAt).toBe(1_000);

      fs.appendFileSync(transcript, line('two') + '\n');
      await engine.fullRescan();
      expect(engine.getSnapshot().localUpdatedAt).toBe(2_000);
    } finally {
      fs.rmSync(claudeDir, { recursive: true, force: true });
    }
  });
});

describe('UsageEngine live updates', () => {
  const line = (id: string, output: number): string =>
    JSON.stringify({
      type: 'assistant',
      timestamp: new Date().toISOString(),
      uuid: id,
      requestId: id,
      sessionId: 'session-1',
      message: {
        id,
        model: 'claude-sonnet-4-6',
        usage: { input_tokens: 10, output_tokens: output },
      },
    }) + '\n';

  async function startEngine(): Promise<{
    engine: UsageEngine;
    transcript: string;
    claudeDir: string;
    snaps: Array<{ at: number; count: number }>;
  }> {
    const claudeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claudget-live-'));
    const projectsDir = path.join(claudeDir, 'projects', '-Users-test-project');
    fs.mkdirSync(projectsDir, { recursive: true });
    const transcript = path.join(projectsDir, 'session.jsonl');
    fs.writeFileSync(transcript, line('seed', 1));
    const engine = new UsageEngine({
      config: { ...DEFAULT_CONFIG, enableOfficial: false, claudeDir },
      logger: silent,
    });
    const snaps: Array<{ at: number; count: number }> = [];
    engine.on('snapshot', (s) => snaps.push({ at: Date.now(), count: s.local.today.count }));
    await engine.start();
    await new Promise((r) => setTimeout(r, 500)); // let the watcher settle
    return { engine, transcript, claudeDir, snaps };
  }

  it('shows an appended line well inside a second', async () => {
    const { engine, transcript, claudeDir, snaps } = await startEngine();
    try {
      const writtenAt = Date.now();
      fs.appendFileSync(transcript, line('one', 5));
      await new Promise((r) => setTimeout(r, 1500));
      const hit = snaps.find((s) => s.count === 2);
      expect(hit).toBeDefined();
      // ~300ms locally; the bound leaves CI headroom yet fails the old fixed 1s window.
      expect(hit!.at - writtenAt).toBeLessThan(900);
    } finally {
      await engine.stop();
      fs.rmSync(claudeDir, { recursive: true, force: true });
    }
  }, 15_000);

  /**
   * Chokidar drops a `change` that lands within 50ms of the previous one, so
   * the last line of a fast burst can have no event of its own. It must still
   * show up promptly, not at the next write or the 2-minute rescan.
   */
  it('shows every line of a fast burst once it ends, without waiting for the rescan', async () => {
    const { engine, transcript, claudeDir, snaps } = await startEngine();
    try {
      for (let i = 0; i < 20; i++) {
        fs.appendFileSync(transcript, line(`burst-${i}`, 5));
        await new Promise((r) => setTimeout(r, 5));
      }
      await new Promise((r) => setTimeout(r, 2000));
      expect(snaps.at(-1)?.count).toBe(21);
    } finally {
      await engine.stop();
      fs.rmSync(claudeDir, { recursive: true, force: true });
    }
  }, 15_000);

  it('a periodic rescan that finds nothing new reports no change', async () => {
    const { engine, claudeDir } = await startEngine();
    try {
      expect(await engine.fullRescan()).toBe(false);
    } finally {
      await engine.stop();
      fs.rmSync(claudeDir, { recursive: true, force: true });
    }
  }, 15_000);
});
