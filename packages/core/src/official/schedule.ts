/**
 * Minimum time between two plan-limit requests that claudget makes on its own
 * (timer, activity, wake, popover). It equals the documented floor of
 * `officialPollIntervalMs`: the endpoint is aggressively rate-limited, so no
 * trigger may ever make claudget poll faster than a user could configure it to.
 * Only an explicit manual Refresh bypasses it.
 */
export const OFFICIAL_MIN_GAP_MS = 180_000;

/**
 * How long after local activity resumes to check the limits. Long enough that
 * the server has counted the first requests of the burst, short enough that
 * the % visibly reacts to the work you just started.
 */
export const OFFICIAL_ACTIVITY_SETTLE_MS = 30_000;

export interface PollSchedulerOptions {
  /** Regular cadence (config `officialPollIntervalMs`). */
  intervalMs: number;
  /** Floor between any two automatic polls. Defaults to {@link OFFICIAL_MIN_GAP_MS}. */
  minGapMs?: number;
  /** Delay after the first activity since the last poll. */
  activitySettleMs?: number;
  /** Performs one poll. Rejections are swallowed; the scheduler re-arms regardless. */
  poll: (reason: PollReason) => Promise<void>;
  /** Epoch ms before which the endpoint must not be called (429 backoff). */
  blockedUntil?: () => number;
  now?: () => number;
  /** Called with each newly planned poll time (for logs and the snapshot). */
  onPlan?: (dueAt: number, reason: PollReason) => void;
}

export type PollReason = 'start' | 'interval' | 'activity' | 'wake' | 'opened' | 'manual';

/**
 * Decides when to ask Anthropic for the plan limits.
 *
 *  - idle: every `intervalMs` (unchanged behaviour),
 *  - local usage seen since the last poll: `activitySettleMs` after it first
 *    appeared, but never sooner than `minGapMs` after the last poll — so while
 *    you work, the limits refresh every `minGapMs` and the burst you just
 *    finished is caught by the next one,
 *  - wake from sleep / popover opened: right away, if the last poll is at
 *    least `minGapMs` old,
 *  - 429 backoff (and Retry-After) always wins: nothing fires before it ends.
 *
 * The automatic request rate is therefore bounded by one per `minGapMs`, the
 * same as the fastest interval a user can configure.
 */
export class OfficialPollScheduler {
  private intervalMs: number;
  private readonly minGapMs: number;
  private readonly settleMs: number;
  private readonly poll: (reason: PollReason) => Promise<void>;
  private readonly blockedUntil: () => number;
  private readonly now: () => number;
  private readonly onPlan: ((dueAt: number, reason: PollReason) => void) | undefined;

  private lastAttemptAt: number | null = null;
  private dirtySince: number | null = null;
  private timer: NodeJS.Timeout | null = null;
  private plannedAt: number | null = null;
  private inFlight = false;
  private running = false;

  constructor(opts: PollSchedulerOptions) {
    this.intervalMs = opts.intervalMs;
    this.minGapMs = opts.minGapMs ?? OFFICIAL_MIN_GAP_MS;
    this.settleMs = opts.activitySettleMs ?? OFFICIAL_ACTIVITY_SETTLE_MS;
    this.poll = opts.poll;
    this.blockedUntil = opts.blockedUntil ?? ((): number => 0);
    this.now = opts.now ?? ((): number => Date.now());
    this.onPlan = opts.onPlan;
  }

  /** When the next automatic poll is planned, or null when stopped. */
  get nextPollAt(): number | null {
    return this.plannedAt;
  }

  /**
   * Starts polling. `immediate` polls right away unless that would break the
   * gap (e.g. plan-limit polling switched off and on again), in which case the
   * next poll is simply planned.
   */
  start(immediate: boolean): void {
    this.running = true;
    const now = this.now();
    const gapOk = this.lastAttemptAt === null || now - this.lastAttemptAt >= this.minGapMs;
    if (immediate && gapOk && now >= this.blockedUntil()) void this.fire('start');
    else this.arm();
  }

  stop(): void {
    this.running = false;
    this.clear();
  }

  setIntervalMs(ms: number): void {
    this.intervalMs = ms;
    if (this.running) this.arm();
  }

  /** Local usage changed. Cheap to call on every change. */
  noteActivity(): void {
    if (this.dirtySince !== null) return;
    this.dirtySince = this.now();
    if (this.running && !this.inFlight) this.arm();
  }

  /**
   * Something suggests the user is looking or the data may be old (wake from
   * sleep, popover opened). Polls now if that respects the gap, else no-op.
   * Returns whether a poll was started.
   */
  nudge(reason: 'wake' | 'opened'): boolean {
    if (!this.running || this.inFlight) return false;
    const now = this.now();
    if (this.lastAttemptAt !== null && now - this.lastAttemptAt < this.minGapMs) return false;
    if (now < this.blockedUntil()) return false;
    void this.fire(reason);
    return true;
  }

  /** Runs a poll immediately, regardless of the gap (explicit user Refresh). */
  async runNow(): Promise<void> {
    await this.fire('manual');
  }

  private clear(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.plannedAt = null;
  }

  private plan(): { at: number; reason: PollReason } {
    const now = this.now();
    if (this.lastAttemptAt === null) return { at: now, reason: 'start' };
    let at = this.lastAttemptAt + this.intervalMs;
    let reason: PollReason = 'interval';
    if (this.dirtySince !== null) {
      const activityAt = Math.max(
        this.dirtySince + this.settleMs,
        this.lastAttemptAt + this.minGapMs,
      );
      if (activityAt < at) {
        at = activityAt;
        reason = 'activity';
      }
    }
    return { at: Math.max(at, this.blockedUntil()), reason };
  }

  private arm(): void {
    this.clear();
    if (!this.running) return;
    const { at, reason } = this.plan();
    this.plannedAt = at;
    this.onPlan?.(at, reason);
    this.timer = setTimeout(() => void this.fire(reason), Math.max(0, at - this.now()));
    this.timer.unref?.();
  }

  private async fire(reason: PollReason): Promise<void> {
    if (this.inFlight) return;
    this.clear();
    this.inFlight = true;
    this.lastAttemptAt = this.now();
    // Activity from here on belongs to the next poll.
    this.dirtySince = null;
    try {
      await this.poll(reason);
    } catch {
      // The poll reports its own errors; scheduling must survive them.
    } finally {
      this.inFlight = false;
      if (this.running) this.arm();
    }
  }
}
