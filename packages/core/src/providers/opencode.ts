import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import type { Logger } from '../logger';
import type { UsageEntry } from '../types';
import type { UsageProvider } from './types';

export const OPENCODE_PROVIDER_ID = 'opencode';

/**
 * Finds OpenCode's database the way OpenCode itself does (`Database.path()`):
 * `OPENCODE_DB` (absolute, or relative to the data dir), else `opencode.db`
 * for release channels, else `opencode-<channel>.db`. The channel isn't
 * knowable from outside, so the newest `opencode-*.db` stands in for it.
 *
 * A Dock-launched app doesn't inherit the shell's env, so the overrides only
 * apply when claudget was started from a shell that has them.
 */
export function findOpenCodeDb(
  env: NodeJS.ProcessEnv = process.env,
  home: string = os.homedir(),
): string | null {
  const data = path.join(env['XDG_DATA_HOME'] || path.join(home, '.local', 'share'), 'opencode');
  const override = env['OPENCODE_DB'];
  if (override) {
    if (override === ':memory:') return null;
    const p = path.isAbsolute(override) ? override : path.join(data, override);
    return isFile(p) ? p : null;
  }
  const main = path.join(data, 'opencode.db');
  if (isFile(main)) return main;
  let names: string[];
  try {
    names = fs.readdirSync(data).filter((n) => /^opencode-.+\.db$/.test(n));
  } catch {
    return null;
  }
  const newest = names
    .map((n) => path.join(data, n))
    .filter(isFile)
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
  return newest ?? null;
}

