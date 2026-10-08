import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Logger, UsageSnapshot, WidgetConfig } from '@claude-widget/core';
import type { AlertMessage, NotifyOutcome } from '../shared/notifications';
import { BudgetAlerter } from './budget-alerts';
import type { AlertSink } from './notifier';

const logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
} as unknown as Logger;
const DAY1 = new Date(2026, 9, 8, 10, 0).getTime();
const DAY2 = new Date(2026, 9, 9, 10, 0).getTime();

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

function snapshot(at: number, today: number, month = today): UsageSnapshot {
  return {
    generatedAt: at,
    local: { today: { costUSD: today }, thisMonth: { costUSD: month } },
  } as unknown as UsageSnapshot;
}
const daily = (dailyBudgetUSD: number | null): WidgetConfig =>
  ({ dailyBudgetUSD, monthlyBudgetUSD: null }) as WidgetConfig;

let dir: string;
let statePath: string;
let sink: FakeSink;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'claudget-budget-'));
  statePath = path.join(dir, 'budget-alerts.json');
  sink = new FakeSink();
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('BudgetAlerter', () => {
  it('announces 80% then 100% once each per day', () => {
    const a = new BudgetAlerter(statePath, logger, sink);
    for (const spent of [5, 8.1, 8.5, 9, 10, 12, 15]) a.check(snapshot(DAY1, spent), daily(10));
    expect(sink.sent.map((m) => m.title)).toEqual(['Daily budget 80%', 'Daily budget 100%']);
  });

  it('does not announce again after a restart', () => {
    new BudgetAlerter(statePath, logger, sink).check(snapshot(DAY1, 8.5), daily(10));
    new BudgetAlerter(statePath, logger, sink).check(snapshot(DAY1, 8.6), daily(10));
    expect(sink.sent).toHaveLength(1);
  });

  it('starts over on a new day', () => {
    const a = new BudgetAlerter(statePath, logger, sink);
    a.check(snapshot(DAY1, 9), daily(10));
    a.check(snapshot(DAY2, 9), daily(10));
    expect(sink.sent).toHaveLength(2);
  });

  it('starts over when the budget changes', () => {
    const a = new BudgetAlerter(statePath, logger, sink);
    a.check(snapshot(DAY1, 10), daily(10));
    a.check(snapshot(DAY1, 17), daily(20));
    expect(sink.sent.map((m) => m.title)).toEqual(['Daily budget 100%', 'Daily budget 80%']);
  });

  it('stays quiet without a budget', () => {
    new BudgetAlerter(statePath, logger, sink).check(snapshot(DAY1, 1000), daily(null));
    expect(sink.sent).toHaveLength(0);
  });
});
