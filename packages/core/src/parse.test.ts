import { describe, expect, it } from 'vitest';
import {
  createTranscriptParser,
  parseTranscriptContent,
  parseTranscriptLine,
  sourceFromEntrypoint,
} from './parse';

const ctx = { projectSlug: 'c--Dev-x', projectPath: 'x' };

function assistant(usage: Record<string, number>, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type: 'assistant',
    timestamp: '2026-06-08T10:06:23.933Z',
    requestId: 'req_1',
    sessionId: 'sess_1',
    uuid: 'u1',
    message: {
      id: 'msg_1',
      model: 'claude-sonnet-4-6',
      usage,
      ...((extra.message as object) ?? {}),
    },
    ...extra,
  });
}

describe('parseTranscriptLine', () => {
  it('parses a billable assistant line', () => {
    const line = assistant({
      input_tokens: 3,
      output_tokens: 289,
      cache_creation_input_tokens: 6318,
      cache_read_input_tokens: 21564,
    });
    const e = parseTranscriptLine(line, ctx);
    expect(e).not.toBeNull();
    expect(e?.tokens.total).toBe(3 + 289 + 6318 + 21564);
    expect(e?.tokens.cacheRead).toBe(21564);
    expect(e?.key).toBe('msg_1:req_1');
    expect(e?.model).toBe('claude-sonnet-4-6');
    expect(e?.sessionId).toBe('sess_1');
    expect(e?.timestamp).toBe(Date.parse('2026-06-08T10:06:23.933Z'));
  });

  it('skips non-assistant lines', () => {
    expect(parseTranscriptLine(JSON.stringify({ type: 'user', message: {} }), ctx)).toBeNull();
  });

  it('skips synthetic-model lines', () => {
    const line = assistant(
      { input_tokens: 5, output_tokens: 5 },
      { message: { model: '<synthetic>' } },
    );
    expect(parseTranscriptLine(line, ctx)).toBeNull();
  });

  it('skips zero-token lines', () => {
    const line = assistant({ input_tokens: 0, output_tokens: 0 });
    expect(parseTranscriptLine(line, ctx)).toBeNull();
  });

  it('returns null on malformed JSON or blank lines', () => {
    expect(parseTranscriptLine('not json', ctx)).toBeNull();
    expect(parseTranscriptLine('', ctx)).toBeNull();
    expect(parseTranscriptLine('   ', ctx)).toBeNull();
  });

  it('falls back to uuid when requestId is missing', () => {
    const line = JSON.stringify({
      type: 'assistant',
      uuid: 'u9',
      message: { id: 'm9', model: 'claude-opus-4-8', usage: { output_tokens: 10 } },
    });
    expect(parseTranscriptLine(line, ctx)?.key).toBe('m9:u9');
  });

  it('uses transcript metadata for project and session labels', () => {
    const content = [
      JSON.stringify({
        type: 'user',
        cwd: '/Users/test/my-app',
        gitBranch: 'feature/better-names',
        sessionId: 'sess_1',
        message: { role: 'user', content: 'Fix the login flow and keep the tests green' },
      }),
      assistant({ output_tokens: 2 }),
    ].join('\n');
    const entries = parseTranscriptContent(content, ctx);
    expect(entries[0]?.projectPath).toBe('/Users/test/my-app');
    expect(entries[0]?.sessionTitle).toBe('Fix the login flow and keep the tests green');
    expect(entries[0]?.gitBranch).toBe('feature/better-names');
  });
});

describe('cache writes kept for an hour', () => {
  it('records how many of the cache writes were 1-hour ones', () => {
    const line = JSON.stringify({
      type: 'assistant',
      timestamp: '2026-06-08T10:06:23.933Z',
      requestId: 'req_1',
      message: {
        id: 'msg_1',
        model: 'claude-opus-4-8',
        usage: {
          input_tokens: 2,
          output_tokens: 10,
          cache_creation_input_tokens: 900,
          cache_read_input_tokens: 0,
          cache_creation: { ephemeral_5m_input_tokens: 300, ephemeral_1h_input_tokens: 600 },
        },
      },
    });
    expect(parseTranscriptLine(line, ctx)?.tokens.cacheCreation1h).toBe(600);
  });

  it('leaves it out for older transcripts, and never counts more than were written', () => {
    expect(
      parseTranscriptLine(assistant({ output_tokens: 1, cache_creation_input_tokens: 50 }), ctx)
        ?.tokens,
    ).not.toHaveProperty('cacheCreation1h');
    const odd = JSON.stringify({
      type: 'assistant',
      requestId: 'r',
      message: {
        id: 'm',
        model: 'claude-opus-4-8',
        usage: {
          output_tokens: 1,
          cache_creation_input_tokens: 10,
          cache_creation: { ephemeral_1h_input_tokens: 99 },
        },
      },
    });
    expect(parseTranscriptLine(odd, ctx)?.tokens.cacheCreation1h).toBe(10);
  });
});

describe('parseTranscriptContent', () => {
  it('parses multiple lines and ignores blanks', () => {
    const content = [
      assistant({ output_tokens: 1 }),
      '',
      JSON.stringify({ type: 'user', message: {} }),
      assistant({ output_tokens: 2 }),
    ].join('\n');
    const entries = parseTranscriptContent(content, ctx);
    expect(entries.length).toBe(2);
  });
});

