import { estimateCost, modelLabel, normalizeModelId, type PricingTable } from './pricing';
import type {
  ActiveBlockStat,
  ActiveSession,
  LocalUsage,
  ModelBreakdown,
  ProjectBreakdown,
  SessionStat,
  TimeBucket,
  TokenAndCost,
  TokenCounts,
  UsageBlock,
  UsageEntry,
} from './types';
import { DAY, HOUR, MINUTE, clamp, safeDiv, startOfDay, startOfHour, startOfMonth } from './util/time';

export function emptyTokens(): TokenCounts {
  return { input: 0, output: 0, cacheCreation: 0, cacheRead: 0, total: 0 };
}

function addTokensInto(target: TokenCounts, src: TokenCounts): void {
  target.input += src.input;
  target.output += src.output;
  target.cacheCreation += src.cacheCreation;
  target.cacheRead += src.cacheRead;
  target.total += src.total;
}

function emptyTAC(): TokenAndCost {
  return { tokens: emptyTokens(), costUSD: 0, count: 0 };
}

function accumulate(tac: TokenAndCost, entry: UsageEntry, pricing: PricingTable): void {
  addTokensInto(tac.tokens, entry.tokens);
  tac.costUSD += estimateCost(entry.tokens, entry.model, pricing).costUSD;
  tac.count += 1;
}

export interface AggregateOptions {
  pricing: PricingTable;
  /** "Now" in epoch ms (injectable for tests). */
  now: number;
  historyWindowHours: number;
  blockHours: number;
  recentSessionLimit: number;
  activeSessions: ActiveSession[];
  stats: { files: number; scanDurationMs: number };
}

/**
 * Builds the complete local usage view from a flat list of (de-duplicated)
 * usage entries. Pure and synchronous so it is trivial to unit test.
 */
export function buildLocalUsage(entries: UsageEntry[], opts: AggregateOptions): LocalUsage {
  const { pricing, now, blockHours } = opts;
  const sorted = [...entries].sort((a, b) => a.timestamp - b.timestamp);

  const allTime = emptyTAC();
  const today = emptyTAC();
  const thisMonth = emptyTAC();
  const last24h = emptyTAC();
  const dayStart = startOfDay(now);
  const monthStart = startOfMonth(now);
  const since24 = now - DAY;
  const historyStart = startOfHour(now - opts.historyWindowHours * HOUR);

  const perModelMap = new Map<string, ModelBreakdown>();
  const perProjectMap = new Map<string, ProjectBreakdown>();
  const sessionMap = new Map<string, SessionStat>();
  const hourlyMap = new Map<number, TimeBucket>();

  for (const e of sorted) {
    accumulate(allTime, e, pricing);
    if (e.timestamp >= dayStart) accumulate(today, e, pricing);
    if (e.timestamp >= monthStart) accumulate(thisMonth, e, pricing);
    if (e.timestamp >= since24) accumulate(last24h, e, pricing);

    let pb = perProjectMap.get(e.projectSlug);
    if (!pb) {
      pb = { projectPath: e.projectPath, projectSlug: e.projectSlug, ...emptyTAC() };
      perProjectMap.set(e.projectSlug, pb);
    }
    accumulate(pb, e, pricing);

    const norm = normalizeModelId(e.model) || e.model;
    let mb = perModelMap.get(norm);
    if (!mb) {
      mb = { model: norm, label: modelLabel(e.model), ...emptyTAC() };
      perModelMap.set(norm, mb);
    }
    accumulate(mb, e, pricing);

    let s = sessionMap.get(e.sessionId);
    if (!s) {
      s = {
        sessionId: e.sessionId,
        projectPath: e.projectPath,
        projectSlug: e.projectSlug,
        firstAt: e.timestamp,
        lastAt: e.timestamp,
        ...emptyTAC(),
      };
      sessionMap.set(e.sessionId, s);
    }
    s.firstAt = Math.min(s.firstAt, e.timestamp);
    s.lastAt = Math.max(s.lastAt, e.timestamp);
    accumulate(s, e, pricing);

    if (e.timestamp >= historyStart) {
      const h = startOfHour(e.timestamp);
      let b = hourlyMap.get(h);
      if (!b) {
        b = { startAt: h, ...emptyTAC() };
        hourlyMap.set(h, b);
      }
      accumulate(b, e, pricing);
    }
  }

  const blocks = buildBlocks(sorted, pricing, blockHours, now);
  const activeBlock = buildActiveBlock(blocks, blockHours, now);

  const hourly: TimeBucket[] = [];
  const lastHour = startOfHour(now);
  for (let t = historyStart; t <= lastHour; t += HOUR) {
    hourly.push(hourlyMap.get(t) ?? { startAt: t, ...emptyTAC() });
  }

  const perModel = [...perModelMap.values()].sort((a, b) => b.tokens.total - a.tokens.total);
  const perProject = [...perProjectMap.values()].sort((a, b) => b.costUSD - a.costUSD);
  const sessions = [...sessionMap.values()]
    .sort((a, b) => b.lastAt - a.lastAt)
    .slice(0, opts.recentSessionLimit);

  return {
    allTime,
    today,
    thisMonth,
    last24h,
    perModel,
    perProject,
    sessions,
    blocks: [...blocks].reverse(),
    activeBlock,
    hourly,
    activeSessions: opts.activeSessions,
    stats: {
      files: opts.stats.files,
      entries: entries.length,
      scanDurationMs: opts.stats.scanDurationMs,
    },
  };
}

/**
 * Groups entries into rolling usage blocks (Claude's ~5h session windows). A new
 * block opens when the window length elapses since the block start, or when the
 * gap since the last activity exceeds the window length.
 */
function buildBlocks(
  sortedAsc: UsageEntry[],
  pricing: PricingTable,
  blockHours: number,
  now: number,
): UsageBlock[] {
  const blocks: UsageBlock[] = [];
  const blockMs = blockHours * HOUR;
  let current: UsageBlock | null = null;

  for (const e of sortedAsc) {
    let block: UsageBlock | null = current;
    if (
      block === null ||
      e.timestamp >= block.startAt + blockMs ||
      e.timestamp - block.lastActivityAt > blockMs
    ) {
      const startAt = startOfHour(e.timestamp);
      block = {
        startAt,
        endAt: startAt + blockMs,
        lastActivityAt: e.timestamp,
        isActive: false,
        ...emptyTAC(),
      };
      blocks.push(block);
      current = block;
    }
    // `block` is provably non-null here: the guard's false branch implies it.
    accumulate(block, e, pricing);
    block.lastActivityAt = e.timestamp;
  }

  for (const b of blocks) {
    b.isActive = now >= b.startAt && now < b.endAt;
  }
  return blocks;
}

function buildActiveBlock(
  blocks: UsageBlock[],
  blockHours: number,
  now: number,
): ActiveBlockStat | null {
  const active = blocks.find((b) => b.isActive);
  if (!active) return null;
  const blockMs = blockHours * HOUR;
  const elapsedMs = clamp(now - active.startAt, 0, blockMs);
  const remainingMs = clamp(active.endAt - now, 0, blockMs);
  const tokensPerMinute = safeDiv(active.tokens.total, elapsedMs / MINUTE);
  const projectedTokens = Math.round(tokensPerMinute * (blockMs / MINUTE));
  const projectedCostUSD = safeDiv(active.costUSD, elapsedMs) * blockMs;
  return { ...active, elapsedMs, remainingMs, tokensPerMinute, projectedTokens, projectedCostUSD };
}
