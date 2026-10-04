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
  if (title.length <= 96) return title;
  // A slice would keep the whole (possibly huge, pasted) message alive for as
  // long as the title lives; copy the few characters we keep instead.
  return Buffer.from(title.slice(0, 93).trimEnd() + '…', 'utf8').toString('utf8');
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
  return obj ? entryFromRaw(obj, ctx, metadata) : null;
}

function entryFromRaw(
  obj: RawLine,
  ctx: ParseContext,
  metadata: SessionMetadata,
): UsageEntry | null {
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

/**
 * A transcript parser that carries the running per-file context (latest cwd,
 * git branch, first user request) between lines, so a file can be parsed in
 * pieces: the engine reads only the bytes appended since its last read.
 * Feeding it every line of a file gives exactly {@link parseTranscriptContent}.
 */
export interface TranscriptParser {
  /** Parses one line; returns its usage entry if it is a billable one. */
  line(text: string): UsageEntry | null;
  /** True until the session's title (its first real user request) is known. */
  wantsTitle(): boolean;
  /**
   * Takes only the context (cwd, git branch) from parts of a line that can't
   * be a usage entry, without parsing it — see {@link skimHead}.
   */
  skim(text: string): void;
}

const CWD_RE = /"cwd":"((?:[^"\\]|\\.)*)"/;
const BRANCH_RE = /"gitBranch":"((?:[^"\\]|\\.)*)"/;

function jsonString(m: RegExpExecArray | null): string | null {
  if (!m) return null;
  try {
    const s = (JSON.parse(`"${m[1]}"`) as string).trim();
    return s || null;
  } catch {
    return null;
  }
}

/**
 * Best-effort cwd and gitBranch from part of a transcript line, without
 * parsing it. A field inside a JSON string value can't match (its quotes are
 * escaped). Used for the huge lines (pasted images, long tool output) that
 * carry no usage: JSON-parsing multi-megabyte lines just for two short fields
 * was most of the cost of a scan. Those fields only fill in for usage lines
 * that lack their own, and current Claude Code writes them on every one.
 */
export function skimHead(head: string): { cwd: string | null; gitBranch: string | null } {
  return { cwd: jsonString(CWD_RE.exec(head)), gitBranch: jsonString(BRANCH_RE.exec(head)) };
}

export function createTranscriptParser(ctx: ParseContext): TranscriptParser {
  let projectPath = ctx.projectPath;
  let sessionTitle: string | null = null;
  let gitBranch: string | null = null;
  return {
    wantsTitle: () => sessionTitle === null,
    skim(head) {
      const meta = skimHead(head);
      if (meta.cwd) projectPath = meta.cwd;
      if (meta.gitBranch) gitBranch = meta.gitBranch;
    },
    line(text) {
      // One JSON.parse per line: lines can be megabytes (tool output), and
      // this used to parse every line twice.
      const raw = parseRawLine(text);
      if (!raw) return null;
      if (typeof raw.cwd === 'string' && raw.cwd.trim()) projectPath = raw.cwd.trim();
      if (typeof raw.gitBranch === 'string' && raw.gitBranch.trim()) {
        gitBranch = raw.gitBranch.trim();
      }
      sessionTitle ??= sessionTitleFromRaw(raw);
      return entryFromRaw(raw, { ...ctx, projectPath }, { sessionTitle, gitBranch });
    },
  };
}

/** Parses every line of a JSONL transcript file's contents. */
export function parseTranscriptContent(content: string, ctx: ParseContext): UsageEntry[] {
  const parser = createTranscriptParser(ctx);
  const entries: UsageEntry[] = [];
  for (const line of content.split('\n')) {
    const entry = parser.line(line);
    if (entry) entries.push(entry);
  }
  return entries;
}
