import { describe, expect, it } from 'vitest';
import { parseTranscriptContent, parseTranscriptLine } from './parse';

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
