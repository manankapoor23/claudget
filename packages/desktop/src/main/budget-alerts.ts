import fs from 'node:fs';
import type { Logger, UsageSnapshot, WidgetConfig } from '@claude-widget/core';
import type { AlertSink } from './notifier';

/** Per period: which period and budget it was, and the highest threshold announced. */
interface PeriodState {
  /** `YYYY-MM-DD` or `YYYY-MM`, local time, plus the budget: `2026-10-08|20`. */
  key: string;
  notified: number;
}

interface State {
  day: PeriodState;
  month: PeriodState;
}

const EMPTY: State = { day: { key: '', notified: 0 }, month: { key: '', notified: 0 } };

/**
 * Fires native notifications when daily/monthly spend crosses 80% then 100% of a
 * configured budget. De-duped so a given threshold notifies at most once per
 * period: we track the highest threshold already announced for the current
 * day and month, and start over when the period rolls over or the budget is
 * changed. Persisted, so a restart (or a crash) doesn't announce today's
 * crossing again — it used to live only in memory.
 */
export class BudgetAlerter {
  private state: State;

  constructor(
    private readonly statePath: string,
    private readonly logger: Logger,
    private readonly sink: AlertSink,
  ) {
    this.state = this.load();
  }

  check(snapshot: UsageSnapshot, config: WidgetConfig): void {
    if (!this.sink.supported()) return;

    const now = new Date(snapshot.generatedAt);
    const day = this.evaluate(
      'Daily',
      `${keyForDay(now)}|${config.dailyBudgetUSD ?? ''}`,
      this.state.day,
      config.dailyBudgetUSD,
      snapshot.local.today.costUSD,
      'today',
    );
    const month = this.evaluate(
      'Monthly',
      `${keyForMonth(now)}|${config.monthlyBudgetUSD ?? ''}`,
      this.state.month,
      config.monthlyBudgetUSD,
      snapshot.local.thisMonth.costUSD,
      'this month',
    );
    if (day !== this.state.day || month !== this.state.month) {
      this.state = { day, month };
      this.save();
    }
  }

  /** Returns the period's state, the same object if nothing changed. */
  private evaluate(
    label: string,
    key: string,
    prev: PeriodState,
    budget: number | null,
    spent: number,
    when: string,
  ): PeriodState {
    const current = prev.key === key ? prev : { key, notified: 0 };
    if (!budget || budget <= 0) return current;
    const pct = (spent / budget) * 100;
    // Cross the highest unseen threshold; 100 takes precedence over 80.
    let threshold = 0;
    if (pct >= 100) threshold = 100;
    else if (pct >= 80) threshold = 80;
    if (threshold === 0 || threshold <= current.notified) return current;

    this.logger.info('Budget alert fired', { label, threshold, spent, budget });
    void this.sink
      .send({
        id: `budget-${label.toLowerCase()}`,
        title: `${label} budget ${threshold}%`,
        body: `${usd(spent)} of ${usd(budget)} spent ${when}`,
        sound: threshold >= 100,
        urgent: threshold >= 100,
      })
      .then((outcome) => {
        if (outcome.result === 'failed') {
          this.logger.warn('Budget alert not shown', { label, threshold, ...outcome });
        }
      });
    return { key, notified: threshold };
  }

  private load(): State {
    try {
      const raw = JSON.parse(fs.readFileSync(this.statePath, 'utf8')) as Partial<State>;
      return { day: period(raw.day), month: period(raw.month) };
    } catch {
      return EMPTY;
    }
  }

  private save(): void {
    try {
      fs.writeFileSync(this.statePath, JSON.stringify(this.state), 'utf8');
    } catch (err) {
      this.logger.warn('Could not persist budget alert state', { err: String(err) });
    }
  }
}

function period(raw: unknown): PeriodState {
  const p = raw as Partial<PeriodState> | undefined;
  return typeof p?.key === 'string' && typeof p.notified === 'number'
    ? { key: p.key, notified: p.notified }
    : { key: '', notified: 0 };
}

function usd(n: number): string {
  return `$${n.toFixed(2)}`;
}

function keyForDay(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function keyForMonth(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
