/**
 * Shared domain types for the Claude usage widget.
 *
 * The {@link UsageSnapshot} is the single object every UI surface consumes. It is
 * intentionally plain-JSON serialisable so it can cross the Electron IPC boundary
 * (or a future VS Code webview boundary) without transformation.
 */

export type ModelId = string;

/** Raw token counts for a request or an aggregate. */
export interface TokenCounts {
  input: number;
  output: number;
  /** Cache-write (a.k.a. cache creation) tokens. */
  cacheCreation: number;
  /** Cache-read (cache hit) tokens. */
  cacheRead: number;
  /** input + output + cacheCreation + cacheRead. */
  total: number;
}

/** A single normalised usage event parsed from one transcript line. */
export interface UsageEntry {
  /** Composite dedup key (`messageId:requestId`) used to avoid double counting. */
  key: string;
  /** Event time in epoch milliseconds. */
  timestamp: number;
  model: ModelId;
  tokens: TokenCounts;
  sessionId: string;
  /** Best-effort decoded project path for display. */
  projectPath: string;
  /** Raw on-disk project directory slug. */
  projectSlug: string;
  /** True when the entry came from a subagent / sidechain transcript. */
  isSidechain: boolean;
  requestId: string | null;
  messageId: string | null;
}

/** Tokens + estimated cost + request count for an aggregate bucket. */
export interface TokenAndCost {
  tokens: TokenCounts;
  costUSD: number;
  count: number;
}

export interface ModelBreakdown extends TokenAndCost {
  model: ModelId;
  /** Friendly display name (e.g. "Opus 4.8"). */
  label: string;
}

export interface SessionStat extends TokenAndCost {
  sessionId: string;
  projectPath: string;
  projectSlug: string;
  firstAt: number;
  lastAt: number;
}

/** Per-project rollup across the full history (not sliced). */
export interface ProjectBreakdown extends TokenAndCost {
  projectPath: string;
  projectSlug: string;
}

/** A rolling usage window (Claude's ~5-hour session blocks, approximated locally). */
export interface UsageBlock extends TokenAndCost {
  startAt: number;
  endAt: number;
  lastActivityAt: number;
  isActive: boolean;
}

/** The currently-open block, enriched with burn-rate and projection figures. */
export interface ActiveBlockStat extends UsageBlock {
  elapsedMs: number;
  remainingMs: number;
  tokensPerMinute: number;
  projectedTokens: number;
  projectedCostUSD: number;
}

/** A fixed-width time bucket used for sparklines. */
export interface TimeBucket extends TokenAndCost {
  startAt: number;
}

/** A live Claude Code process detected from `~/.claude/sessions`. */
export interface ActiveSession {
  pid: number;
  sessionId: string;
  cwd: string;
  startedAt: number;
  updatedAt: number;
  status: string;
  version: string;
}

/** Everything derived locally from transcripts (works fully offline). */
export interface LocalUsage {
  allTime: TokenAndCost;
  today: TokenAndCost;
  /** Month-to-date (current calendar month, local time). */
  thisMonth: TokenAndCost;
  last24h: TokenAndCost;
  perModel: ModelBreakdown[];
  /** Per-project rollup across all history, sorted by cost desc. */
  perProject: ProjectBreakdown[];
  sessions: SessionStat[];
  blocks: UsageBlock[];
  activeBlock: ActiveBlockStat | null;
  /** Hourly token buckets across the history window, oldest first. */
  hourly: TimeBucket[];
  activeSessions: ActiveSession[];
  stats: { files: number; entries: number; scanDurationMs: number };
}

/** One rate-limit window returned by the official usage endpoint. */
export interface OfficialWindow {
  /** Stable machine key, e.g. `five_hour`, `seven_day`. */
  key: string;
  label: string;
  /** Fraction consumed, 0..1. */
  utilization: number;
  /** Percent consumed, 0..100. */
  usedPct: number;
  /** Percent remaining, 0..100. */
  remainingPct: number;
  /** Epoch ms when the window resets, or null if unknown. */
  resetsAt: number | null;
  used: number | null;
  limit: number | null;
}

export type OfficialStatus =
  | 'ok'
  | 'disabled'
  | 'no-credentials'
  | 'expired'
  | 'rate-limited'
  | 'unauthorized'
  | 'network-error'
  | 'parse-error'
  | 'never-fetched';

/** Official subscription usage from `api.anthropic.com/api/oauth/usage`. */
export interface OfficialUsage {
  status: OfficialStatus;
  /** True when there are windows to show (fresh or cached). */
  available: boolean;
  /** True when the shown data is cached after a failed/skipped refresh. */
  stale: boolean;
  fetchedAt: number | null;
  nextFetchAt: number | null;
  windows: OfficialWindow[];
  /** Human-readable explanation when `status !== 'ok'`. */
  message: string | null;
  /** Raw payload, included only when debug logging is enabled. */
  raw?: unknown;
}

export interface AccountMeta {
  subscriptionType: string | null;
  rateLimitTier: string | null;
  organizationUuid: string | null;
  /** Resolved `~/.claude` directory in use. */
  claudeDir: string;
  /** Claude Code CLI version (used for the official endpoint User-Agent). */
  cliVersion: string | null;
}

export interface SnapshotHealth {
  localOk: boolean;
  officialOk: boolean;
  lastLocalError: string | null;
  lastOfficialError: string | null;
}

/** The single object every UI surface renders. */
export interface UsageSnapshot {
  generatedAt: number;
  schemaVersion: number;
  local: LocalUsage;
  official: OfficialUsage;
  meta: AccountMeta;
  health: SnapshotHealth;
}

export const SNAPSHOT_SCHEMA_VERSION = 1;
