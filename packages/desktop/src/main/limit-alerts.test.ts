import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Logger, OfficialWindow, UsageSnapshot, WidgetConfig } from '@claude-widget/core';
import { H, NOW, win } from '../shared/test-helpers';
import type { AlertMessage, NotifyOutcome } from '../shared/notifications';
import { LimitAlerter } from './limit-alerts';
import type { AlertSink } from './notifier';

const MIN = 60_000;
const logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
} as unknown as Logger;
const config = { limitAlerts: true, limitAlertThresholds: [70, 95] } as WidgetConfig;

class FakeSink implements AlertSink {
  sent: AlertMessage[] = [];
  supported(): boolean {
    return true;
  }
  send(message: AlertMessage): Promise<NotifyOutcome> {
    this.sent.push(message);
    return Promise.resolve({ result: 'delivered' });
  }
}

function snapshot(at: number, ...windows: OfficialWindow[]): UsageSnapshot {
  return { generatedAt: at, official: { available: true, windows } } as unknown as UsageSnapshot;
}

/** The 5-hour window, resetting at `NOW + resetsIn` (+ `jitter` ms), `u` used. */
function fiveHour(u: number, resetsIn: number, jitter = 0): OfficialWindow {
  return win('five_hour', u, resetsIn + jitter);
}

let dir: string;
let statePath: string;
let sink: FakeSink;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'claudget-alerts-'));
  statePath = path.join(dir, 'limit-alerts.json');
  sink = new FakeSink();
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('LimitAlerter', () => {
  it('alerts once per threshold when resetsAt jitters between polls', () => {
    const a = new LimitAlerter(statePath, logger, sink);
    // Reset at hh:mm:30 exactly, so the jitter lands on both sides of the
    // rounding boundary — the case plain rounding to the minute gets wrong.
    const reset = 2 * H + 30_000;
    const jitters = [0, -400, 350, -1, 900, -250, 120, -999];
    jitters.forEach((j, i) =>
      a.check(snapshot(NOW + i * 3 * MIN, fiveHour(0.96, reset, j)), config),
    );
    expect(sink.sent.map((m) => m.title)).toEqual(['5-hour limit almost gone']);
  });

  it('does not re-alert a window whose reset has passed (stale reading)', () => {
    // 2026-10-03: the 5-hour window reset at 15:00, the endpoint went
    // unanswered until 15:48, and the cached 100% re-alerted on every refresh.
    const a = new LimitAlerter(statePath, logger, sink);
    a.check(snapshot(NOW, fiveHour(1, 30 * MIN)), config);
    expect(sink.sent).toHaveLength(1);
    for (let t = 31 * MIN; t < 80 * MIN; t += 2 * MIN) {
      a.check(snapshot(NOW + t, fiveHour(1, 30 * MIN, (t % 3) * 7)), config);
    }
    expect(sink.sent).toHaveLength(1);
  });

  it('alerts again in a genuinely new window', () => {
    const a = new LimitAlerter(statePath, logger, sink);
    a.check(snapshot(NOW, fiveHour(0.97, 10 * MIN)), config);
    // The next window: resets five hours after the last one.
    a.check(snapshot(NOW + 20 * MIN, fiveHour(0.96, 10 * MIN + 5 * H)), config);
    expect(sink.sent).toHaveLength(2);
    expect(new Set(sink.sent.map((m) => m.id)).size).toBe(2);
  });

  it('keeps what it announced across a restart', () => {
    new LimitAlerter(statePath, logger, sink).check(
      snapshot(NOW, fiveHour(0.72, 2 * H), win('seven_day', 0.96, 50 * H)),
      config,
    );
    expect(sink.sent).toHaveLength(2);
    const relaunched = new LimitAlerter(statePath, logger, sink);
    relaunched.check(
      snapshot(NOW + 5 * MIN, fiveHour(0.73, 2 * H, 800), win('seven_day', 0.97, 50 * H, 'Weekly')),
      config,
    );
    expect(sink.sent).toHaveLength(2);
    // ...but a higher threshold in the same window still gets through.
    relaunched.check(snapshot(NOW + 9 * MIN, fiveHour(0.95, 2 * H, -300)), config);
    expect(sink.sent.map((m) => m.title)).toContain('5-hour limit almost gone');
    expect(sink.sent).toHaveLength(3);
  });

  it('reads state files written by earlier builds', () => {
    const minute = Math.round((NOW + 2 * H) / MIN);
    fs.writeFileSync(statePath, JSON.stringify({ [`five_hour@${minute}`]: 0.7 }));
    const a = new LimitAlerter(statePath, logger, sink);
    a.check(snapshot(NOW, fiveHour(0.8, 2 * H, 20_000)), config);
    expect(sink.sent).toHaveLength(0);
  });

  it('crosses up once per threshold, and stays quiet on the way down and back up', () => {
    const a = new LimitAlerter(statePath, logger, sink);
    const at = (i: number, u: number): void =>
      a.check(snapshot(NOW + i * MIN, fiveHour(u, 3 * H, i * 13)), config);
    at(0, 0.5);
    at(1, 0.71);
    at(2, 0.8);
    at(3, 0.95);
    at(4, 0.6); // e.g. a correction from Anthropic
    at(5, 0.75);
    at(6, 0.99);
    expect(sink.sent.map((m) => m.title)).toEqual([
      '5-hour limit at 70%',
      '5-hour limit almost gone',
    ]);
    // Early warnings are quiet; the last one makes a sound.
    expect(sink.sent.map((m) => m.sound)).toEqual([false, true]);
  });

  it('opening the app at 99% sends one alert, not two', () => {
    const a = new LimitAlerter(statePath, logger, sink);
    a.check(snapshot(NOW, fiveHour(0.99, H)), config);
    expect(sink.sent).toHaveLength(1);
  });

  it('says "reached" at 100%', () => {
    const a = new LimitAlerter(statePath, logger, sink);
    a.check(snapshot(NOW, fiveHour(1, H)), config);
    expect(sink.sent[0]?.title).toBe('5-hour limit reached');
    expect(sink.sent[0]?.body).toBe('0% left · resets in 1h 0m');
  });

  it('stays quiet when alerts are off or notifications are unsupported', () => {
    new LimitAlerter(statePath, logger, sink).check(snapshot(NOW, fiveHour(0.99, H)), {
      ...config,
      limitAlerts: false,
    });
    const none = new FakeSink();
    none.supported = () => false;
    new LimitAlerter(statePath, logger, none).check(snapshot(NOW, fiveHour(0.99, H)), config);
    expect(sink.sent).toHaveLength(0);
    expect(none.sent).toHaveLength(0);
  });
});
