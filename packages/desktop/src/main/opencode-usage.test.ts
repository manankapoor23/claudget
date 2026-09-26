import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import type { DatabaseSync as SqliteDatabase } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { scanOpenCodeUsage } from './opencode-usage';

type DatabaseSyncConstructor = new (
  location: string,
  options?: { readOnly?: boolean; allowExtension?: boolean },
) => SqliteDatabase;
let DatabaseSync: DatabaseSyncConstructor | null = null;
try {
  DatabaseSync = (
    createRequire(path.join(process.cwd(), 'package.json'))('node:sqlite') as {
      DatabaseSync: DatabaseSyncConstructor;
    }
  ).DatabaseSync;
} catch {
  // The app uses Electron's bundled Node runtime; Node 20 development tests skip SQLite fixtures.
}

function newDatabase(
  ...args: ConstructorParameters<DatabaseSyncConstructor>
): InstanceType<DatabaseSyncConstructor> {
  if (!DatabaseSync) throw new Error('node:sqlite is unavailable in this Node runtime');
  return new DatabaseSync(...args);
}

const tempDirs: string[] = [];

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'claudget-opencode-'));
  tempDirs.push(dir);
  return dir;
}

function createDb(
  root: string,
  schema: 'messages' | 'session-only' = 'messages',
  filename = 'opencode.db',
): string {
  fs.mkdirSync(root, { recursive: true });
  const filenamePath = path.join(root, filename);
  const db = newDatabase(filenamePath);
  if (schema === 'messages') {
    db.exec(`
      CREATE TABLE message (id TEXT, session_id TEXT, time_created INTEGER, data TEXT);
      CREATE TABLE part (id TEXT, message_id TEXT, time_created INTEGER, data TEXT);
      CREATE TABLE session (id TEXT, directory TEXT, title TEXT, time_updated INTEGER,
        tokens_input INTEGER, tokens_output INTEGER, tokens_cache_read INTEGER,
        tokens_cache_write INTEGER, cost REAL, model_id TEXT);
    `);
  } else {
    db.exec(`
      CREATE TABLE message (id TEXT, session_id TEXT, time_created INTEGER, data TEXT);
      CREATE TABLE session (id TEXT, directory TEXT, time_created INTEGER, time_updated INTEGER,
        tokens_input INTEGER, tokens_output INTEGER, tokens_cache_read INTEGER,
        tokens_cache_write INTEGER, cost REAL, model_id TEXT);
    `);
  }
  db.close();
  return filenamePath;
}

