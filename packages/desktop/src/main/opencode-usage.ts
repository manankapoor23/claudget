import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import type { DatabaseSync as SqliteDatabase } from 'node:sqlite';
import type { OpenCodeUsage, OpenCodeUsageBucket, OpenCodeUsageModel } from '../shared/ipc';

type SqlRow = Record<string, unknown>;
type SqliteReader = {
  all(sql: string, ...parameters: (string | number)[]): SqlRow[];
  close(): void;
};
type SqliteFactory = (databasePath: string) => SqliteReader;
type DatabaseSyncConstructor = new (
  location: string,
  options?: { readOnly?: boolean; allowExtension?: boolean },
) => SqliteDatabase;

interface OpenCodeScannerOptions {
  environment?: NodeJS.ProcessEnv;
  homeDirectory?: string;
  platform?: NodeJS.Platform;
  sqliteFactory?: SqliteFactory;
  now?: () => number;
}

interface UsageEvent {
  id: string;
  sessionId: string;
  timestamp: number;
  model: string;
  tokens: { input: number; output: number; cacheRead: number; cacheWrite: number };
  costUSD: number | null;
}

let defaultCache: { key: string; usage: OpenCodeUsage } | null = null;

const emptyBucket = (): OpenCodeUsageBucket => ({
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  total: 0,
  costUSD: null,
  count: 0,
});

const openReadOnly: SqliteFactory = (databasePath) => {
  const { DatabaseSync } = createRequire(path.join(process.cwd(), 'package.json'))(
    'node:sqlite',
  ) as { DatabaseSync: DatabaseSyncConstructor };
  const db = new DatabaseSync(databasePath, { readOnly: true, allowExtension: false });
  db.exec('PRAGMA query_only = ON; PRAGMA busy_timeout = 250;');
  return {
    all: (sql, ...parameters) => db.prepare(sql).all(...parameters) as SqlRow[],
    close: () => db.close(),
  };
};

/** Reads only structured token/cost metadata from OpenCode's local database. */
export function scanOpenCodeUsage(options: OpenCodeScannerOptions = {}): OpenCodeUsage {
  const now = options.now?.() ?? Date.now();
  const dbPath = findDatabase(options);
  if (!dbPath) {
    return {
      status: 'not-found',
      allTime: emptyBucket(),
      today: emptyBucket(),
      models: [],
      granularity: null,
      message:
        'OpenCode local history was not found. Run OpenCode once to create its local database.',
      updatedAt: null,
    };
  }

  const cacheKey = defaultCacheKey(dbPath, now);
  const canCache =
    !options.environment &&
    !options.homeDirectory &&
    !options.platform &&
    !options.sqliteFactory &&
    !options.now;
  if (canCache && defaultCache?.key === cacheKey) return defaultCache.usage;

  let db: SqliteReader | undefined;
  try {
    db = (options.sqliteFactory ?? openReadOnly)(dbPath);
    const tables = new Set(
      db
        .all("SELECT name FROM sqlite_master WHERE type = 'table'")
        .map((row) => asText(row.name))
        .filter((name): name is string => name !== null),
    );
    if (!tables.has('message')) throw new Error('OpenCode message history table is missing');

    const messages = readAssistantMessages(db);
    const steps = readStepUsage(db, tables, messages);
    const events = chooseUsageEvents(messages, steps, tables, db);
    const allTime = emptyBucket();
    const today = emptyBucket();
    const models = new Map<string, OpenCodeUsageModel>();
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);

    for (const event of events) {
      addUsage(allTime, event);
      if (event.timestamp >= dayStart.getTime()) addUsage(today, event);
      const model = models.get(event.model) ?? {
        model: event.model,
        ...emptyBucket(),
      };
      addUsage(model, event);
      models.set(event.model, model);
    }

    const usage: OpenCodeUsage = {
      status: 'available',
      allTime,
      today,
      models: [...models.values()].sort((a, b) => b.total - a.total).slice(0, 8),
      granularity: events.some((event) => event.id.startsWith('session:')) ? 'session' : 'request',
      message: events.length === 0 ? 'No saved OpenCode token usage was found yet.' : null,
      updatedAt: now,
    };
    if (canCache) defaultCache = { key: cacheKey, usage };
    return usage;
  } catch {
    const usage: OpenCodeUsage = {
      status: 'error',
      allTime: emptyBucket(),
      today: emptyBucket(),
      models: [],
      granularity: null,
      message:
        "OpenCode's local database could not be read. Refresh after OpenCode has saved its latest data.",
      updatedAt: null,
    };
    if (canCache) defaultCache = { key: cacheKey, usage };
    return usage;
  } finally {
    db?.close();
  }
}

