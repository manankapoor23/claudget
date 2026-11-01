import { describe, expect, it } from 'vitest';
import { EXTENDED_CONTEXT, STANDARD_CONTEXT, contextWindowFor } from './context';

describe('contextWindowFor', () => {
  it('gives 1M to the models Claude Code runs with extended context by default', () => {
    for (const m of [
      'claude-opus-4-6',
      'claude-opus-4-8',
      'claude-opus-5',
      'claude-opus-5-5',
      'claude-sonnet-5',
      'claude-sonnet-5-5',
      'claude-fable-5-1',
      'claude-mythos-5',
      'claude-opus-6',
    ]) {
      expect(contextWindowFor(m), m).toBe(EXTENDED_CONTEXT);
    }
  });

  it('gives 200K to the rest', () => {
    for (const m of [
      'claude-haiku-4-5-20251001',
      'claude-sonnet-4-6',
      'claude-sonnet-4-5',
      'claude-opus-4-1-20250805',
      'claude-opus-4-20250514',
      'claude-3-5-sonnet-20241022',
      'unknown',
    ]) {
      expect(contextWindowFor(m), m).toBe(STANDARD_CONTEXT);
    }
  });

  it('is 1M once the session has been seen with a prompt over 200K, whatever the model', () => {
    expect(contextWindowFor('claude-sonnet-4-6', 200_000)).toBe(STANDARD_CONTEXT);
    expect(contextWindowFor('claude-sonnet-4-6', 200_001)).toBe(EXTENDED_CONTEXT);
  });
});