function addMessage(
  databasePath: string,
  id: string,
  sessionId: string,
  data: Record<string, unknown>,
  createdAt = 1_780_000_000_000,
): void {
  const db = newDatabase(databasePath);
  db.prepare('INSERT INTO message VALUES (?, ?, ?, ?)').run(
    id,
    sessionId,
    createdAt,
    JSON.stringify({ role: 'assistant', ...data }),
  );
  db.close();
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('scanOpenCodeUsage without a database', () => {
  it('explains that local history is not available yet', () => {
    const usage = scanOpenCodeUsage({
      environment: { OPENCODE_DATA_DIR: path.join(os.tmpdir(), 'claudget-opencode-missing') },
      now: () => 1_780_000_000_000,
    });
    expect(usage.status).toBe('not-found');
    expect(usage.message).toContain('Run OpenCode once');
  });
});

describe.skipIf(DatabaseSync === null)('scanOpenCodeUsage SQLite fixtures', () => {
  it('reads completed step usage without double-counting message aggregates or reading text parts', () => {
    const home = tempDir();
    const root = path.join(home, 'data');
    const dbPath = createDb(root);
    const db = newDatabase(dbPath);
    db.prepare('INSERT INTO session (id, directory, title) VALUES (?, ?, ?)').run(
      'session-1',
      '/workspace/example',
      'A title that is not selected',
    );
    db.close();

    addMessage(dbPath, 'message-1', 'session-1', {
      modelID: 'openai/gpt-5',
      tokens: { input: 100, output: 30, cache: { read: 10, write: 5 } },
      cost: 0.5,
    });
    addMessage(dbPath, 'message-2', 'session-1', {
      modelID: 'anthropic/claude-sonnet',
      tokens: { input: 50, output: 20 },
      cost: 0.25,
    });
    const addPart = newDatabase(dbPath);
    addPart.prepare('INSERT INTO part VALUES (?, ?, ?, ?)').run(
      'step-1',
      'message-1',
      1_780_000_000_000,
      JSON.stringify({
        type: 'step-finish',
        time: { created: 1_780_000_000_000 },
        tokens: { input: 80, output: 25, cache: { read: 8, write: 4 } },
        cost: 0.4,
      }),
    );
    addPart
      .prepare('INSERT INTO part VALUES (?, ?, ?, ?)')
      .run(
        'prompt-part',
        'message-1',
        1_780_000_000_000,
        JSON.stringify({ type: 'text', text: 'do-not-read-this-prompt' }),
      );
    addPart.close();

    const queries: string[] = [];
    const usage = scanOpenCodeUsage({
      environment: { OPENCODE_DATA_DIR: root },
      now: () => 1_780_000_000_000,
      sqliteFactory: (filename) => {
        const reader = newDatabase(filename, { readOnly: true, allowExtension: false });
        reader.exec('PRAGMA query_only = ON; PRAGMA busy_timeout = 250;');
        return {
          all: (sql, ...parameters) => {
            queries.push(sql);
            return reader.prepare(sql).all(...parameters) as Record<string, unknown>[];
          },
          close: () => reader.close(),
        };
      },
    });

    expect(usage.status).toBe('available');
    expect(queries.some((sql) => sql.includes("json_extract(data, '$.role') = 'assistant'"))).toBe(
      true,
    );
    expect(
      queries.some((sql) => sql.includes("json_extract(data, '$.type') = 'step-finish'")),
    ).toBe(true);
    expect(queries.some((sql) => sql.includes('SELECT *'))).toBe(false);
    expect(usage.allTime).toEqual({
      input: 130,
      output: 45,
      cacheRead: 8,
      cacheWrite: 4,
      total: 187,
      costUSD: 0.65,
      count: 2,
    });
    expect(usage.granularity).toBe('request');
    expect(usage.models.map((model) => model.model)).toEqual([
      'openai/gpt-5',
      'anthropic/claude-sonnet',
    ]);
    expect(JSON.stringify(usage)).not.toContain('do-not-read-this-prompt');
  });

  it('keeps unreported cost unknown instead of showing a misleading zero', () => {
    const home = tempDir();
    const root = path.join(home, 'data');
    const dbPath = createDb(root);
    addMessage(dbPath, 'message-cost-unknown', 'session-cost-unknown', {
      modelID: 'openai/gpt-5',
      tokens: { input: 12, output: 4 },
    });

    const usage = scanOpenCodeUsage({
      environment: { OPENCODE_DATA_DIR: root },
      now: () => 1_780_000_000_000,
    });

    expect(usage.allTime.total).toBe(16);
    expect(usage.allTime.costUSD).toBeNull();
  });

  it('uses session token totals only when there is no message or step usage', () => {
    const home = tempDir();
    const root = path.join(home, 'opencode-data');
    const dbPath = createDb(root, 'session-only');
    const db = newDatabase(dbPath);
    db.prepare('INSERT INTO session VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      'session-2',
      '/workspace/session-only',
      1_780_000_000_000,
      1_780_000_000_000,
      200,
      40,
      15,
      5,
      1.25,
      'google/gemini-2.5-pro',
    );
    db.close();

    const usage = scanOpenCodeUsage({
      environment: { OPENCODE_DATA_DIR: root },
      now: () => 1_780_000_000_000,
    });

    expect(usage.status).toBe('available');
    expect(usage.granularity).toBe('session');
    expect(usage.allTime).toEqual({
      input: 200,
      output: 40,
      cacheRead: 15,
      cacheWrite: 5,
      total: 260,
      costUSD: 1.25,
      count: 1,
    });
  });

  it('does not combine session aggregates with request-level message usage', () => {
    const home = tempDir();
    const root = path.join(home, 'data');
    const dbPath = createDb(root);
    const db = newDatabase(dbPath);
    db.prepare('INSERT INTO session VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      'session-3',
      '/workspace/example',
      null,
      1_780_000_000_000,
      999,
      999,
      0,
      0,
      99,
      'wrong-fallback',
    );
    db.close();
    addMessage(dbPath, 'message-3', 'session-3', {
      modelID: 'openai/gpt-5',
      tokens: { input: 10, output: 5 },
      cost: 0.1,
    });

    const usage = scanOpenCodeUsage({
      environment: { OPENCODE_DATA_DIR: root },
      now: () => 1_780_000_000_000,
    });

    expect(usage.allTime.total).toBe(15);
    expect(usage.allTime.costUSD).toBe(0.1);
    expect(usage.allTime.count).toBe(1);
  });

  it('discovers XDG roots and channel database variants without a channel override', () => {
    const home = tempDir();
    const xdgDataHome = path.join(home, 'xdg-data');
    createDb(path.join(xdgDataHome, 'opencode'), 'messages', 'opencode-nightly.db');

    const usage = scanOpenCodeUsage({
      environment: { XDG_DATA_HOME: xdgDataHome },
      homeDirectory: home,
      platform: 'darwin',
      now: () => 1_780_000_000_000,
    });

    expect(usage.status).toBe('available');
  });

  it('checks the XDG data directory on macOS when no XDG override is set', () => {
    const home = tempDir();
    createDb(path.join(home, '.local', 'share', 'opencode'));

    const usage = scanOpenCodeUsage({
      environment: {},
      homeDirectory: home,
      platform: 'darwin',
      now: () => 1_780_000_000_000,
    });

    expect(usage.status).toBe('available');
  });

  it('prefers a channel-specific database and reports missing local history clearly', () => {
    const home = tempDir();
    const root = path.join(home, 'custom-open-code');
    createDb(root, 'messages', 'opencode-insiders.db');
    createDb(root, 'messages', 'opencode.db');

    const usage = scanOpenCodeUsage({
      environment: { OPENCODE_DATA_DIR: root, OPENCODE_CHANNEL: 'insiders' },
      now: () => 1_780_000_000_000,
    });
    expect(usage.status).toBe('available');

    const missing = scanOpenCodeUsage({
      environment: { OPENCODE_DATA_DIR: path.join(home, 'missing') },
      now: () => 1_780_000_000_000,
    });
    expect(missing.status).toBe('not-found');
    expect(missing.message).toContain('Run OpenCode once');
  });

  it('opens the database read-only', () => {
    const home = tempDir();
    const root = path.join(home, 'data');
    const dbPath = createDb(root);
    const usage = scanOpenCodeUsage({
      environment: { OPENCODE_DATA_DIR: root },
      now: () => 1_780_000_000_000,
    });
    expect(usage.status).toBe('available');

    const readOnly = newDatabase(dbPath, { readOnly: true, allowExtension: false });
    expect(() => readOnly.exec('CREATE TABLE should_not_be_created (id TEXT)')).toThrow();
    readOnly.close();
  });
});
