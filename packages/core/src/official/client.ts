import { readCredentials, type ClaudeCredentials } from '../credentials';
import type { Logger } from '../logger';
import type { OfficialStatus, OfficialUsage, OfficialWindow } from '../types';
import { normalizeOfficialPayload } from './normalize';

const DEFAULT_ENDPOINT = 'https://api.anthropic.com/api/oauth/usage';
const REQUEST_TIMEOUT_MS = 10_000;
const BASE_BACKOFF_MS = 60_000;
const MAX_BACKOFF_MS = 30 * 60_000;

export interface OfficialClientOptions {
  credentialsPath: string;
  cliVersion: string | null;
  pollIntervalMs: number;
  logger: Logger;
  endpoint?: string;
  /** Injectable for tests. Defaults to global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Injectable clock. Defaults to `Date.now`. */
  now?: () => number;
  /** When true, the raw payload is attached to results (debug only). */
  includeRaw?: boolean;
}

/**
 * Polls the official OAuth usage endpoint with the credentials Claude Code keeps
 * on disk. Designed around the endpoint's aggressive rate limiting:
 *  - the required `User-Agent: claude-code/<version>` header is always sent,
 *  - results are cached and re-served between polls,
 *  - 429/401/5xx responses trigger exponential backoff and keep prior data,
 *  - the access token is read fresh on every call (Claude Code rotates it) and
 *    is never logged.
 */
export class OfficialUsageClient {
  private readonly logger: Logger;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly endpoint: string;
  private readonly includeRaw: boolean;

  private credentialsPath: string;
  private cliVersion: string | null;
  private pollIntervalMs: number;

  private last: OfficialUsage = {
    status: 'never-fetched',
    available: false,
    stale: false,
    fetchedAt: null,
    nextFetchAt: null,
    windows: [],
    message: null,
  };
  private lastWindows: OfficialWindow[] = [];
  private lastSuccessAt = 0;
  private backoffUntil = 0;
  private failures = 0;

  constructor(opts: OfficialClientOptions) {
    this.logger = opts.logger.child('official');
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
    this.now = opts.now ?? ((): number => Date.now());
    this.endpoint = opts.endpoint ?? DEFAULT_ENDPOINT;
    this.includeRaw = opts.includeRaw ?? false;
    this.credentialsPath = opts.credentialsPath;
    this.cliVersion = opts.cliVersion;
    this.pollIntervalMs = opts.pollIntervalMs;
  }

  getLast(): OfficialUsage {
    return this.last;
  }

  setOptions(patch: {
    pollIntervalMs?: number;
    credentialsPath?: string;
    cliVersion?: string | null;
  }): void {
    if (patch.pollIntervalMs) this.pollIntervalMs = patch.pollIntervalMs;
    if (patch.credentialsPath) this.credentialsPath = patch.credentialsPath;
    if (patch.cliVersion !== undefined) this.cliVersion = patch.cliVersion;
  }

  /** Returns cached data when within the poll window / backoff, else fetches. */
  async getUsage(options: { force?: boolean } = {}): Promise<OfficialUsage> {
    const now = this.now();
    const force = options.force ?? false;

    if (!force && this.lastSuccessAt > 0 && now - this.lastSuccessAt < this.pollIntervalMs) {
      return this.serveCached('ok', false, null, now);
    }
    if (!force && now < this.backoffUntil) {
      return this.serveCached('rate-limited', true, 'Backing off after rate limiting.', now);
    }
    return this.fetchNow(now);
  }

  private nextFetchAt(now: number): number {
    if (now < this.backoffUntil) return this.backoffUntil;
    if (this.lastSuccessAt > 0) return this.lastSuccessAt + this.pollIntervalMs;
    return now;
  }

  private serveCached(
    status: OfficialStatus,
    stale: boolean,
    message: string | null,
    now: number,
  ): OfficialUsage {
    const available = this.lastWindows.length > 0;
    const result: OfficialUsage = {
      status: available ? status : 'never-fetched',
      available,
      stale: available ? stale : false,
      fetchedAt: this.lastSuccessAt || null,
      nextFetchAt: this.nextFetchAt(now),
      windows: this.lastWindows,
      message,
    };
    this.last = result;
    return result;
  }

