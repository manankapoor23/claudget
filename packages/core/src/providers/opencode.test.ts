import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const { DatabaseSync } = process.getBuiltinModule('node:sqlite');
type DatabaseSync = InstanceType<typeof DatabaseSync>;
import { afterEach, describe, expect, it } from 'vitest';
import type { Logger, LogLevel } from '../logger';
import { OpenCodeProvider, findOpenCodeDb, readOpenCodeUsage, START_CURSOR } from './opencode';

// Tables as OpenCode 1.14.28 creates them (migration snapshot
// 20260423070820_add_icon_url_override), trimmed to the columns that matter
// plus the session columns the old prototype wrongly assumed weren't there.
const SCHEMA_1_14_28 = `
  CREATE TABLE session (id text PRIMARY KEY, project_id text NOT NULL, slug text NOT NULL,
    directory text NOT NULL, title text NOT NULL, version text NOT NULL,
    time_created integer NOT NULL, time_updated integer NOT NULL);
  CREATE TABLE message (id text PRIMARY KEY, session_id text NOT NULL,
    time_created integer NOT NULL, time_updated integer NOT NULL, data text NOT NULL);
  CREATE TABLE part (id text PRIMARY KEY, message_id text NOT NULL, session_id text NOT NULL,
    time_created integer NOT NULL, time_updated integer NOT NULL, data text NOT NULL);
`;

// 1.19.4 keeps those and adds the v2 store, migrating old messages into it.
const SCHEMA_1_19_4 = `${SCHEMA_1_14_28}
  CREATE TABLE session_message (id text PRIMARY KEY, session_id text NOT NULL, type text NOT NULL,
    seq integer NOT NULL, time_created integer NOT NULL, time_updated integer NOT NULL,
    data text NOT NULL);
`;

const T0 = 1_790_000_000_000;
const dirs: string[] = [];

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'claudget-opencode-'));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function makeDb(schema: string): { file: string; db: DatabaseSync } {
  const file = path.join(tempDir(), 'opencode.db');
  const db = new DatabaseSync(file);
  db.exec(schema);
  return { file, db };
}

interface Msg {
  id: string;
  at?: number;
  done?: boolean;
  input?: number;
  output?: number;
  reasoning?: number;
  read?: number;
  write?: number;
  cost?: number;
}

const tokens = (m: Msg): object => ({
  input: m.input ?? 0,
  output: m.output ?? 0,
  reasoning: m.reasoning ?? 0,
  cache: { read: m.read ?? 0, write: m.write ?? 0 },
});
const time = (m: Msg): object => ({
  created: m.at ?? T0,
  ...(m.done === false ? {} : { completed: (m.at ?? T0) + 1000 }),
});

/** A 1.14.28 assistant message, with the fields claudget must never read. */
function legacy(db: DatabaseSync, m: Msg): void {
  db.prepare('INSERT INTO message VALUES (?, ?, ?, ?, ?)').run(
    m.id,
    'ses_1',
    m.at ?? T0,
    m.at ?? T0,
    JSON.stringify({
      role: 'assistant',
      modelID: 'claude-sonnet-4-5',
      providerID: 'anthropic',
      path: { cwd: '/secret/project', root: '/secret' },
      tokens: tokens(m),
      cost: m.cost ?? 0,
      time: time(m),
    }),
  );
  db.prepare('INSERT INTO part VALUES (?, ?, ?, ?, ?, ?)').run(
    `prt_${m.id}`,
    m.id,
    'ses_1',
    m.at ?? T0,
    m.at ?? T0,
    JSON.stringify({ type: 'text', text: 'never read' }),
  );
}

/** A 1.19.4 `session_message` assistant row. */
function v2(db: DatabaseSync, m: Msg, seq = 1): void {
  db.prepare('INSERT INTO session_message VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    m.id,
    'ses_1',
    'assistant',
    seq,
    m.at ?? T0,
    m.at ?? T0,
    JSON.stringify({
      agent: 'build',
      model: { id: 'gpt-5', providerID: 'openai' },
      content: [{ type: 'text', text: 'never read' }],
      tokens: m.done === false ? null : tokens(m),
      cost: m.cost ?? 0,
      time: time(m),
    }),
  );
}