function findDatabase(options: OpenCodeScannerOptions): string | null {
  const env = options.environment ?? process.env;
  const home = options.homeDirectory ?? os.homedir();
  const platform = options.platform ?? process.platform;
  const dataOverride = nonEmpty(env.OPENCODE_DATA_DIR) ?? nonEmpty(env.OPENCODE_DATA);
  const xdgDataHome = nonEmpty(env.XDG_DATA_HOME);
  const roots = dataOverride
    ? [path.resolve(dataOverride)]
    : [
        ...(xdgDataHome ? [path.join(xdgDataHome, 'opencode')] : []),
        path.join(home, '.local', 'share', 'opencode'),
        ...(platform === 'darwin'
          ? [path.join(home, 'Library', 'Application Support', 'opencode')]
          : platform === 'win32'
            ? [
                path.join(
                  nonEmpty(env.APPDATA) ?? path.join(home, 'AppData', 'Roaming'),
                  'opencode',
                ),
              ]
            : [path.join(home, '.local', 'share', 'opencode')]),
        path.join(home, '.opencode'),
      ];
  const explicitDatabase = nonEmpty(env.OPENCODE_DB);
  if (explicitDatabase) {
    if (explicitDatabase === ':memory:') return null;
    const base = roots[0] ?? path.join(home, '.local', 'share', 'opencode');
    const candidate = path.isAbsolute(explicitDatabase)
      ? explicitDatabase
      : path.join(base, explicitDatabase);
    return isFile(candidate) ? candidate : null;
  }

  const channel = nonEmpty(env.OPENCODE_CHANNEL)?.replace(/[^a-zA-Z0-9._-]/g, '-');
  for (const root of [...new Set(roots)]) {
    if (channel) {
      const channelDatabase = path.join(root, `opencode-${channel}.db`);
      if (isFile(channelDatabase)) return channelDatabase;
    }
    try {
      const candidates = fs
        .readdirSync(root)
        .filter((name) => name === 'opencode.db' || /^opencode-.+\.db$/u.test(name))
        .map((name) => path.join(root, name))
        .filter(isFile);
      candidates.sort((a, b) => databaseModifiedAt(b) - databaseModifiedAt(a));
      if (candidates[0]) return candidates[0];
    } catch {
      // Missing or inaccessible candidate directory; continue to the next default.
    }
  }
  return null;
}

function isFile(filename: string): boolean {
  try {
    return fs.statSync(filename).isFile();
  } catch {
    return false;
  }
}

function databaseModifiedAt(filename: string): number {
  const modifiedAt = (target: string): number => {
    try {
      return fs.statSync(target).mtimeMs;
    } catch {
      return 0;
    }
  };
  return Math.max(modifiedAt(filename), modifiedAt(`${filename}-wal`));
}

