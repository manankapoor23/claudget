import type { ActiveSession, SessionContext } from '@claude-widget/core';
import type { Tone } from './limits';

/** Amber from here: worth knowing a /compact is coming. */
export const CONTEXT_WARN = 0.75;
/** Red from here: Claude Code compacts on its own close to full. */
export const CONTEXT_BAD = 0.9;

export interface ContextView {
  /** Whole percent of the window used, 0–100. */
  pct: number;
  tone: Tone;
  usedTokens: number;
  windowTokens: number;
}

/** A live session's context, ready to show; null when it isn't known. */
export function contextView(c: SessionContext | null | undefined): ContextView | null {
  if (!c || !(c.windowTokens > 0)) return null;
  const fraction = Math.max(0, Math.min(1, c.usedTokens / c.windowTokens));
  return {
    pct: Math.round(fraction * 100),
    tone: fraction >= CONTEXT_BAD ? 'bad' : fraction >= CONTEXT_WARN ? 'warn' : 'ok',
    usedTokens: c.usedTokens,
    windowTokens: c.windowTokens,
  };
}

/** Each live session's context by session id, for the ones that have one. */
export function contextsById(sessions: readonly ActiveSession[]): Map<string, ContextView> {
  const out = new Map<string, ContextView>();
  for (const s of sessions) {
    const view = contextView(s.context);
    if (view) out.set(s.sessionId, view);
  }
  return out;
}