  private bumpBackoff(now: number): void {
    this.failures += 1;
    this.backoffUntil = now + Math.min(BASE_BACKOFF_MS * 2 ** this.failures, MAX_BACKOFF_MS);
  }

  private async fetchNow(now: number): Promise<OfficialUsage> {
    const creds = await readCredentials(this.credentialsPath);
    if (!creds) return this.fail('no-credentials', 'No Claude credentials found.', now, false);
    if (creds.expiresAt > 0 && creds.expiresAt <= now) {
      return this.fail('expired', 'Access token expired — run Claude Code to refresh.', now, false);
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      let res: Response;
      try {
        res = await this.fetchImpl(this.endpoint, {
          method: 'GET',
          headers: this.buildHeaders(creds),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }

      if (res.status === 429) {
        const retryAfter = this.parseRetryAfter(res, now);
        this.bumpBackoff(now);
        if (retryAfter) this.backoffUntil = Math.max(this.backoffUntil, retryAfter);
        this.logger.warn(
          `Rate limited (429); backing off until ${new Date(this.backoffUntil).toISOString()}`,
        );
        return this.serveCached('rate-limited', true, 'Rate limited by the usage endpoint.', now);
      }
      if (res.status === 401 || res.status === 403) {
        this.bumpBackoff(now);
        return this.fail('unauthorized', `Usage endpoint returned ${res.status}.`, now, true);
      }
      if (!res.ok) {
        this.bumpBackoff(now);
        return this.fail('network-error', `Usage endpoint returned ${res.status}.`, now, true);
      }

      let payload: unknown;
      try {
        payload = await res.json();
      } catch {
        this.bumpBackoff(now);
        return this.fail('parse-error', 'Usage response was not valid JSON.', now, true);
      }

      this.logger.debug('Official usage payload received', this.includeRaw ? payload : undefined);
      const windows = normalizeOfficialPayload(payload, now);
      if (windows.length === 0) {
        this.bumpBackoff(now);
        this.logger.warn('No usage windows could be mapped from the payload.');
        return this.fail(
          'parse-error',
          'No recognisable limits in usage response.',
          now,
          true,
          payload,
        );
      }

      this.failures = 0;
      this.backoffUntil = 0;
      this.lastWindows = windows;
      this.lastSuccessAt = now;
      const result: OfficialUsage = {
        status: 'ok',
        available: true,
        stale: false,
        fetchedAt: now,
        nextFetchAt: now + this.pollIntervalMs,
        windows,
        message: null,
        ...(this.includeRaw ? { raw: payload } : {}),
      };
      this.last = result;
      return result;
    } catch (err) {
      this.bumpBackoff(now);
      const message =
        err instanceof Error && err.name === 'AbortError'
          ? 'Usage request timed out.'
          : err instanceof Error
            ? err.message
            : 'Network error.';
      return this.fail('network-error', message, now, true);
    }
  }

  private buildHeaders(creds: ClaudeCredentials): Record<string, string> {
    return {
      // The User-Agent is REQUIRED — without it the endpoint throttles hard.
      'User-Agent': `claude-code/${this.cliVersion ?? 'unknown'}`,
      Authorization: `Bearer ${creds.accessToken}`,
      Accept: 'application/json',
      'anthropic-beta': 'oauth-2025-04-20',
    };
  }

  private parseRetryAfter(res: Response, now: number): number | null {
    const header = res.headers.get('retry-after');
    if (!header) return null;
    const secs = Number(header);
    if (Number.isFinite(secs)) return now + secs * 1000;
    const date = Date.parse(header);
    return Number.isFinite(date) ? date : null;
  }

  private fail(
    status: OfficialStatus,
    message: string,
    now: number,
    keepWindows: boolean,
    raw?: unknown,
  ): OfficialUsage {
    const windows = keepWindows ? this.lastWindows : [];
    const available = windows.length > 0;
    const result: OfficialUsage = {
      status,
      available,
      stale: available,
      fetchedAt: this.lastSuccessAt || null,
      nextFetchAt: this.nextFetchAt(now),
      windows,
      message,
      ...(this.includeRaw && raw !== undefined ? { raw } : {}),
    };
    this.last = result;
    this.logger.debug(`Official fetch → ${status}: ${message}`);
    return result;
  }
}
