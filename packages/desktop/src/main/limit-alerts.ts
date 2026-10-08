import fs from 'node:fs';
import type { Logger, OfficialWindow, UsageSnapshot, WidgetConfig } from '@claude-widget/core';
import { thresholdToAnnounce } from '../shared/alerts';
import { formatDurationShort } from '../shared/duration';
import { limitLabel } from '../shared/limits';
import type { AlertMessage } from '../shared/notifications';
import type { AlertSink } from './notifier';

/** `${window key}@${reset time in whole minutes}` → highest threshold announced (percent). */
type Notified = Record<string, number>;

const MINUTE = 60_000;
/**
 * Two readings of one window can disagree on its reset time by up to a second
 * or so, and a reading can be minutes old. Anything within this of a cycle
 * already on file is that cycle; a genuinely new window resets hours later.
 */
const SAME_WINDOW_MS = 5 * MINUTE;

/**
 * Speaks up only when a plan limit gets close: once per configured threshold
 * (80% and 95% by default) per window, then silence until that window resets.
 * Keyed by the window and its reset time, and persisted, so a restart doesn't
 * re-announce a crossing the user has already seen.
 *
 * A window whose reset time has passed is never announced. Its reading is from
 * the cycle that just ended, and it lingers until the next successful poll
 * (longer when the endpoint is rate-limiting or offline). It used to be: the
 * expired cycle was pruned from the state on every snapshot and then announced
 * again, so a stale 100% re-alerted on every refresh — every one to three
 * minutes — until a fresh reading arrived.
 */
export class LimitAlerter {
  private notified: Notified;

  constructor(
    private readonly statePath: string,
    private readonly logger: Logger,
    private readonly sink: AlertSink,
  ) {
    this.notified = this.load();
  }

  check(snapshot: UsageSnapshot, config: WidgetConfig): void {
    if (!config.limitAlerts) return;
    if (!snapshot.official.available || !this.sink.supported()) return;
    const now = snapshot.generatedAt;
    let changed = this.prune(now);

    for (const w of snapshot.official.windows) {
      if (w.resetsAt === null || w.resetsAt <= now) continue;
      const key = this.keyFor(w.key, w.resetsAt);
      const crossed = thresholdToAnnounce(
        w.utilization,
        config.limitAlertThresholds,
        this.notified[key] ?? 0,
      );
      if (crossed === null) continue;
      this.notified[key] = crossed;
      changed = true;
      this.notify(w, crossed, now, key);
    }
    if (changed) this.save();
  }

  /** `threshold` is in percent. */
  private notify(w: OfficialWindow, threshold: number, now: number, key: string): void {
    const message = limitAlertMessage(w, threshold, now, key);
    this.logger.info('Limit alert fired', {
      window: w.key,
      threshold,
      utilization: w.utilization,
      resetsAt: w.resetsAt,
    });
    void this.sink.send(message).then((outcome) => {
      if (outcome.result === 'failed') {
        this.logger.warn('Limit alert not shown', { window: w.key, threshold, ...outcome });
      }
    });
  }

  /**
   * The key of the cycle on file within SAME_WINDOW_MS of this reset, or a
   * new one. Rounding alone isn't enough: two readings a second apart either
   * side of hh:mm:30 round to different minutes.
   */
  private keyFor(window: string, resetsAt: number): string {
    for (const key of Object.keys(this.notified)) {
      const parsed = parseKey(key);
      if (parsed?.window === window && Math.abs(parsed.resetsAt - resetsAt) < SAME_WINDOW_MS) {
        return key;
      }
    }
    return `${window}@${Math.round(resetsAt / MINUTE)}`;
  }

  /** Drops cycles that reset a while ago. Unreadable keys go too. */
  private prune(now: number): boolean {
    let changed = false;
    for (const key of Object.keys(this.notified)) {
      const parsed = parseKey(key);
      if (!parsed || parsed.resetsAt + SAME_WINDOW_MS < now) {
        delete this.notified[key];
        changed = true;
      }
    }
    return changed;
  }

  private load(): Notified {
    try {
      const raw = JSON.parse(fs.readFileSync(this.statePath, 'utf8')) as unknown;
      if (!raw || typeof raw !== 'object') return {};
      const out: Notified = {};
      for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
        if (typeof v !== 'number' || !Number.isFinite(v)) continue;
        // Earlier builds stored fractions (0.8); thresholds are percent now.
        out[k] = v <= 1 ? v * 100 : v;
      }
      return out;
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

function parseKey(key: string): { window: string; resetsAt: number } | null {
  const at = key.lastIndexOf('@');
  if (at <= 0) return null;
  const minute = Number(key.slice(at + 1));
  if (!Number.isFinite(minute)) return null;
  return { window: key.slice(0, at), resetsAt: minute * MINUTE };
}

/** What a limit alert says. `threshold` is in percent. */
export function limitAlertMessage(
  w: OfficialWindow,
  threshold: number,
  now: number,
  id: string,
): AlertMessage {
  const label = limitLabel(w.label);
  const left = Math.max(0, Math.round((1 - w.utilization) * 100));
  const reset = w.resetsAt === null ? '' : ` · resets in ${formatDurationShort(w.resetsAt - now)}`;
  const nearlyGone = threshold >= 95;
  const title =
    left === 0
      ? `${label} limit reached`
      : nearlyGone
        ? `${label} limit almost gone`
        : `${label} limit at ${threshold}%`;
  return {
    id: `limit-${id}`,
    title,
    body: `${left}% left${reset}`,
    sound: nearlyGone,
    urgent: nearlyGone,
  };
}