function readAssistantMessages(db: SqliteReader): Map<string, UsageEvent> {
  const columns = tableColumns(db, 'message');
  if (!columns.has('id') || !columns.has('data')) return new Map();
  const selected = ['id', 'session_id', 'time_created', 'data'].filter((column) =>
    columns.has(column),
  );
  // OpenCode stores message parts separately. Restrict this query to assistant
  // metadata; user message rows and their content are never returned.
  const rows = db.all(
    `SELECT ${selected.join(', ')} FROM message WHERE json_extract(data, '$.role') = 'assistant'`,
  );
  const messages = new Map<string, UsageEvent>();
  for (const row of rows) {
    const data = asObject(row.data);
    if (!data) continue;
    const id = asText(row.id) ?? asText(data.id);
    const sessionId = asText(row.session_id) ?? asText(data.sessionID) ?? 'unknown';
    const timestamp = asTimestamp(nested(data, 'time')?.created ?? row.time_created);
    if (!id || timestamp === null) continue;
    const event = usageEvent(id, sessionId, timestamp, data);
    if (event) messages.set(id, event);
  }
  return messages;
}

function readStepUsage(
  db: SqliteReader,
  tables: Set<string>,
  messages: Map<string, UsageEvent>,
): UsageEvent[] {
  if (!tables.has('part')) return [...messages.values()];
  const columns = tableColumns(db, 'part');
  if (!['id', 'message_id', 'data'].every((column) => columns.has(column))) {
    return [...messages.values()];
  }
  const selected = ['id', 'message_id', 'time_created', 'data'].filter((column) =>
    columns.has(column),
  );
  // Read only step-finish records, never text/tool parts containing prompts or responses.
  const rows = db.all(
    `SELECT ${selected.join(', ')} FROM part WHERE json_extract(data, '$.type') = 'step-finish'`,
  );
  const events: UsageEvent[] = [];
  const messageIdsWithUsage = new Set<string>();
  for (const row of rows) {
    const data = asObject(row.data);
    const messageId = asText(row.message_id) ?? (data ? asText(data.messageID) : null);
    const parent = messageId ? messages.get(messageId) : undefined;
    if (!data || !parent || !messageId) continue;
    const usage = usageEvent(
      `step:${asText(row.id) ?? events.length}`,
      parent.sessionId,
      asTimestamp(nested(data, 'time')?.created ?? row.time_created) ?? parent.timestamp,
      data,
      parent.model,
    );
    if (usage) {
      events.push(usage);
      messageIdsWithUsage.add(messageId);
    }
  }
  for (const [messageId, message] of messages) {
    if (
      !messageIdsWithUsage.has(messageId) &&
      (message.tokens.input +
        message.tokens.output +
        message.tokens.cacheRead +
        message.tokens.cacheWrite >
        0 ||
        (message.costUSD ?? 0) > 0)
    ) {
      events.push(message);
    }
  }
  return events;
}

function chooseUsageEvents(
  messages: Map<string, UsageEvent>,
  steps: UsageEvent[],
  tables: Set<string>,
  db: SqliteReader,
): UsageEvent[] {
  // The step reader already prefers step events and falls back to the message's
  // aggregate only when a message has no step-level usage.
  const records = tables.has('part') ? [...steps] : [...messages.values()];
  const sessionsWithUsage = new Set(records.map((record) => record.sessionId));
  if (!tables.has('session')) return records;

  const columns = tableColumns(db, 'session');
  const tokenColumns = ['tokens_input', 'tokens_output', 'tokens_cache_read', 'tokens_cache_write'];
  const available = tokenColumns.filter((column) => columns.has(column));
  if (!columns.has('id') || available.length === 0) return records;
  const selected = [
    'id',
    ...available,
    ...(columns.has('cost') ? ['cost'] : []),
    ...(columns.has('model_id') ? ['model_id'] : []),
    ...(columns.has('time_updated') ? ['time_updated'] : []),
    ...(columns.has('time_created') ? ['time_created'] : []),
  ];
  const sessionRows = db.all(`SELECT ${selected.join(', ')} FROM session`);
  for (const row of sessionRows) {
    const sessionId = asText(row.id);
    if (!sessionId || sessionsWithUsage.has(sessionId)) continue;
    const timestamp = asTimestamp(row.time_updated ?? row.time_created);
    if (timestamp === null) continue;
    const event: UsageEvent = {
      id: `session:${sessionId}`,
      sessionId,
      timestamp,
      model: asText(row.model_id) ?? 'unknown',
      tokens: {
        input: asCount(row.tokens_input),
        output: asCount(row.tokens_output),
        cacheRead: asCount(row.tokens_cache_read),
        cacheWrite: asCount(row.tokens_cache_write),
      },
      costUSD: asMoney(row.cost),
    };
    if (
      event.tokens.input + event.tokens.output + event.tokens.cacheRead + event.tokens.cacheWrite >
        0 ||
      (event.costUSD ?? 0) > 0
    ) {
      records.push(event);
    }
  }
  return records;
}

