import type { TokenCounts, UsageEntry } from './types';

interface RawUsage {
  input_tokens?: unknown;
  output_tokens?: unknown;
  cache_creation_input_tokens?: unknown;
  cache_read_input_tokens?: unknown;
}

interface RawLine {
  type?: unknown;
  timestamp?: unknown;
  uuid?: unknown;
  requestId?: unknown;
  sessionId?: unknown;
  isSidechain?: unknown;
  message?: {
    id?: unknown;
    model?: unknown;
    usage?: RawUsage;
  };
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export interface ParseContext {
  projectSlug: string;
  projectPath: string;
}

/**
 * Parses a single transcript line into a {@link UsageEntry}, or returns null if
 * the line is not a billable assistant message (user turns, summaries, synthetic
 * messages, malformed JSON, and zero-token rows are all skipped).
 */
export function parseTranscriptLine(line: string, ctx: ParseContext): UsageEntry | null {
  const trimmed = line.trim();
  if (trimmed.length === 0 || trimmed.charCodeAt(0) !== 123 /* '{' */) return null;

  let obj: RawLine;
  try {
    obj = JSON.parse(trimmed) as RawLine;
  } catch {
    return null;
  }

  if (obj.type !== 'assistant') return null;
  const usage = obj.message?.usage;
  if (!usage || typeof usage !== 'object') return null;

  const model = typeof obj.message?.model === 'string' ? obj.message.model : 'unknown';
  if (model === '<synthetic>') return null;

  const input = num(usage.input_tokens);
  const output = num(usage.output_tokens);
  const cacheCreation = num(usage.cache_creation_input_tokens);
  const cacheRead = num(usage.cache_read_input_tokens);
  const total = input + output + cacheCreation + cacheRead;
  if (total === 0) return null;

  const tokens: TokenCounts = { input, output, cacheCreation, cacheRead, total };

  const parsedTs = typeof obj.timestamp === 'string' ? Date.parse(obj.timestamp) : NaN;
  const timestamp = Number.isFinite(parsedTs) ? parsedTs : Date.now();
  const messageId = typeof obj.message?.id === 'string' ? obj.message.id : null;
  const requestId = typeof obj.requestId === 'string' ? obj.requestId : null;
  const uuid = typeof obj.uuid === 'string' ? obj.uuid : null;
  const sessionId = typeof obj.sessionId === 'string' ? obj.sessionId : 'unknown';

  return {
    key: `${messageId ?? 'noid'}:${requestId ?? uuid ?? 'noreq'}`,
    timestamp,
    model,
    tokens,
    sessionId,
    projectPath: ctx.projectPath,
    projectSlug: ctx.projectSlug,
    isSidechain: obj.isSidechain === true,
    requestId,
    messageId,
  };
}

/** Parses every line of a JSONL transcript file's contents. */
export function parseTranscriptContent(content: string, ctx: ParseContext): UsageEntry[] {
  const entries: UsageEntry[] = [];
  for (const line of content.split('\n')) {
    const entry = parseTranscriptLine(line, ctx);
    if (entry) entries.push(entry);
  }
  return entries;
}
