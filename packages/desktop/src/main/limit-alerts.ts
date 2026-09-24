import { Notification } from 'electron';
import fs from 'node:fs';
import type { Logger, OfficialWindow, UsageSnapshot, WidgetConfig } from '@claude-widget/core';
import { thresholdToAnnounce } from '../shared/alerts';
import { formatDurationShort } from '../shared/duration';
import { limitLabel } from '../shared/limits';

type Notified = Record<string, number>;

/**
 * Speaks up only when a plan limit gets close: once per configured threshold
 * (80% and 95% by default) per window, then silence until that window resets. Keyed by the window and its
 * reset time, and persisted, so a restart doesn't re-announce a crossing the
 * user has already seen.
 */
export class LimitAlerter {
  private notified: Notified;

  constructor(
    private readonly statePath: string,
    private readonly logger: Logger,
  ) {
    this.notified = this.load();
  }

  check(snapshot: UsageSnapshot, config: WidgetConfig): void {
    if (!config.limitAlerts) return;
    if (!snapshot.official.available || !Notification.isSupported()) return;
    const now = snapshot.generatedAt;
    let changed = this.prune(now);

    for (const w of snapshot.official.windows) {
      if (w.resetsAt === null) continue;
      const key = this.keyFor(w);
      const crossed = thresholdToAnnounce(
        w.utilization,
        config.limitAlertThresholds,
        this.notified[key] ?? 0,
      );
      if (crossed === null) continue;
      this.notify(w, crossed, now);
      this.notified[key] = crossed;
      changed = true;
    }
    if (changed) this.save();
  }

  /** `threshold` is in percent. */
  private notify(w: OfficialWindow, threshold: number, now: number): void {
    const label = limitLabel(w.label);
    const left = Math.max(0, Math.round((1 - w.utilization) * 100));
    const reset =
      w.resetsAt === null ? '' : ` · resets in ${formatDurationShort(w.resetsAt - now)}`;
    const title =
      threshold >= 95 ? `${label} limit almost gone` : `${label} limit at ${threshold}%`;
    try {
      new Notification({ title, body: `${left}% left${reset}`, silent: threshold < 95 }).show();
      this.logger.info('Limit alert fired', {
        window: w.key,
        threshold,
        utilization: w.utilization,
      });
    } catch (err) {
      this.logger.warn('Limit notification failed', { err: String(err) });
    }
  }

  /** One key per window per cycle. Reset times jitter by seconds between polls. */
  private keyFor(w: OfficialWindow): string {
    return `${w.key}@${Math.round((w.resetsAt ?? 0) / 60_000)}`;
  }

  /** Drops cycles that have already reset. */
  private prune(now: number): boolean {
    let changed = false;
    for (const key of Object.keys(this.notified)) {
      const minute = Number(key.split('@')[1]);
      if (Number.isFinite(minute) && minute * 60_000 < now) {
        delete this.notified[key];
        changed = true;
      }
    }
    return changed;
  }

  private load(): Notified {
    try {
      const raw = JSON.parse(fs.readFileSync(this.statePath, 'utf8')) as Notified;
      // Earlier builds stored fractions (0.8); thresholds are percent now.
      for (const k of Object.keys(raw)) if (raw[k]! <= 1) raw[k] = raw[k]! * 100;
      return raw;
    } catch {
      return {};
    }
  }

  private save(): void {
    try {
      fs.writeFileSync(this.statePath, JSON.stringify(this.notified), 'utf8');
    } catch (err) {
      this.logger.warn('Could not persist limit alert state', { err: String(err) });
    }
  }
}
