import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Logger } from './logger';
import { watchTranscripts, type TranscriptWatcher } from './watch';

const silent = {
  info() {},
  warn() {},
  error() {},
  debug() {},
  setLevel() {},
  child() {
    return silent;
  },
} as unknown as Logger;

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

let dir: string;
let file: string;
let watcher: TranscriptWatcher | null = null;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'claudget-watch-'));
  const proj = path.join(dir, '-Users-test-proj');
  fs.mkdirSync(proj, { recursive: true });
  file = path.join(proj, 'sess.jsonl');
  fs.writeFileSync(file, '');
});

afterEach(async () => {
  await watcher?.close();
  watcher = null;
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('watchTranscripts', () => {
  /**
   * Regression: a transcript that is appended to continuously — i.e. an active
   * Claude Code session, the only time live updates matter — must still deliver
   * changes. A debounce that restarts per event (or chokidar's awaitWriteFinish)
   * starves forever and the widget silently stops updating.
   */
  it('keeps firing while a transcript is being appended to continuously', async () => {
    let fires = 0;
    watcher = watchTranscripts(
      dir,
      () => {
        fires += 1;
      },
      { debounceMs: 200, logger: silent },
    );
    // Let chokidar finish its initial scan, then discard anything it reported for
    // the pre-existing file so we only count fires caused by our own appends.
    await wait(800);
    fires = 0;

    // Append for ~1.5s with gaps shorter than the debounce window — a debounce
    // that restarts per event can never flush here, so it would report 0.
    for (let i = 0; i < 30; i++) {
      fs.appendFileSync(file, `{"line":${i}}\n`);
      await wait(50);
    }
    const during = fires;

    // Repeated progress *while writing* is the property under test.
    expect(during).toBeGreaterThanOrEqual(2);
  }, 15_000);

  it('coalesces a burst into far fewer callbacks than writes', async () => {
    let fires = 0;
    const seen: string[] = [];
    watcher = watchTranscripts(
      dir,
      (paths) => {
        fires += 1;
        seen.push(...paths);
      },
      { debounceMs: 300, logger: silent },
    );
    await wait(600);

    for (let i = 0; i < 30; i++) fs.appendFileSync(file, `{"line":${i}}\n`);
    await wait(1200);

    expect(fires).toBeGreaterThan(0);
    expect(fires).toBeLessThan(10); // coalesced, not one callback per write
    expect(seen).toContain(file);
  }, 15_000);

  it('never reports a non-jsonl path', async () => {
    const seen: string[] = [];
    watcher = watchTranscripts(
      dir,
      (paths) => {
        seen.push(...paths);
      },
      { debounceMs: 200, logger: silent },
    );
    await wait(600);

    fs.writeFileSync(path.join(dir, '-Users-test-proj', 'notes.txt'), 'hello');
    fs.writeFileSync(path.join(dir, '-Users-test-proj', 'journal.log'), 'x');
    await wait(900);

    expect(seen.every((p) => p.endsWith('.jsonl'))).toBe(true);
    expect(seen).not.toContain(path.join(dir, '-Users-test-proj', 'notes.txt'));
  }, 15_000);
});
