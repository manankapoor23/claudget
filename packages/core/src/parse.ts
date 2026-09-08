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
  cwd?: unknown;
  gitBranch?: unknown;
  isSidechain?: unknown;
  message?: {
    id?: unknown;
    model?: unknown;
    usage?: RawUsage;
    content?: unknown;
  };
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export interface ParseContext {
  projectSlug: string;
  projectPath: string;
}

interface SessionMetadata {
  sessionTitle?: string | null;
  gitBranch?: string | null;
}

function parseRawLine(line: string): RawLine | null {
  const trimmed = line.trim();
  if (trimmed.length === 0 || trimmed.charCodeAt(0) !== 123 /* '{' */) return null;
  try {
    return JSON.parse(trimmed) as RawLine;
  } catch {
    return null;
  }
}

function textContent(content: unknown): string | null {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return null;
  const text = content
    .filter(
      (block): block is { type?: unknown; text?: unknown } =>
        typeof block === 'object' && block !== null,
    )
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text as string)
    .join(' ');
  return text || null;
}

/** Converts a user request into a compact, single-line session label. */
function sessionTitleFromRaw(obj: RawLine): string | null {
  if (obj.type !== 'user') return null;
  const raw = textContent(obj.message?.content);
  if (!raw || /<(?:command-name|local-command)/i.test(raw)) return null;
  const title = raw
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!title) return null;
  return title.length > 96 ? title.slice(0, 93).trimEnd() + '…' : title;
}

/**
 * Parses a single transcript line into a {@link UsageEntry}, or returns null if
 * the line is not a billable assistant message (user turns, summaries, synthetic
 * messages, malformed JSON, and zero-token rows are all skipped).
 */
export function parseTranscriptLine(
  line: string,
  ctx: ParseContext,
  metadata: SessionMetadata = {},
): UsageEntry | null {
  const obj = parseRawLine(line);
  if (!obj) return null;

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
  const projectPath =
    typeof obj.cwd === 'string' && obj.cwd.trim() ? obj.cwd.trim() : ctx.projectPath;
  const gitBranch =
    typeof obj.gitBranch === 'string' && obj.gitBranch.trim()
      ? obj.gitBranch.trim()
      : (metadata.gitBranch ?? null);

  return {
    key: `${messageId ?? 'noid'}:${requestId ?? uuid ?? 'noreq'}`,
    timestamp,
    model,
    tokens,
    sessionId,
    projectPath,
    projectSlug: ctx.projectSlug,
    isSidechain: obj.isSidechain === true,
    requestId,
    messageId,
    sessionTitle: metadata.sessionTitle ?? null,
    gitBranch,
  };
}

/** Parses every line of a JSONL transcript file's contents. */
export function parseTranscriptContent(content: string, ctx: ParseContext): UsageEntry[] {
  const entries: UsageEntry[] = [];
  let projectPath = ctx.projectPath;
  let sessionTitle: string | null = null;
  let gitBranch: string | null = null;
  for (const line of content.split('\n')) {
    const raw = parseRawLine(line);
    if (typeof raw?.cwd === 'string' && raw.cwd.trim()) projectPath = raw.cwd.trim();
    if (typeof raw?.gitBranch === 'string' && raw.gitBranch.trim()) {
      gitBranch = raw.gitBranch.trim();
    }
    sessionTitle ??= sessionTitleFromRaw(raw ?? {});
    const entry = parseTranscriptLine(line, { ...ctx, projectPath }, { sessionTitle, gitBranch });
    if (entry) entries.push(entry);
  }
  return entries;
}