describe('where a request was made (entrypoint)', () => {
  it('maps the entrypoints Claude Code writes', () => {
    expect(sourceFromEntrypoint('cli')).toBe('cli');
    expect(sourceFromEntrypoint('claude-vscode')).toBe('vscode');
    expect(sourceFromEntrypoint('claude-desktop')).toBe('desktop');
    expect(sourceFromEntrypoint('sdk-cli')).toBe('sdk');
    expect(sourceFromEntrypoint('sdk-ts')).toBe('sdk');
    expect(sourceFromEntrypoint('something-new')).toBe('other');
    expect(sourceFromEntrypoint('')).toBeNull();
    expect(sourceFromEntrypoint(undefined)).toBeNull();
    expect(sourceFromEntrypoint(42)).toBeNull();
  });

  it('tags an entry with its own entrypoint', () => {
    const e = parseTranscriptLine(
      assistant({ input_tokens: 1, output_tokens: 1 }, { entrypoint: 'claude-desktop' }),
      ctx,
    );
    expect(e?.source).toBe('desktop');
  });

  it('carries the last entrypoint seen in the file to lines without one', () => {
    const content = [
      JSON.stringify({ type: 'user', entrypoint: 'claude-vscode', message: { content: 'hi' } }),
      assistant({ input_tokens: 1, output_tokens: 1 }),
    ].join('\n');
    const [e] = parseTranscriptContent(content, ctx);
    expect(e?.source).toBe('vscode');
  });

  it('leaves older transcripts without an entrypoint unknown', () => {
    const e = parseTranscriptLine(assistant({ input_tokens: 1, output_tokens: 1 }), ctx);
    expect(e?.source).toBeNull();
  });
});

describe('session context', () => {
  const reply = (
    id: string,
    at: string,
    usage: Record<string, number>,
    extra: Record<string, unknown> = {},
  ): string =>
    JSON.stringify({
      type: 'assistant',
      timestamp: at,
      requestId: id,
      sessionId: 'sess_1',
      message: { id, model: 'claude-opus-4-8', usage },
      ...extra,
    });
  const compact = JSON.stringify({
    type: 'system',
    subtype: 'compact_boundary',
    timestamp: '2026-06-08T10:03:00.000Z',
    compactMetadata: { trigger: 'auto', preTokens: 900_000 },
  });

  it('is the prompt of the latest response, as Claude Code counts it: no output', () => {
    const p = createTranscriptParser(ctx);
    expect(p.context()).toBeNull();
    p.line(reply('a', '2026-06-08T10:00:00.000Z', { input_tokens: 5, output_tokens: 99 }));
    p.line(
      reply('b', '2026-06-08T10:01:00.000Z', {
        input_tokens: 10,
        output_tokens: 500,
        cache_creation_input_tokens: 2_000,
        cache_read_input_tokens: 300_000,
      }),
    );
    expect(p.context()).toEqual({
      sessionId: 'sess_1',
      context: {
        usedTokens: 302_010,
        windowTokens: 1_000_000,
        at: Date.parse('2026-06-08T10:01:00.000Z'),
        model: 'claude-opus-4-8',
      },
    });
  });

  it('is unknown after a /compact until the next response', () => {
    const p = createTranscriptParser(ctx);
    p.line(
      reply('a', '2026-06-08T10:00:00.000Z', { input_tokens: 1, cache_read_input_tokens: 900_000 }),
    );
    p.line(compact);
    expect(p.context()).toBeNull();
    p.line(
      reply('b', '2026-06-08T10:04:00.000Z', {
        input_tokens: 1,
        cache_creation_input_tokens: 15_000,
      }),
    );
    expect(p.context()?.context.usedTokens).toBe(15_001);
  });

  it('ignores subagent turns, which run in a context of their own', () => {
    const p = createTranscriptParser(ctx);
    p.line(reply('a', '2026-06-08T10:00:00.000Z', { input_tokens: 40_000 }));
    p.line(reply('b', '2026-06-08T10:01:00.000Z', { input_tokens: 3 }, { isSidechain: true }));
    expect(p.context()?.context.usedTokens).toBe(40_000);
  });

  it('switches to the 1M window once a prompt has gone past 200K', () => {
    const p = createTranscriptParser(ctx);
    const sonnet = (id: string, at: string, n: number): string =>
      JSON.stringify({
        type: 'assistant',
        timestamp: at,
        requestId: id,
        sessionId: 'sess_1',
        message: { id, model: 'claude-sonnet-4-6', usage: { input_tokens: n } },
      });
    p.line(sonnet('a', '2026-06-08T10:00:00.000Z', 150_000));
    expect(p.context()?.context.windowTokens).toBe(200_000);
    p.line(sonnet('b', '2026-06-08T10:01:00.000Z', 250_000));
    p.line(compact);
    p.line(sonnet('c', '2026-06-08T10:04:00.000Z', 20_000));
    expect(p.context()?.context.windowTokens).toBe(1_000_000);
  });
});