function isFile(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

/** One assistant message's usage, exactly the fields claudget shows. */
export interface OpenCodeRow {
  id: string;
  sessionId: string;
  model: string | null;
  createdAt: number | null;
  input: number | null;
  output: number | null;
  reasoning: number | null;
  cacheRead: number | null;
  cacheWrite: number | null;
  cost: number | null;
}

/** Last rowid read per table; reading resumes after it. */
export interface OpenCodeCursor {
  /** `message`, the only store up to 1.14.x (frozen, but still read, in 1.19). */
  message: number;
  /** `session_message`, the store from 1.19 on. */
  sessionMessage: number;
}

export const START_CURSOR: OpenCodeCursor = { message: 0, sessionMessage: 0 };

export interface OpenCodeRead {
  rows: OpenCodeRow[];
  cursor: OpenCodeCursor;
}

/**
 * Reads assistant-message usage newer than `from`. Runs inside a worker (it is
 * serialised with `toString()`), so it must stay self-contained: no imports,
 * no outer references.
 *
 * Read-only by construction: the database is opened `readOnly`, and only
 * `json_extract`ed token/cost/model/time fields leave SQLite, never the message
 * body, its `path` or its `error`. `part` is never read: each message already
 * carries its step's tokens.
 *
 * Messages are written before they finish, so the cursor stops just before
 * the oldest one still in flight (no `time.completed`) and re-reads from there
 * next time; one abandoned more than `staleMs` ago no longer holds it back.
 */
export function readOpenCodeUsage(
  dbPath: string,
  from: OpenCodeCursor,
  now: number,
  staleMs: number,
): OpenCodeRead {
  const sqlite = process.getBuiltinModule('node:sqlite');
  const db = new sqlite.DatabaseSync(dbPath, { readOnly: true });
  try {
    db.exec('PRAGMA busy_timeout = 250');
    const tables = new Set(
      (
        db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as {
          name: string;
        }[]
      ).map((r) => r.name),
    );
    const usage = `json_extract(data, '$.time.created') AS createdAt,
      json_extract(data, '$.time.completed') AS completedAt,
      json_extract(data, '$.tokens.input') AS input,
      json_extract(data, '$.tokens.output') AS output,
      json_extract(data, '$.tokens.reasoning') AS reasoning,
      json_extract(data, '$.tokens.cache.read') AS cacheRead,
      json_extract(data, '$.tokens.cache.write') AS cacheWrite,
      json_extract(data, '$.cost') AS cost`;
    const queries: [keyof OpenCodeCursor, string, string][] = [
      [
        'message',
        'message',
        `SELECT rowid AS r, id, session_id AS sessionId, json_extract(data, '$.modelID') AS model, ${usage}
         FROM message WHERE rowid > ? AND json_extract(data, '$.role') = 'assistant' ORDER BY rowid`,
      ],
      [
        'sessionMessage',
        'session_message',
        `SELECT rowid AS r, id, session_id AS sessionId, json_extract(data, '$.model.id') AS model, ${usage}
         FROM session_message WHERE rowid > ? AND type = 'assistant' ORDER BY rowid`,
      ],
    ];
    const num = (v: unknown): number | null =>
      typeof v === 'number' && Number.isFinite(v) ? v : null;
    const rows: OpenCodeRow[] = [];
    const cursor = { ...from };
    for (const [key, table, sql] of queries) {
      if (!tables.has(table)) continue;
      let last = from[key];
      let pending: number | null = null;
      for (const raw of db.prepare(sql).all(from[key]) as Record<string, unknown>[]) {
        const r = Number(raw['r']);
        last = r;
        const createdAt = num(raw['createdAt']);
        if (
          pending === null &&
          num(raw['completedAt']) === null &&
          (createdAt ?? 0) > now - staleMs
        ) {
          pending = r - 1;
        }
        rows.push({
          id: String(raw['id']),
          sessionId: String(raw['sessionId']),
          model: typeof raw['model'] === 'string' ? raw['model'] : null,
          createdAt,
          input: num(raw['input']),
          output: num(raw['output']),
          reasoning: num(raw['reasoning']),
          cacheRead: num(raw['cacheRead']),
          cacheWrite: num(raw['cacheWrite']),
          cost: num(raw['cost']),
        });
      }
      cursor[key] = pending ?? last;
    }
    return { rows, cursor };
  } finally {
    db.close();
  }
}

/** Maps a row to an entry, or null when it holds no usage yet. */
export function openCodeEntry(row: OpenCodeRow): UsageEntry | null {
  const n = (v: number | null): number => (v !== null && v > 0 ? Math.round(v) : 0);
  const tokens = {
    input: n(row.input),
    // OpenCode counts reasoning separately; Claude Code bills it as output.
    output: n(row.output) + n(row.reasoning),
    cacheCreation: n(row.cacheWrite),
    cacheRead: n(row.cacheRead),
    total: 0,
  };
  tokens.total = tokens.input + tokens.output + tokens.cacheCreation + tokens.cacheRead;
  if (row.createdAt === null || (tokens.total === 0 && !row.cost)) return null;
  return {
    key: `${OPENCODE_PROVIDER_ID}:${row.id}`,
    timestamp: row.createdAt,
    model: row.model ?? 'unknown',
    tokens,
    sessionId: row.sessionId,
    // ponytail: no project directory, it'd mean reading `session.directory`; add when the UI wants it.
    projectPath: 'OpenCode',
    projectSlug: OPENCODE_PROVIDER_ID,
    isSidechain: false,
    requestId: null,
    messageId: row.id,
    source: OPENCODE_PROVIDER_ID,
    costUSD: row.cost ?? 0,
  };
}

type Reader = (dbPath: string, from: OpenCodeCursor) => Promise<OpenCodeRead>;

/** One long-lived worker; the database is opened and closed per read. */
function workerReader(staleMs: number): { read: Reader; close: () => Promise<void> } {
  const worker = new Worker(
    `const { parentPort } = require('node:worker_threads');
     const read = ${readOpenCodeUsage.toString()};
     parentPort.on('message', ({ id, dbPath, from, now }) => {
       try { parentPort.postMessage({ id, ok: read(dbPath, from, now, ${staleMs}) }); }
       catch (err) { parentPort.postMessage({ id, err: String(err && err.message || err) }); }
     });`,
    { eval: true },
  );
  worker.unref();
  let seq = 0;
  const waiting = new Map<
    number,
    { resolve: (r: OpenCodeRead) => void; reject: (e: Error) => void }
  >();
  worker.on('message', (m: { id: number; ok?: OpenCodeRead; err?: string }) => {
    const w = waiting.get(m.id);
    waiting.delete(m.id);
    if (m.ok) w?.resolve(m.ok);
    else w?.reject(new Error(m.err));
  });
  worker.on('error', (err) => {
    for (const w of waiting.values()) w.reject(err);
    waiting.clear();
  });
  return {
    read: (dbPath, from) =>
      new Promise((resolve, reject) => {
        const id = ++seq;
        waiting.set(id, { resolve, reject });
        worker.postMessage({ id, dbPath, from, now: Date.now() });
      }),
    close: async () => {
      await worker.terminate();
    },
  };
}

export interface OpenCodeProviderOptions {
  logger: Logger;
  /** Database to read; found with {@link findOpenCodeDb} when omitted. */
  dbPath?: string | null;
  /** How long an unfinished message may hold the cursor back. */
  staleMs?: number;
}

export class OpenCodeProvider implements UsageProvider {
  readonly id = OPENCODE_PROVIDER_ID;
  private readonly logger: Logger;
  private readonly dbPath: string | null;
  private readonly reader: { read: Reader; close: () => Promise<void> };
  private cursor = START_CURSOR;
  private byId = new Map<string, UsageEntry>();
  private list: UsageEntry[] = [];
  private lastError: string | null = null;

  constructor(opts: OpenCodeProviderOptions) {
    this.logger = opts.logger;
    this.dbPath = opts.dbPath === undefined ? findOpenCodeDb() : opts.dbPath;
    this.reader = workerReader(opts.staleMs ?? 6 * 60 * 60_000);
    this.logger.info('OpenCode usage enabled', { db: this.dbPath });
  }

  entries(): readonly UsageEntry[] {
    return this.list;
  }

  async sync(full: boolean): Promise<boolean> {
    if (!this.dbPath) return false;
    try {
      const { rows, cursor } = await this.reader.read(
        this.dbPath,
        full ? START_CURSOR : this.cursor,
      );
      this.lastError = null;
      const next = full ? new Map<string, UsageEntry>() : new Map(this.byId);
      // `message` rows come first, so `session_message` copies of the same id win.
      for (const row of rows) {
        const entry = openCodeEntry(row);
        if (entry) next.set(row.id, entry);
        else next.delete(row.id);
      }
      this.cursor = cursor;
      // An in-flight message is re-read every sync; only a real change counts.
      const changed = !sameEntries(this.byId, next);
      this.byId = next;
      if (changed) this.list = [...next.values()];
      return changed;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message !== this.lastError)
        this.logger.warn('OpenCode usage could not be read', { db: this.dbPath, error: message });
      this.lastError = message;
      return false;
    }
  }

  close(): Promise<void> {
    return this.reader.close();
  }
}

function sameEntries(a: Map<string, UsageEntry>, b: Map<string, UsageEntry>): boolean {
  if (a.size !== b.size) return false;
  for (const [id, e] of b) {
    const o = a.get(id);
    if (!o || o.tokens.total !== e.tokens.total || o.costUSD !== e.costUSD) return false;
  }
  return true;
}
