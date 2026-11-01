import type { JSX } from 'react';
import type { UsageSnapshot } from '@claude-widget/core';
import { useCostCopy } from '../lib/billing';
import { formatCompact, formatUSD } from '../lib/format';
import { windowHolds } from '../../shared/insights';

/** Why the token figure is a conversion, on hover. */
const TOKENS_HINT =
  'At your mix of models and cached tokens over the last 30 days. The limits follow API value ' +
  'far more closely than token counts, since cached tokens are most of them and cost little.';

/**
 * How much Claude Code use fills each limit, learned from Anthropic's readings
 * (the same rate the live estimate uses). Only with plan limits on: there is
 * nothing to learn from without them.
 */
export function WindowHolds({
  snapshot,
  currency,
}: {
  snapshot: UsageSnapshot;
  currency: string;
}): JSX.Element | null {
  const cost = useCostCopy();
  if (!snapshot.official.available) return null;
  const holds = windowHolds(snapshot.official.windows, snapshot.local.perSource);
  return (
    <div className="panel" aria-label="What a full limit holds">
      <div className="panel__head">
        <span className="panel__title">
          {cost.included ? 'What a full limit holds · API value' : 'What a full limit holds'}
        </span>
      </div>
      {holds.length === 0 ? (
        <p className="panel__note">
          claudget learns this from Anthropic's readings as you work. It shows up after a few 5-hour
          windows.
        </p>
      ) : (
        <>
          {holds.map((h) => (
            <div className="kv" key={h.key}>
              <span>{h.label}</span>
              <b>
                about {formatUSD(h.fullUSD, currency, { whole: true })}
                {h.tokens === null ? null : (
                  <span className="kv__sub" title={TOKENS_HINT}>
                    {' '}
                    · {formatCompact(h.tokens)} tokens
                  </span>
                )}
              </b>
            </div>
          ))}
          <p className="panel__note">
            Learned from your Claude Code use on this computer. Use on claude.ai or other devices
            makes it read low.
          </p>
        </>
      )}
    </div>
  );
}
