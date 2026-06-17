import { EventEmitter } from 'node:events';
import path from 'node:path';
import { buildLocalUsage } from './aggregate';
import { mergeConfig, type WidgetConfig } from './config';
import { readCredentials } from './credentials';
import { discoverTranscripts } from './discover';
import { createLogger, type Logger } from './logger';
import { OfficialUsageClient } from './official';
import { parseTranscriptContent } from './parse';
import { claudePaths, prettifyProjectSlug, type ClaudePaths } from './paths';
import { DEFAULT_PRICING, type PricingTable } from './pricing';
import {
  SNAPSHOT_SCHEMA_VERSION,
  type AccountMeta,
  type ActiveSession,
  type OfficialUsage,
  type SnapshotHealth,
  type UsageEntry,
  type UsageSnapshot,
} from './types';
import { readFileSafe, readJsonSafe, walkFiles } from './util/fs';
import { watchTranscripts, type TranscriptWatcher } from './watch';

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
}

/**
 * Owns all data acquisition and produces {@link UsageSnapshot}s. It maintains an
 * in-memory, per-file map of parsed entries so a single file change re-parses
 * only that file; a periodic full rescan catches new projects and missed events.
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

  private fileEntries = new Map<string, UsageEntry[]>();
  private activeSessions: ActiveSession[] = [];
  private meta: AccountMeta;
  private health: SnapshotHealth = {
    localOk: false,
    officialOk: false,
    lastLocalError: null,
    lastOfficialError: null,
  };
  private localScanStats = { files: 0, scanDurationMs: 0 };

  private watcher: TranscriptWatcher | null = null;
  private officialTimer: NodeJS.Timeout | null = null;
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
    this.scheduleOfficial(true);
    this.emitSnapshot();
  }

  async stop(): Promise<void> {
    this.started = false;
    if (this.officialTimer) clearInterval(this.officialTimer);
    if (this.rescanTimer) clearInterval(this.rescanTimer);
    this.officialTimer = null;
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
      if (this.started) this.scheduleOfficial(false);
    }
    if (this.config.enableOfficial !== prev.enableOfficial && this.started) {
      this.scheduleOfficial(this.config.enableOfficial);
    }
    if (this.config.fullRescanIntervalMs !== prev.fullRescanIntervalMs && this.started) {
      this.scheduleRescan();
    }

    this.emitSnapshot();
    return this.config;
  }

  /** Forces an immediate full local rescan and official refresh. */
  async refresh(): Promise<void> {
    await this.fullRescan();
    await this.refreshOfficial(true);
  }

  // ── Local data ──────────────────────────────────────────────────────────────

  private startWatcher(): void {
    this.watcher = watchTranscripts(
      this.paths.projectsDir,
      (paths) => void this.handleChange(paths),
      { debounceMs: this.config.localDebounceMs, logger: this.logger },
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

  async fullRescan(): Promise<void> {
    const started = this.now();
    try {
      const files = await discoverTranscripts(this.paths.projectsDir);
      const map = new Map<string, UsageEntry[]>();
      await Promise.all(
        files.map(async (f) => {
          const content = await readFileSafe(f.path);
          if (content === null) return;
          map.set(
            f.path,
            parseTranscriptContent(content, {
              projectSlug: f.projectSlug,
              projectPath: f.projectPath,
            }),
          );
        }),
      );
      this.fileEntries = map;
      await this.readActiveSessions();
      await this.refreshMeta();
      this.localScanStats = { files: files.length, scanDurationMs: this.now() - started };
      this.health.localOk = true;
      this.health.lastLocalError = null;
      this.logger.debug(
        `Full rescan complete: ${files.length} files in ${this.localScanStats.scanDurationMs}ms`,
      );
    } catch (err) {
      this.health.localOk = false;
      this.health.lastLocalError = err instanceof Error ? err.message : String(err);
      this.logger.error('Full rescan failed', err);
    }
  }

  private async handleChange(paths: string[]): Promise<void> {
    let changed = false;
    await Promise.all(
      paths.map(async (p) => {
        if (!p.endsWith('.jsonl') || p.endsWith('journal.jsonl')) return;
        const content = await readFileSafe(p);
        if (content === null) {
          if (this.fileEntries.delete(p)) changed = true;
          return;
        }
        const slug = this.slugForPath(p);
        this.fileEntries.set(
          p,
          parseTranscriptContent(content, {
            projectSlug: slug,
            projectPath: prettifyProjectSlug(slug),
          }),
        );
        changed = true;
      }),
    );
    if (changed) {
      this.localScanStats = { ...this.localScanStats, files: this.fileEntries.size };
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
    for (const list of this.fileEntries.values()) {
      for (const entry of list) byKey.set(entry.key, entry);
    }
    return [...byKey.values()];
  }

  // ── Official data ─────────────────────────────────────────────────────────

  private scheduleOfficial(immediate: boolean): void {
    if (this.officialTimer) {
      clearInterval(this.officialTimer);
      this.officialTimer = null;
    }
    if (!this.config.enableOfficial) {
      this.emitSnapshot();
      return;
    }
    if (immediate) void this.refreshOfficial(false);
    this.officialTimer = setInterval(
      () => void this.refreshOfficial(false),
      this.config.officialPollIntervalMs,
    );
    this.officialTimer.unref?.();
  }

  async refreshOfficial(force: boolean): Promise<void> {
    if (!this.config.enableOfficial) {
      this.health.officialOk = false;
      this.health.lastOfficialError = null;
      this.emitSnapshot();
      return;
    }
    try {
      const usage = await this.official.getUsage({ force });
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

  private officialSection(): OfficialUsage {
    if (!this.config.enableOfficial) {
      return {
        status: 'disabled',
        available: false,
        stale: false,
        fetchedAt: null,
        nextFetchAt: null,
        windows: [],
        message: 'Official usage polling is disabled.',
      };
    }
    return this.official.getLast();
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
      void this.fullRescan().then(() => this.emitSnapshot());
    }, this.config.fullRescanIntervalMs);
    this.rescanTimer.unref?.();
  }

  getSnapshot(): UsageSnapshot {
    const now = this.now();
    const local = buildLocalUsage(this.allEntries(), {
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
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      local,
      official: this.officialSection(),
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
