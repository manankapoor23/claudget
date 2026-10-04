import { EventEmitter } from 'node:events';
import path from 'node:path';
import { buildLocalUsage } from './aggregate';
import { mergeConfig, type WidgetConfig } from './config';
import { readCredentials } from './credentials';
import { discoverTranscripts } from './discover';
import { createLogger, type Logger } from './logger';
import { OfficialPollScheduler, OfficialUsageClient, type PollReason } from './official';
import { claudePaths, prettifyProjectSlug, type ClaudePaths } from './paths';
import { DEFAULT_PRICING, type PricingTable } from './pricing';
import {
  EMPTY_CALIBRATION,
  estimateWindow,
  ingestReading,
  rateFor,
  usageWeight,
  weightBetween,
  type CalibrationState,
  type CalibrationStore,
} from './estimate';
import {
  SNAPSHOT_SCHEMA_VERSION,
  type AccountMeta,
  type ActiveSession,
  type OfficialUsage,
  type OfficialWindow,
  type SnapshotHealth,
  type UsageEntry,
  type UsageSnapshot,
} from './types';
import { TranscriptStore } from './transcript-store';
import { readJsonSafe, walkFiles } from './util/fs';
import { watchTranscripts, type TranscriptWatcher } from './watch';

/**
 * Trailing quiet window for transcript events: a change is processed once the
 * file has been still this long. `localDebounceMs` is the ceiling (max wait)
 * while a session keeps writing, so updates land within ~250ms of a pause and
 * at least once per `localDebounceMs` during a stream.
 */
const LOCAL_QUIET_MS = 200;

/**
 * Config fields a {@link UsageSnapshot} actually depends on. Anything absent here
 * (opacity, theme, alwaysOnTop, ...) is presentation-only and cannot change a
 * snapshot, so patching it must not trigger a rebuild.
 */
const SNAPSHOT_AFFECTING_KEYS = [
  'enableOfficial',
  'officialPollIntervalMs',
  'historyWindowHours',
  'blockHours',
  'recentSessionLimit',
  'claudeDir',
  'currency',
  'dailyBudgetUSD',
  'monthlyBudgetUSD',
] as const satisfies readonly (keyof WidgetConfig)[];

export interface UsageEngineOptions {
  config: WidgetConfig;
  logger?: Logger;
  /** Claude Code CLI version, used in the official endpoint's User-Agent. */
  cliVersion?: string | null;
  /** Injectable fetch (for tests). */
  fetchImpl?: typeof fetch;
  pricing?: PricingTable;
  /** Injectable clock (for tests). */
  now?: () => number;
  /**
   * Where the live-estimate calibration persists across restarts. Without one
   * it's learned afresh each run (from the first reading, see calibration.ts).
   */
  calibrationStore?: CalibrationStore;
}

