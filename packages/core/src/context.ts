import { normalizeModelId } from './pricing';
import type { ModelId } from './types';

export const STANDARD_CONTEXT = 200_000;
export const EXTENDED_CONTEXT = 1_000_000;

/**
 * The context window a session runs in. Claude Code reports 200K by default
 * and 1M for models with extended context, but the transcript's model id
 * doesn't say which: it's the API id, without the `[1m]` marker. So:
 *
 * - the models Claude Code runs at 1M by default — Opus 4.6 and later, and
 *   every model from the 5 generation on (Sonnet 5, Fable, Mythos) — are 1M;
 *   real transcripts show Opus 4.8, Opus 5, Opus 5.5 and Sonnet 5 sessions
 *   well past 200K, one auto-compacting at ~967K;
 * - any session already seen with a prompt over 200K is 1M, whatever the
 *   model (Sonnet 4.x with the 1M option);
 * - everything else is 200K.
 */
export function contextWindowFor(model: ModelId, largestPrompt = 0): number {
  if (largestPrompt > STANDARD_CONTEXT) return EXTENDED_CONTEXT;
  const n = normalizeModelId(model);
  const m = /^(opus|sonnet|haiku|fable|mythos)-(\d+)(?:-(\d{1,2}))?(?:-|$)/.exec(n);
  if (!m) return STANDARD_CONTEXT;
  const family = m[1]!;
  const major = Number(m[2]);
  const minor = m[3] === undefined ? 0 : Number(m[3]);
  if (family === 'fable' || family === 'mythos') return EXTENDED_CONTEXT;
  if (family === 'haiku') return STANDARD_CONTEXT;
  if (major >= 5) return EXTENDED_CONTEXT;
  if (family === 'opus' && major === 4 && minor >= 6) return EXTENDED_CONTEXT;
  return STANDARD_CONTEXT;
}
