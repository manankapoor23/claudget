import fs from 'node:fs';
import type { Logger, UsageSnapshot, WidgetConfig } from '@claude-widget/core';
import { nudgeMessage, weeklyNudge } from '../shared/resets';
import type { AlertSink } from './notifier';

const MINUTE = 60_000;
/** Reset times jitter between readings; anything this close is the same week. */
const SAME_WEEK_MS = 5 * MINUTE;

/**
 * The "use it before it resets" nudge: once per week, a day before the weekly
 * limit resets, if less than half of it is used (see shared/resets.ts).
 * Remembers which weeks it has nudged about on disk, so a restart doesn't
 * repeat it.
 */
export class ResetNudger {
  /** Reset times (epoch ms) of the weeks already nudged about. */
  private nudged: number[];

  constructor(
    private readonly statePath: string,
    private readonly logger: Logger,
    private readonly sink: AlertSink,
  ) {
    this.nudged = this.load();
  }

  check(snapshot: UsageSnapshot, config: WidgetConfig): void {
    if (!config.resetNudge || !snapshot.official.available || !this.sink.supported()) return;
    const now = snapshot.generatedAt;
    const w = weeklyNudge(snapshot.official.windows, now);
    if (!w || w.resetsAt === null) return;
    const resetsAt = w.resetsAt;
    if (this.nudged.some((r) => Math.abs(r - resetsAt) < SAME_WEEK_MS)) return;
    // Keep only weeks still ahead, plus this one.
    this.nudged = [...this.nudged.filter((r) => r + SAME_WEEK_MS > now), resetsAt];
    this.save();
    const message = nudgeMessage(w, now, `seven_day@${Math.round(resetsAt / MINUTE)}`);
    this.logger.info('Reset nudge sent', { utilization: w.utilization, resetsAt });
    void this.sink.send(message).then((outcome) => {
      if (outcome.result === 'failed') this.logger.warn('Reset nudge not shown', { ...outcome });
    });
  }

  private load(): number[] {
    try {
      const raw = JSON.parse(fs.readFileSync(this.statePath, 'utf8')) as unknown;
      return Array.isArray(raw) ? raw.filter((r): r is number => Number.isFinite(r)) : [];
    } catch {
      return [];
    }
  }

  private save(): void {
    try {
      fs.writeFileSync(this.statePath, JSON.stringify(this.nudged), 'utf8');
    } catch (err) {
      this.logger.warn('Could not persist reset nudge state', { err: String(err) });
    }
  }
}
