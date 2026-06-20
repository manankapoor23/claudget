import { Notification } from 'electron';
import type { UsageSnapshot, WidgetConfig } from '@claude-widget/core';
import type { Logger } from '@claude-widget/core';

/**
 * Fires native notifications when daily/monthly spend crosses 80% then 100% of a
 * configured budget. De-duped so a given threshold notifies at most once per
 * period: we track the highest threshold already announced for the current
 * day-key (YYYY-MM-DD) and month-key (YYYY-MM), and reset when the key rolls
 * over. Nothing is emitted on every snapshot — only on a fresh crossing.
 */
export class BudgetAlerter {
  private dayKey = '';
  private monthKey = '';
  /** Highest threshold (0, 80, 100) already notified for the current period. */
  private dayNotified = 0;
  private monthNotified = 0;

  constructor(private readonly logger: Logger) {}

  check(snapshot: UsageSnapshot, config: WidgetConfig): void {
    if (!Notification.isSupported()) return;

    const now = new Date(snapshot.generatedAt);
    const dayKey = keyForDay(now);
    const monthKey = keyForMonth(now);
    if (dayKey !== this.dayKey) {
      this.dayKey = dayKey;
      this.dayNotified = 0;
    }
    if (monthKey !== this.monthKey) {
      this.monthKey = monthKey;
      this.monthNotified = 0;
    }

    this.dayNotified = this.evaluate(
      'Daily',
      config.dailyBudgetUSD,
      snapshot.local.today.costUSD,
      this.dayNotified,
      'today',
    );
    this.monthNotified = this.evaluate(
      'Monthly',
      config.monthlyBudgetUSD,
      snapshot.local.thisMonth.costUSD,
      this.monthNotified,
      'this month',
    );
  }

  /** Returns the (possibly raised) highest-notified threshold for the period. */
  private evaluate(
    label: string,
    budget: number | null,
    spent: number,
    alreadyNotified: number,
    when: string,
  ): number {
    if (!budget || budget <= 0) return alreadyNotified;
    const pct = (spent / budget) * 100;
    // Cross the highest unseen threshold; 100 takes precedence over 80.
    let threshold = 0;
    if (pct >= 100) threshold = 100;
    else if (pct >= 80) threshold = 80;
    if (threshold === 0 || threshold <= alreadyNotified) return alreadyNotified;

    const title = `${label} budget ${threshold}%`;
    const body = `${usd(spent)} of ${usd(budget)} spent ${when}`;
    try {
      new Notification({ title, body }).show();
      this.logger.info('Budget alert fired', { label, threshold, spent, budget });
    } catch (err) {
      this.logger.warn('Budget notification failed', { err: String(err) });
    }
    return threshold;
  }
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