function hash(file: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function recordingLogger(): Logger & { lines: { level: LogLevel; message: string }[] } {
  const lines: { level: LogLevel; message: string }[] = [];
  const logger = {
    lines,
    level: 'debug' as LogLevel,
    error: (message: string) => lines.push({ level: 'error', message }),
    warn: (message: string) => lines.push({ level: 'warn', message }),
    info: (message: string) => lines.push({ level: 'info', message }),
    debug: (message: string) => lines.push({ level: 'debug', message }),
    setLevel() {},
    child: () => logger,
  };
  return logger;
}

const HOUR = 60 * 60_000;

describe('readOpenCodeUsage', () => {
  it('reads 1.14.28 message usage and nothing else', () => {
    const { file, db } = makeDb(SCHEMA_1_14_28);
    legacy(db, {
      id: 'msg_a',
      input: 10,
      output: 5,
      reasoning: 2,
      read: 100,
      write: 7,
      cost: 0.25,
    });
    db.prepare('INSERT INTO message VALUES (?, ?, ?, ?, ?)').run(
      'msg_u',
      'ses_1',
      T0,
      T0,
      JSON.stringify({ role: 'user', time: { created: T0 } }),
    );
    db.close();

    const { rows, cursor } = readOpenCodeUsage(file, START_CURSOR, T0, HOUR);
    expect(rows).toEqual([
      {
        id: 'msg_a',
        sessionId: 'ses_1',
        model: 'claude-sonnet-4-5',
        createdAt: T0,
        input: 10,
        output: 5,
        reasoning: 2,
        cacheRead: 100,
        cacheWrite: 7,
        cost: 0.25,
      },
    ]);
    expect(JSON.stringify(rows)).not.toMatch(/secret|never read/);
    expect(cursor.message).toBe(1);
  });

  it('reads 1.19.4 session_message usage', () => {
    const { file, db } = makeDb(SCHEMA_1_19_4);
    v2(db, { id: 'msg_b', input: 3, output: 4 });
    db.close();
    const { rows } = readOpenCodeUsage(file, START_CURSOR, T0, HOUR);
    expect(rows).toMatchObject([{ id: 'msg_b', model: 'gpt-5', input: 3, output: 4 }]);
  });

  it('reads only rows after the cursor', () => {
    const { file, db } = makeDb(SCHEMA_1_14_28);
    legacy(db, { id: 'msg_1', input: 1 });
    legacy(db, { id: 'msg_2', input: 2 });
    db.close();
    const { rows } = readOpenCodeUsage(file, { message: 1, sessionMessage: 0 }, T0, HOUR);
    expect(rows.map((r) => r.id)).toEqual(['msg_2']);
  });

  it('holds the cursor before an unfinished message, until it goes stale', () => {
    const { file, db } = makeDb(SCHEMA_1_19_4);
    v2(db, { id: 'msg_1', input: 1 }, 1);
    v2(db, { id: 'msg_2', done: false }, 2);
    v2(db, { id: 'msg_3', input: 3 }, 3);
    db.close();
    expect(readOpenCodeUsage(file, START_CURSOR, T0, HOUR).cursor.sessionMessage).toBe(1);
    expect(readOpenCodeUsage(file, START_CURSOR, T0 + 2 * HOUR, HOUR).cursor.sessionMessage).toBe(
      3,
    );
  });

  it('leaves the database file byte-for-byte unchanged', () => {
    const { file, db } = makeDb(SCHEMA_1_19_4);
    legacy(db, { id: 'msg_1', input: 1 });
    v2(db, { id: 'msg_2', input: 2 });
    db.close();
    const before = hash(file);
    const siblings = fs.readdirSync(path.dirname(file));
    readOpenCodeUsage(file, START_CURSOR, T0, HOUR);
    expect(hash(file)).toBe(before);
    expect(fs.readdirSync(path.dirname(file))).toEqual(siblings);
  });
});

describe('OpenCodeProvider', () => {
  it('syncs incrementally in a worker and prefers v2 copies of migrated messages', async () => {
    const { file, db } = makeDb(SCHEMA_1_19_4);
    legacy(db, { id: 'msg_1', input: 100, cost: 1 });
    v2(db, { id: 'msg_1', input: 100, cost: 1 }, 1);
    const provider = new OpenCodeProvider({ logger: recordingLogger(), dbPath: file });
    try {
      expect(await provider.sync(true)).toBe(true);
      expect(provider.entries()).toHaveLength(1);
      expect(provider.entries()[0]).toMatchObject({
        key: 'opencode:msg_1',
        model: 'gpt-5',
        source: 'opencode',
        costUSD: 1,
        tokens: { input: 100, total: 100 },
      });

      expect(await provider.sync(false)).toBe(false);

      v2(db, { id: 'msg_2', input: 5, output: 1, reasoning: 2 }, 2);
      expect(await provider.sync(false)).toBe(true);
      expect(provider.entries().find((e) => e.messageId === 'msg_2')?.tokens).toEqual({
        input: 5,
        output: 3,
        cacheCreation: 0,
        cacheRead: 0,
        total: 8,
      });

      // A full pass drops rows deleted at the source.
      db.prepare("DELETE FROM session_message WHERE id = 'msg_2'").run();
      expect(await provider.sync(true)).toBe(true);
      expect(provider.entries().map((e) => e.messageId)).toEqual(['msg_1']);
    } finally {
      db.close();
      await provider.close();
    }
  });

  it('logs an unreadable database once and keeps going', async () => {
    const file = path.join(tempDir(), 'opencode.db');
    fs.writeFileSync(file, 'not a database');
    const logger = recordingLogger();
    const provider = new OpenCodeProvider({ logger, dbPath: file });
    try {
      expect(await provider.sync(true)).toBe(false);
      expect(await provider.sync(false)).toBe(false);
      expect(logger.lines.filter((l) => l.level === 'warn')).toHaveLength(1);
      expect(provider.entries()).toEqual([]);
    } finally {
      await provider.close();
    }
  });
});

describe('findOpenCodeDb', () => {
  it('follows OpenCode: OPENCODE_DB, then opencode.db, then a channel db', () => {
    const home = tempDir();
    const data = path.join(home, '.local', 'share', 'opencode');
    fs.mkdirSync(data, { recursive: true });
    expect(findOpenCodeDb({}, home)).toBeNull();

    fs.writeFileSync(path.join(data, 'opencode-dev.db'), '');
    expect(findOpenCodeDb({}, home)).toBe(path.join(data, 'opencode-dev.db'));

    fs.writeFileSync(path.join(data, 'opencode.db'), '');
    expect(findOpenCodeDb({}, home)).toBe(path.join(data, 'opencode.db'));

    expect(findOpenCodeDb({ OPENCODE_DB: 'opencode-dev.db' }, home)).toBe(
      path.join(data, 'opencode-dev.db'),
    );
    expect(findOpenCodeDb({ OPENCODE_DB: ':memory:' }, home)).toBeNull();

    const xdg = tempDir();
    fs.mkdirSync(path.join(xdg, 'opencode'));
    fs.writeFileSync(path.join(xdg, 'opencode', 'opencode.db'), '');
    expect(findOpenCodeDb({ XDG_DATA_HOME: xdg }, home)).toBe(
      path.join(xdg, 'opencode', 'opencode.db'),
    );
  });
});
