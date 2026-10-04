import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseTranscriptContent } from './parse';
import { TranscriptStore, type TranscriptRef } from './transcript-store';

const assistant = (id: string, extra: Record<string, unknown> = {}): string =>
  JSON.stringify({
    type: 'assistant',
    timestamp: '2026-09-09T00:00:00.000Z',
    uuid: id,
    requestId: id,
    sessionId: 's1',
    message: {
      id,
      model: 'claude-sonnet-4-20250514',
      usage: { input_tokens: 10, output_tokens: 5 },
    },
    ...extra,
  });

const user = (text: string, extra: Record<string, unknown> = {}): string =>
  JSON.stringify({ type: 'user', message: { content: text }, ...extra });

let dir: string;
let ref: TranscriptRef;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'claudget-store-'));
  ref = { path: path.join(dir, 'a.jsonl'), projectSlug: '-tmp-a', projectPath: '/tmp/a' };
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const keys = (store: TranscriptStore): string[] =>
  store.entryLists().flatMap((list) => list.map((e) => e.key));

describe('TranscriptStore', () => {
  it('parses a file the same way as parseTranscriptContent', async () => {
    const content =
      [
        user('fix the login bug', { cwd: '/work/app', gitBranch: 'main' }),
        assistant('one'),
        'not json',
        assistant('two', { cwd: '/work/app/sub', gitBranch: 'feat' }),
        assistant('three'),
      ].join('\n') + '\n';
    fs.writeFileSync(ref.path, content);
    const store = new TranscriptStore();
    expect(await store.sync([ref])).toBe(true);
    expect(store.entryLists()).toEqual([parseTranscriptContent(content, ref)]);
  });

  it('reads only appended lines, keeping per-file context across reads', async () => {
    fs.writeFileSync(
      ref.path,
      user('the title', { gitBranch: 'dev' }) + '\n' + assistant('one') + '\n',
    );
    const store = new TranscriptStore();
    await store.update(ref);
    fs.appendFileSync(ref.path, assistant('two') + '\n');
    expect(await store.update(ref)).toBe(true);
    const [list] = store.entryLists();
    expect(list?.map((e) => e.key)).toEqual(['one:one', 'two:two']);
    // The title and branch came from the first read; the second read still has them.
    expect(list?.[1]?.sessionTitle).toBe('the title');
    expect(list?.[1]?.gitBranch).toBe('dev');
  });

  it('does not re-read an unchanged file', async () => {
    fs.writeFileSync(ref.path, assistant('one') + '\n');
    const store = new TranscriptStore();
    expect(await store.sync([ref])).toBe(true);
    expect(await store.sync([ref])).toBe(false);
    expect(keys(store)).toEqual(['one:one']);
  });

  it('waits for a half-written trailing line instead of dropping it', async () => {
    const full = assistant('two');
    fs.writeFileSync(ref.path, assistant('one') + '\n' + full.slice(0, 40));
    const store = new TranscriptStore();
    await store.update(ref);
    expect(keys(store)).toEqual(['one:one']);
    fs.appendFileSync(ref.path, full.slice(40) + '\n');
    expect(await store.update(ref)).toBe(true);
    expect(keys(store)).toEqual(['one:one', 'two:two']);
  });

  it('takes a complete trailing line that has no newline yet, once', async () => {
    fs.writeFileSync(ref.path, assistant('one'));
    const store = new TranscriptStore();
    await store.update(ref);
    expect(keys(store)).toEqual(['one:one']);
    fs.appendFileSync(ref.path, '\n' + assistant('two') + '\n');
    await store.update(ref);
    expect(keys(store)).toEqual(['one:one', 'two:two']);
  });

  it('stitches lines that span read chunks (multi-byte text included)', async () => {
    const huge = user('é'.repeat(1_500_000));
    fs.writeFileSync(
      ref.path,
      huge + '\n' + assistant('one') + '\n' + huge + '\n' + assistant('two'),
    );
    const store = new TranscriptStore();
    await store.update(ref);
    expect(keys(store)).toEqual(['one:one', 'two:two']);
    // Title is cut to 96 characters, and doesn't pin the 3 MB message.
    expect(store.entryLists()[0]?.[0]?.sessionTitle).toHaveLength(94);
  });

  it('parses huge usage lines, skips huge lines that cannot matter, and keeps their context', async () => {
    const bigOutput = 'x'.repeat(700_000);
    const lines = [
      user('first request'),
      // A huge assistant turn (e.g. a Write of a big file): usage comes last.
      JSON.stringify({
        type: 'assistant',
        timestamp: '2026-09-09T00:00:00.000Z',
        requestId: 'big',
        sessionId: 's1',
        message: {
          id: 'big',
          model: 'claude-sonnet-4-20250514',
          content: [{ type: 'text', text: bigOutput }],
          usage: { input_tokens: 1, output_tokens: 2 },
        },
      }),
      // A huge tool result with no usage: skimmed, but its git branch still counts.
      JSON.stringify({ type: 'user', message: { content: bigOutput }, gitBranch: 'late-branch' }),
      JSON.stringify({ ...JSON.parse(assistant('after')), gitBranch: undefined }),
    ];
    const content = lines.join('\n') + '\n';
    fs.writeFileSync(ref.path, content);
    const store = new TranscriptStore();
    await store.update(ref);
    expect(store.entryLists()).toEqual([parseTranscriptContent(content, ref)]);
    expect(keys(store)).toEqual(['big:big', 'after:after']);
    expect(store.entryLists()[0]?.[1]?.gitBranch).toBe('late-branch');
  });

  it('waits for a huge half-written line, then takes it whole', async () => {
    const big = assistant('big', { pad: 'y'.repeat(300_000) });
    fs.writeFileSync(ref.path, big.slice(0, 200_000));
    const store = new TranscriptStore();
    await store.update(ref);
    expect(keys(store)).toEqual([]);
    fs.appendFileSync(ref.path, big.slice(200_000));
    await store.update(ref);
    expect(keys(store)).toEqual(['big:big']);
  });

  it('parses a file again from the start when it shrinks', async () => {
    fs.writeFileSync(ref.path, assistant('one') + '\n' + assistant('two') + '\n');
    const store = new TranscriptStore();
    await store.update(ref);
    fs.writeFileSync(ref.path, assistant('three') + '\n');
    expect(await store.update(ref)).toBe(true);
    expect(keys(store)).toEqual(['three:three']);
  });

  it('parses a file again from the start when it is replaced by a longer one', async () => {
    fs.writeFileSync(ref.path, assistant('one') + '\n');
    const store = new TranscriptStore();
    await store.update(ref);
    // An atomic rewrite: a new inode at the same path, longer than the old file.
    const next = path.join(dir, 'a.jsonl.tmp');
    fs.writeFileSync(next, assistant('two') + '\n' + assistant('three') + '\n');
    fs.renameSync(next, ref.path);
    expect(await store.update(ref)).toBe(true);
    expect(keys(store)).toEqual(['two:two', 'three:three']);
  });

  it('drops files that are gone', async () => {
    fs.writeFileSync(ref.path, assistant('one') + '\n');
    const store = new TranscriptStore();
    await store.sync([ref]);
    fs.rmSync(ref.path);
    expect(await store.update(ref)).toBe(true);
    expect(store.size).toBe(0);

    fs.writeFileSync(ref.path, assistant('one') + '\n');
    await store.sync([ref]);
    expect(await store.sync([])).toBe(true);
    expect(store.size).toBe(0);
  });

  it('never parses the same bytes twice when reads overlap', async () => {
    const lines = Array.from({ length: 200 }, (_, i) => assistant(`m${i}`)).join('\n') + '\n';
    fs.writeFileSync(ref.path, lines);
    const store = new TranscriptStore();
    await Promise.all([store.update(ref), store.sync([ref]), store.update(ref)]);
    expect(keys(store)).toHaveLength(200);
  });
});