function usageEvent(
  id: string,
  sessionId: string,
  timestamp: number,
  data: Record<string, unknown>,
  inheritedModel?: string,
): UsageEvent | null {
  const tokens = nested(data, 'tokens') ?? nested(data, 'usage');
  const cache = nested(tokens ?? {}, 'cache');
  const input = asCount(tokens?.input ?? tokens?.input_tokens);
  const output =
    asCount(tokens?.output ?? tokens?.output_tokens) +
    asCount(tokens?.reasoning ?? tokens?.reasoning_tokens);
  const cacheRead = asCount(cache?.read ?? tokens?.cache_read ?? tokens?.cached_input_tokens);
  const cacheWrite = asCount(
    cache?.write ?? tokens?.cache_write ?? tokens?.cache_creation_input_tokens,
  );
  const costUSD = asMoney(data.cost ?? nested(data, 'usage')?.cost);
  if (!tokens && costUSD === null) return null;
  return {
    id,
    sessionId,
    timestamp,
    model: asText(data.modelID) ?? asText(data.model) ?? inheritedModel ?? 'unknown',
    tokens: { input, output, cacheRead, cacheWrite },
    costUSD,
  };
}

function addUsage(bucket: OpenCodeUsageBucket, event: UsageEvent): void {
  bucket.input += event.tokens.input;
  bucket.output += event.tokens.output;
  bucket.cacheRead += event.tokens.cacheRead;
  bucket.cacheWrite += event.tokens.cacheWrite;
  bucket.total +=
    event.tokens.input + event.tokens.output + event.tokens.cacheRead + event.tokens.cacheWrite;
  if (event.costUSD !== null) bucket.costUSD = (bucket.costUSD ?? 0) + event.costUSD;
  bucket.count += 1;
}

function defaultCacheKey(dbPath: string, now: number): string {
  const identity = (file: string): string => {
    try {
      const stat = fs.statSync(file);
      return `${stat.size}:${stat.mtimeMs}`;
    } catch {
      return '-';
    }
  };
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  return `${dbPath}:${identity(dbPath)}:${identity(`${dbPath}-wal`)}:${day.getTime()}`;
}

function tableColumns(db: SqliteReader, table: string): Set<string> {
  return new Set(
    db
      .all(`PRAGMA table_info(${table})`)
      .map((row) => asText(row.name))
      .filter((name): name is string => name !== null),
  );
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'string') return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function nested(value: Record<string, unknown>, key: string): Record<string, unknown> | null {
  const child = value[key];
  return child !== null && typeof child === 'object' && !Array.isArray(child)
    ? (child as Record<string, unknown>)
    : null;
}

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function asCount(value: unknown): number {
  const number = typeof value === 'number' || typeof value === 'string' ? Number(value) : 0;
  return Number.isSafeInteger(number) && number >= 0 ? number : 0;
}

function asMoney(value: unknown): number | null {
  if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) {
    return null;
  }
  const number = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function asTimestamp(value: unknown): number | null {
  if (typeof value === 'number' || typeof value === 'bigint') {
    const number = Number(value);
    if (!Number.isFinite(number)) return null;
    const milliseconds = number < 10_000_000_000 ? number * 1000 : number;
    return Number.isFinite(new Date(milliseconds).getTime()) ? milliseconds : null;
  }
  if (typeof value !== 'string' || !value.trim()) return null;
  const number = Number(value);
  if (Number.isFinite(number)) return asTimestamp(number);
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? milliseconds : null;
}

function nonEmpty(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
