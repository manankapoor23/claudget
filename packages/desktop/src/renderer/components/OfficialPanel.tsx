import { useState, type JSX } from 'react';
import type { OfficialStatus, OfficialUsage, OfficialWindow } from '@claude-widget/core';
import { formatCompact, formatPct } from '../lib/format';
import { RadialGauge } from './RadialGauge';
import { Countdown } from './Countdown';

interface OfficialPanelProps {
  official: OfficialUsage;
}

type Tone = 'neutral' | 'warn' | 'bad' | 'ok';

interface StatusMeta {
  /** Short word for the badge — the state, not a generic "Unavailable". */
  badge: string;
  tone: Tone;
  /**
   * What to do, for the cases where no single command fixes it. Statuses that
   * carry a `fix` command from core don't need one.
   */
  hint?: string;
  /**
   * Whether to say that local tracking is unaffected. True for everything that
   * only breaks the network half — which is every credential problem, since
   * tokens, cost and burn rate are parsed from local transcripts.
   */
  localFine?: boolean;
}

const STATUS: Record<OfficialStatus, StatusMeta> = {
  ok: { badge: 'Live', tone: 'ok' },
  disabled: {
    badge: 'Off',
    tone: 'neutral',
    hint: 'Turn on plan tracking in Settings to see your 5-hour and weekly limits.',
  },
  'signed-out': { badge: 'Signed out', tone: 'warn', localFine: true },
  'not-installed': {
    badge: 'Not found',
    tone: 'warn',
    hint: 'Check the Claude directory in Settings, or install Claude Code.',
    localFine: true,
  },
  'keychain-denied': {
    badge: 'Blocked',
    tone: 'warn',
    hint: 'Allow access when macOS asks, or grant it in Keychain Access.',
    localFine: true,
  },
  'credentials-malformed': { badge: 'Unreadable', tone: 'warn', localFine: true },
  expired: { badge: 'Expired', tone: 'warn', localFine: true },
  unauthorized: { badge: 'Rejected', tone: 'bad', localFine: true },
  'rate-limited': {
    badge: 'Rate limited',
    tone: 'warn',
    hint: 'Backing off automatically. Showing the last known values.',
    localFine: true,
  },
  'network-error': {
    badge: 'Offline',
    tone: 'warn',
    hint: 'Retrying automatically.',
    localFine: true,
  },
  'parse-error': {
    badge: 'Unexpected',
    tone: 'bad',
    hint: 'Nothing to do — this usually clears on its own.',
    localFine: true,
  },
  'never-fetched': { badge: 'Checking…', tone: 'neutral' },
};

const TONE_CLASS: Record<Tone, string> = {
  ok: 'badge badge--ok',
  warn: 'badge badge--warn',
  bad: 'badge badge--bad',
  neutral: 'badge',
};

function gaugeSize(count: number): number {
  if (count >= 3) return 78;
  return 96;
}

/** Remaining + reset under each gauge, so a window's facts sit with its dial. */
function GaugeSub({ w }: { w: OfficialWindow }): JSX.Element {
  const usage =
    w.used != null && w.limit != null
      ? `${formatCompact(w.used)} / ${formatCompact(w.limit)}`
      : `${formatPct(w.remainingPct)} left`;
  return (
    <>
      <span>{usage}</span>
      <span>
        {w.resetsAt === null ? (
          'no reset'
        ) : (
          <>
            resets{' '}
            <b>
              <Countdown resetsAt={w.resetsAt} fallback="—" short />
            </b>
          </>
        )}
      </span>
    </>
  );
}

/** The fix, as something you can actually run — click to copy. */
export function FixCommand({ command }: { command: string }): JSX.Element {
  const [copied, setCopied] = useState(false);

  const copy = (): void => {
    void navigator.clipboard
      .writeText(command)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      })
      .catch(() => {
        /* clipboard unavailable — the command is still readable on screen */
      });
  };

  return (
    <button className="fix" type="button" onClick={copy} title="Copy to clipboard">
      <span className="fix__prompt">$</span>
      <code>{command}</code>
      <span className="fix__copy">{copied ? 'copied' : 'copy'}</span>
    </button>
  );
}

/**
 * Explains why plan limits aren't showing, in the order that matters: what
 * happened, what fixes it, and what still works regardless.
 *
 * The last part is the point. A signed-out Claude Code only breaks the network
 * half — tokens, cost and burn rate come from local transcripts and keep
 * updating — but the panel previously showed a bare "No Claude credentials
 * found." which reads like the whole widget has died.
 */
function Explain({ official }: { official: OfficialUsage }): JSX.Element {
  const meta = STATUS[official.status];

  return (
    <div className="explain">
      <p className="explain__what">
        {official.message ?? meta.hint ?? 'Plan limits are unavailable.'}
      </p>

      {official.fix ? <FixCommand command={official.fix} /> : null}
      {!official.fix && meta.hint ? <p className="explain__hint">{meta.hint}</p> : null}

      {meta.localFine ? (
        <p className="explain__ok">
          Tokens, cost and burn rate keep updating — those are read from your local transcripts.
        </p>
      ) : null}

      {official.detail ? <p className="explain__detail">{official.detail}</p> : null}
    </div>
  );
}

export function OfficialPanel({ official }: OfficialPanelProps): JSX.Element {
  const showData = official.available && official.windows.length > 0;
  const size = gaugeSize(official.windows.length);
  const meta = STATUS[official.status];
  // Stale data is worth flagging even when the underlying status has its own
  // word, since the numbers on screen are real but no longer current.
  const badge = official.stale ? 'Cached' : meta.badge;
  const tone = official.stale ? 'warn' : meta.tone;

  return (
    <div className="panel">
      <div className="panel__head">
        <span className="panel__title">Plan usage</span>
        <span className="panel__spacer" />
        <span className={TONE_CLASS[tone]}>{badge}</span>
      </div>

      {showData ? (
        <>
          <div className="gauges">
            {official.windows.map((w) => (
              <RadialGauge
                key={w.key}
                value={w.utilization}
                size={size}
                label={w.label}
                sub={<GaugeSub w={w} />}
              />
            ))}
          </div>
          {/* Real numbers, but explain why they've stopped moving. */}
          {official.stale && official.message ? (
            <p className="explain__detail" style={{ marginTop: 8 }}>
              {official.message}
            </p>
          ) : null}
        </>
      ) : (
        <Explain official={official} />
      )}
    </div>
  );
}
