import { describe, expect, it } from 'vitest';
import type { ActiveSession } from '@claude-widget/core';
import { contextView, contextsById } from './context';

const ctx = (usedTokens: number, windowTokens = 1_000_000) => ({
  usedTokens,
  windowTokens,
  at: 0,
  model: 'claude-opus-5-5',
});

describe('contextView', () => {
  it('is the whole percent of the window, toned like the limits', () => {
    expect(contextView(ctx(412_000))).toEqual({
      pct: 41,
      tone: 'ok',
      usedTokens: 412_000,
      windowTokens: 1_000_000,
    });
    expect(contextView(ctx(150_000, 200_000))?.tone).toBe('warn');
    expect(contextView(ctx(180_000, 200_000))?.tone).toBe('bad');
    expect(contextView(ctx(749_999))?.tone).toBe('ok');
  });

  it('clamps, and is null when unknown', () => {
    expect(contextView(ctx(1_200_000))?.pct).toBe(100);
    expect(contextView(null)).toBeNull();
    expect(contextView(undefined)).toBeNull();
    expect(contextView(ctx(5, 0))).toBeNull();
  });
});

describe('contextsById', () => {
  it('maps the live sessions that have a context', () => {
    const live = (sessionId: string, context: ActiveSession['context']): ActiveSession => ({
      pid: 1,
      sessionId,
      cwd: '',
      startedAt: 0,
      updatedAt: 0,
      status: '',
      version: '',
      context,
    });
    const m = contextsById([live('a', ctx(500_000)), live('b', null)]);
    expect([...m.keys()]).toEqual(['a']);
    expect(m.get('a')?.pct).toBe(50);
  });
});
