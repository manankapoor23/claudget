import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Logger, OfficialWindow, UsageSnapshot, WidgetConfig } from '@claude-widget/core';
import { H, NOW, win } from '../shared/test-helpers';
import type { AlertMessage, NotifyOutcome } from '../shared/notifications';
import type { AlertSink } from './notifier';
import { ResetNudger } from './reset-nudge';

const logger = { debug() {}, info() {}, warn() {}, error() {} } as unknown as Logger;
const on = { resetNudge: true } as WidgetConfig;

class FakeSink implements AlertSink {
  sent: AlertMessage[] = [];
  constructor(private readonly ok = true) {}
  supported(): boolean {
    return this.ok;
  }
  send(message: AlertMessage): Promise<NotifyOutcome> {
    this.sent.push(message);
    return Promise.resolve({ result: 'delivered' });
  }
}

function snapshot(at: number, ...windows: OfficialWindow[]): UsageSnapshot {
  return { generatedAt: at, official: { available: true, windows } } as unknown as UsageSnapshot;
}

let dir: string;
let statePath: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'claudget-nudge-'));
  statePath = path.join(dir, 'reset-nudges.json');
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('ResetNudger', () => {
  it('nudges once per week, through jitter and restarts', () => {
    const sink = new FakeSink();
    const n = new ResetNudger(statePath, logger, sink);
    n.check(snapshot(NOW, win('seven_day', 0.3, 20 * H)), on);
    n.check(snapshot(NOW + 60_000, win('seven_day', 0.31, 20 * H - 59_000)), on);
    expect(sink.sent.map((m) => m.title)).toEqual(['70% of your week is unused']);
    // A restart doesn't nudge again for the same week.
    const again = new ResetNudger(statePath, logger, sink);
    // (win() measures the reset from NOW, so this is the same reset, two hours on.)
    again.check(snapshot(NOW + 2 * H, win('seven_day', 0.32, 20 * H)), on);
    expect(sink.sent).toHaveLength(1);
  });

  it('nudges again the next week', () => {
    const sink = new FakeSink();
    const n = new ResetNudger(statePath, logger, sink);
    n.check(snapshot(NOW, win('seven_day', 0.3, 20 * H)), on);
    const week = 7 * 24 * H;
    n.check(snapshot(NOW + week, win('seven_day', 0.2, week + 20 * H)), on);
    expect(sink.sent).toHaveLength(2);
    expect(JSON.parse(fs.readFileSync(statePath, 'utf8'))).toEqual([NOW + week + 20 * H]);
  });

  it('stays quiet when switched off, too early, at half used, or without notifications', () => {
    const sink = new FakeSink();
    const n = new ResetNudger(statePath, logger, sink);
    n.check(snapshot(NOW, win('seven_day', 0.3, 20 * H)), { resetNudge: false } as WidgetConfig);
    n.check(snapshot(NOW, win('seven_day', 0.3, 30 * H)), on);
    n.check(snapshot(NOW, win('seven_day', 0.5, 20 * H)), on);
    new ResetNudger(statePath, logger, new FakeSink(false)).check(
      snapshot(NOW, win('seven_day', 0.3, 20 * H)),
      on,
    );
    expect(sink.sent).toEqual([]);
  });

  it('starts afresh from a missing or broken state file', () => {
    fs.writeFileSync(statePath, '{not json');
    const sink = new FakeSink();
    new ResetNudger(statePath, logger, sink).check(
      snapshot(NOW, win('seven_day', 0.3, 20 * H)),
      on,
    );
    expect(sink.sent).toHaveLength(1);
  });
});