/**
 * Owns all data acquisition and produces {@link UsageSnapshot}s. It maintains an
 * in-memory, per-file map of parsed entries and a read offset per file, so a
 * change parses only the bytes appended since the last read; a periodic full
 * rescan catches new projects and missed events (and costs a stat per file
 * when nothing changed).
 *
 * Emits `'snapshot'` (a new {@link UsageSnapshot}) and `'error'` (an `Error`).
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- typed-emitter overloads (see interface below)
export class UsageEngine extends EventEmitter {
  private config: WidgetConfig;
  private readonly logger: Logger;
  private readonly cliVersion: string | null;
  private readonly now: () => number;
  private readonly fetchImpl: typeof fetch | undefined;
  private pricing: PricingTable;
  private paths: ClaudePaths;
  private official: OfficialUsageClient;

  private transcripts = new TranscriptStore();
  private activeSessions: ActiveSession[] = [];
  private meta: AccountMeta;
  private health: SnapshotHealth = {
    localOk: false,
    officialOk: false,
    lastLocalError: null,
    lastOfficialError: null,
  };
  private localScanStats = { files: 0, scanDurationMs: 0 };
  private localUpdatedAt: number | null = null;

  private readonly calibrationStore: CalibrationStore | null;
  private calibration: CalibrationState;
  /** fetchedAt of the last official reading folded into the calibration. */
  private calibratedAt: number | null = null;
  /** The last estimate shown per limit, to log how far off it was when the reading lands. */
  private lastEstimates = new Map<string, { utilization: number; resetsAt: number | null }>();

  private watcher: TranscriptWatcher | null = null;
  private officialScheduler: OfficialPollScheduler;
  private rescanTimer: NodeJS.Timeout | null = null;
  private started = false;

  constructor(opts: UsageEngineOptions) {
    super();
    this.config = opts.config;
    this.logger = (opts.logger ?? createLogger({ level: opts.config.logLevel })).child('engine');
    this.cliVersion = opts.cliVersion ?? null;
    this.now = opts.now ?? ((): number => Date.now());
    this.fetchImpl = opts.fetchImpl;
    this.pricing = opts.pricing ?? DEFAULT_PRICING;
    this.paths = claudePaths(opts.config.claudeDir);
    this.meta = {
      subscriptionType: null,
      rateLimitTier: null,
      organizationUuid: null,
      claudeDir: this.paths.root,
      cliVersion: this.cliVersion,
    };
    this.official = this.createOfficialClient();
    this.calibrationStore = opts.calibrationStore ?? null;
    this.calibration = this.calibrationStore?.load() ?? EMPTY_CALIBRATION;
    this.officialScheduler = new OfficialPollScheduler({
      intervalMs: this.config.officialPollIntervalMs,
      poll: (reason) => this.pollOfficial(reason),
      blockedUntil: () => this.official.getBackoffUntil(),
      now: this.now,
      onPlan: (at, reason) =>
        this.logger.debug(
          `Next plan-limit check in ${Math.round((at - this.now()) / 1000)}s (${reason})`,
        ),
    });
  }

  private createOfficialClient(): OfficialUsageClient {
    return new OfficialUsageClient({
      credentialsPath: this.paths.credentialsPath,
      cliVersion: this.cliVersion,
      pollIntervalMs: this.config.officialPollIntervalMs,
      logger: this.logger,
      fetchImpl: this.fetchImpl,
      now: this.now,
      includeRaw: this.config.logLevel === 'debug',
    });
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.logger.info('Engine starting', { claudeDir: this.paths.root });
    await this.refreshMeta();
    await this.fullRescan();
    this.startWatcher();
    this.scheduleRescan();
    this.scheduleOfficial();
    this.emitSnapshot();
  }

  async stop(): Promise<void> {
    this.started = false;
    this.officialScheduler.stop();
    if (this.rescanTimer) clearInterval(this.rescanTimer);
    this.rescanTimer = null;
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
    this.logger.info('Engine stopped');
  }

  getConfig(): WidgetConfig {
    return this.config;
  }

  /** What the live estimate has learned so far (diagnostics, tests). */
  getCalibration(): CalibrationState {
    return this.calibration;
  }

  /** Applies a config patch and reacts to any runtime-affecting changes. */
  updateConfig(patch: Partial<WidgetConfig>): WidgetConfig {
    const prev = this.config;
    this.config = mergeConfig(this.config, patch);

    if (this.config.logLevel !== prev.logLevel) this.logger.setLevel(this.config.logLevel);

    if (this.config.claudeDir !== prev.claudeDir) {
      this.paths = claudePaths(this.config.claudeDir);
      this.meta = { ...this.meta, claudeDir: this.paths.root };
      this.official.setOptions({ credentialsPath: this.paths.credentialsPath });
      void this.restartLocal();
    }
    if (this.config.officialPollIntervalMs !== prev.officialPollIntervalMs) {
      this.official.setOptions({ pollIntervalMs: this.config.officialPollIntervalMs });
      this.officialScheduler.setIntervalMs(this.config.officialPollIntervalMs);
    }
    if (this.config.enableOfficial !== prev.enableOfficial && this.started) {
      this.scheduleOfficial();
    }
    if (this.config.fullRescanIntervalMs !== prev.fullRescanIntervalMs && this.started) {
      this.scheduleRescan();
    }

    // ponytail: a snapshot is a full re-aggregate of every entry plus a structured
    // clone across the IPC boundary. Purely cosmetic fields (opacity, theme, ...)
    // change nothing in it, and the opacity slider fires ~30-60 patches/second —
    // rebuilding and re-pushing per pointer move is what starved the main process.
    if (SNAPSHOT_AFFECTING_KEYS.some((k) => this.config[k] !== prev[k])) this.emitSnapshot();
    return this.config;
  }

  /** Forces an immediate full local rescan and official refresh. */
  async refresh(): Promise<void> {
    await this.fullRescan();
    if (this.started && this.config.enableOfficial) await this.officialScheduler.runNow();
    else await this.refreshOfficial(true);
  }

  /**
   * Hints that fresh plan limits would be seen now (wake from sleep, popover
   * opened). Polls only if the last check is at least the minimum gap old, so
   * it can never raise the request rate. Returns whether a poll started.
   */
  nudgeOfficial(reason: 'wake' | 'opened'): boolean {
    if (!this.started || !this.config.enableOfficial) return false;
    return this.officialScheduler.nudge(reason);
  }

  // ── Local data ──────────────────────────────────────────────────────────────

  private startWatcher(): void {
    this.watcher = watchTranscripts(
      this.paths.projectsDir,
      (paths) => void this.handleChange(paths),
      {
        quietMs: Math.min(LOCAL_QUIET_MS, this.config.localDebounceMs),
        maxWaitMs: this.config.localDebounceMs,
        confirmMs: LOCAL_QUIET_MS,
        logger: this.logger,
      },
    );
  }

  private async restartLocal(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
    await this.fullRescan();
    if (this.started) this.startWatcher();
    this.emitSnapshot();
  }

  /**
   * Re-walks the projects tree. Unchanged files cost one stat; grown files are
   * read from their last offset. Returns whether any usage entry changed.
   */
  async fullRescan(): Promise<boolean> {
    const started = this.now();
    try {
      const files = await discoverTranscripts(this.paths.projectsDir);
      // Reads only new and grown transcripts, and only their new bytes.
      const entriesChanged = await this.transcripts.sync(files);
      await this.readActiveSessions();
      await this.refreshMeta();
      this.localScanStats = { files: files.length, scanDurationMs: this.now() - started };
      if (entriesChanged || this.localUpdatedAt === null) this.localUpdatedAt = this.now();
      if (entriesChanged) this.officialScheduler.noteActivity();
      this.health.localOk = true;
      this.health.lastLocalError = null;
      this.logger.debug(
        `Full rescan complete: ${files.length} files in ${this.localScanStats.scanDurationMs}ms`,
      );
      return entriesChanged;
    } catch (err) {
      this.health.localOk = false;
      this.health.lastLocalError = err instanceof Error ? err.message : String(err);
      this.logger.error('Full rescan failed', err);
      return false;
    }
  }

  private async handleChange(paths: string[]): Promise<void> {
    const results = await Promise.all(
      paths.map(async (p) => {
        if (!p.endsWith('.jsonl') || p.endsWith('journal.jsonl')) return false;
        // Reads only the bytes appended since the last read, and only whole
        // lines: a half-written trailing line waits for the next read, so no
        // settle-and-retry is needed.
        const slug = this.slugForPath(p);
        return this.transcripts.update({
          path: p,
          projectSlug: slug,
          projectPath: prettifyProjectSlug(slug),
        });
      }),
    );
    if (results.some(Boolean)) {
      this.localScanStats = { ...this.localScanStats, files: this.transcripts.size };
      this.localUpdatedAt = this.now();
      this.officialScheduler.noteActivity();
      this.emitSnapshot();
    }
  }

  private slugForPath(p: string): string {
    const rel = path.relative(this.paths.projectsDir, p);
    return rel.split(path.sep)[0] ?? '';
  }

  private async readActiveSessions(): Promise<void> {
    try {
      const files = await walkFiles(this.paths.sessionsDir, (p) => p.endsWith('.json'));
      const sessions: ActiveSession[] = [];
      await Promise.all(
        files.map(async (f) => {
          const data = await readJsonSafe<Record<string, unknown>>(f.path);
          if (!data) return;
          sessions.push({
            pid: typeof data['pid'] === 'number' ? data['pid'] : 0,
            sessionId: typeof data['sessionId'] === 'string' ? data['sessionId'] : '',
            cwd: typeof data['cwd'] === 'string' ? data['cwd'] : '',
            startedAt: typeof data['startedAt'] === 'number' ? data['startedAt'] : 0,
            updatedAt: typeof data['updatedAt'] === 'number' ? data['updatedAt'] : 0,
            status: typeof data['status'] === 'string' ? data['status'] : 'unknown',
            version: typeof data['version'] === 'string' ? data['version'] : '',
          });
        }),
      );
      sessions.sort((a, b) => b.updatedAt - a.updatedAt);
      this.activeSessions = sessions;
    } catch {
      this.activeSessions = [];
    }
  }

  private allEntries(): UsageEntry[] {
    const byKey = new Map<string, UsageEntry>();
    for (const list of this.transcripts.entryLists()) {
      for (const entry of list) byKey.set(entry.key, entry);
    }
    return [...byKey.values()];
  }

  // ── Official data ─────────────────────────────────────────────────────────

  private scheduleOfficial(): void {
    this.officialScheduler.stop();
    if (!this.config.enableOfficial) {
      this.emitSnapshot();
      return;
    }
    this.officialScheduler.start(true);
  }

  private pollOfficial(reason: PollReason): Promise<void> {
    this.logger.debug(`Checking plan limits (${reason})`);
    // The scheduler enforces the minimum gap and backoff itself; maxAgeMs 0
    // stops the client re-serving its cache for a poll the scheduler chose.
    return this.refreshOfficial(reason === 'manual', 0);
  }

  async refreshOfficial(force: boolean, maxAgeMs?: number): Promise<void> {
    if (!this.config.enableOfficial) {
      this.health.officialOk = false;
      this.health.lastOfficialError = null;
      this.emitSnapshot();
      return;
    }
    try {
      const usage = await this.official.getUsage({ force, maxAgeMs });
      this.learnFrom(usage);
      this.health.officialOk = usage.status === 'ok' || (usage.available && !usage.stale);
      this.health.lastOfficialError = usage.status === 'ok' ? null : usage.message;
      await this.refreshMeta();
    } catch (err) {
      this.health.officialOk = false;
      this.health.lastOfficialError = err instanceof Error ? err.message : String(err);
      this.logger.error('Official refresh failed', err);
    }
    this.emitSnapshot();
  }

  /**
   * Folds a fresh official reading into the calibration, once per reading, and
   * logs how far the estimate shown just before it was from it (debug), which
   * is what tuning ESTIMATE_SAFETY needs.
   */
  private learnFrom(usage: OfficialUsage): void {
    if (usage.status !== 'ok' || usage.stale || !usage.available || usage.fetchedAt === null)
      return;
    if (usage.fetchedAt === this.calibratedAt) return;
    const at = usage.fetchedAt;
    this.calibratedAt = at;
    const entries = this.allEntries();
    const between = (from: number, to: number): number =>
      weightBetween(entries, from, to, this.pricing);
    let next = this.calibration;
    for (const w of usage.windows) {
      const shown = this.lastEstimates.get(w.key);
      // Reset times jitter by milliseconds between polls; minutes apart is a new window.
      const sameWindow =
        shown?.resetsAt != null &&
        w.resetsAt !== null &&
        Math.abs(shown.resetsAt - w.resetsAt) < 5 * 60_000;
      if (shown && sameWindow) {
        const error = (shown.utilization - w.utilization) * 100;
        this.logger.debug(
          `Limit estimate ${error > 0 ? 'overshot' : 'undershot'} by ${Math.abs(error).toFixed(1)} pts`,
          { key: w.key, estimated: shown.utilization, official: w.utilization },
        );
      }
      next = ingestReading(
        next,
        { key: w.key, utilization: w.utilization, resetsAt: w.resetsAt, at },
        between,
      );
    }
    this.lastEstimates.clear();
    if (next !== this.calibration) {
      this.calibration = next;
      this.calibrationStore?.save(next);
    }
  }

  /** Attaches a live estimate to each window that has one (see estimate.ts). */
  private withEstimates(
    windows: OfficialWindow[],
    readingAt: number,
    entries: readonly UsageEntry[],
    now: number,
  ): OfficialWindow[] {
    // Only the newest entries can count; find them once for every window.
    const earliest = Math.min(readingAt, ...windows.map((w) => w.resetsAt ?? Infinity));
    const recent = entries.filter((e) => e.timestamp > earliest);
    const weightSince = (from: number): number => {
      let sum = 0;
      for (const e of recent) if (e.timestamp > from) sum += usageWeight(e, this.pricing);
      return sum;
    };
    return windows.map((w) => {
      const estimate = estimateWindow({
        window: w,
        readingAt,
        now,
        rate: rateFor(this.calibration, w.key)?.k ?? null,
        weightSince,
      });
      if (estimate && !estimate.afterReset) {
        this.lastEstimates.set(w.key, { utilization: estimate.utilization, resetsAt: w.resetsAt });
      } else {
        this.lastEstimates.delete(w.key);
      }
      return estimate ? { ...w, estimate } : w;
    });
  }

  private officialSection(entries: readonly UsageEntry[], now: number): OfficialUsage {
    if (!this.config.enableOfficial) {
      return {
        status: 'disabled',
        available: false,
        stale: false,
        fetchedAt: null,
        nextFetchAt: null,
        windows: [],
        message: 'Plan-limit polling is off.',
        fix: null,
        // No detail: the UI's hint for this status already says how to turn it
        // on, and repeating it printed the same sentence twice in the panel.
        detail: null,
      };
    }
    const last = this.official.getLast();
    // The scheduler, not the client, knows when the next check really is.
    const planned = this.officialScheduler.nextPollAt;
    const section =
      planned !== null && last.nextFetchAt !== null ? { ...last, nextFetchAt: planned } : last;
    if (!section.available || section.fetchedAt === null) return section;
    return {
      ...section,
      windows: this.withEstimates(section.windows, section.fetchedAt, entries, now),
    };
  }

  private async refreshMeta(): Promise<void> {
    const creds = await readCredentials(this.paths.credentialsPath);
    this.meta = {
      subscriptionType: creds?.subscriptionType ?? null,
      rateLimitTier: creds?.rateLimitTier ?? null,
      organizationUuid: creds?.organizationUuid ?? null,
      claudeDir: this.paths.root,
      cliVersion: this.cliVersion,
    };
  }

  // ── Snapshot ────────────────────────────────────────────────────────────────

  private scheduleRescan(): void {
    if (this.rescanTimer) clearInterval(this.rescanTimer);
    this.rescanTimer = setInterval(() => {
      // Push only when the rescan actually found something the watcher missed.
      void this.fullRescan().then((changed) => {
        if (changed) this.emitSnapshot();
      });
    }, this.config.fullRescanIntervalMs);
    this.rescanTimer.unref?.();
  }

  getSnapshot(): UsageSnapshot {
    const now = this.now();
    const entries = this.allEntries();
    const local = buildLocalUsage(entries, {
      pricing: this.pricing,
      now,
      historyWindowHours: this.config.historyWindowHours,
      blockHours: this.config.blockHours,
      recentSessionLimit: this.config.recentSessionLimit,
      activeSessions: this.activeSessions,
      stats: this.localScanStats,
    });
    return {
      generatedAt: now,
      localUpdatedAt: this.localUpdatedAt,
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      local,
      official: this.officialSection(entries, now),
      meta: this.meta,
      health: { ...this.health },
    };
  }

  private emitSnapshot(): void {
    try {
      this.emit('snapshot', this.getSnapshot());
    } catch (err) {
      this.logger.error('Failed to build snapshot', err);
      this.emit('error', err instanceof Error ? err : new Error(String(err)));
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- intentional typed-emitter overloads for UsageEngine
export interface UsageEngine {
  on(event: 'snapshot', listener: (snapshot: UsageSnapshot) => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  off(event: 'snapshot', listener: (snapshot: UsageSnapshot) => void): this;
  off(event: 'error', listener: (error: Error) => void): this;
  emit(event: 'snapshot', snapshot: UsageSnapshot): boolean;
  emit(event: 'error', error: Error): boolean;
}
