import type { JSX } from 'react';
import type { OfficialStatus, OfficialUsage } from '@claude-widget/core';
import { useStore } from '../store';
import { getBridge } from '../lib/api';
import { SignInSteps, needsInstall } from './OfficialPanel';
import { LimitsSkeleton } from './States';

type Action = 'enable' | 'retry' | 'settings';

interface Copy {
  title: string;
  body: string;
  action: Action;
}

/** What each state means for you, and the one thing that fixes it. */
const COPY: Record<Exclude<OfficialStatus, 'ok' | 'never-fetched'>, Copy> = {
  disabled: {
    title: 'Plan limits are off',
    body: 'Turn them on to see your 5-hour and weekly limits, with alerts before you hit them.',
    action: 'enable',
  },
  'signed-out': {
    title: 'Sign in to Claude Code',
    body: 'Plan limits come from your Claude login. Run this, sign in, then check again.',
    action: 'retry',
  },
  expired: {
    title: 'Your Claude login expired',
    body: 'Run Claude Code once to refresh it, then check again.',
    action: 'retry',
  },
  unauthorized: {
    title: 'Anthropic rejected the login',
    body: 'Sign in to Claude Code again, then check again.',
    action: 'retry',
  },
  'credentials-malformed': {
    title: "Couldn't read your Claude login",
    body: 'Sign in to Claude Code again to rewrite it.',
    action: 'retry',
  },
  'not-installed': {
    title: 'Claude Code not found',
    body: 'Install Claude Code, or point claudget at your Claude folder in Settings.',
    action: 'settings',
  },
  'keychain-denied': {
    title: 'Keychain access needed',
    body: 'Allow access when macOS asks — claudget only reads the Claude Code login.',
    action: 'retry',
  },
  'rate-limited': {
    title: 'Anthropic is rate-limiting',
    body: 'Showing your last known limits. claudget backs off and retries on its own.',
    action: 'retry',
  },
  'network-error': {
    title: "Can't reach Anthropic",
    body: "You're offline or the service is down. Retrying automatically.",
    action: 'retry',
  },
  'parse-error': {
    title: 'Unexpected response',
    body: 'Anthropic sent something claudget didn’t recognise. This usually clears on its own.',
    action: 'retry',
  },
};

const ACTION_LABEL: Record<Action, string> = {
  enable: 'Turn on',
  retry: 'Check again',
  settings: 'Open Settings',
};

/**
 * The copy for this state. Without the `claude` command, "run claude" is a
 * dead end — the Claude app writes ~/.claude too, so an app-only user looked
 * signed out and was told to run a command they didn't have.
 */
function copyFor(official: OfficialUsage): Copy {
  const app = official.setup?.app === true;
  if (needsInstall(official)) {
    return app
      ? {
          title: 'Connect your Claude plan',
          body: 'claudget reads your limits through Claude Code’s login; the Claude app keeps its own to itself. Install Claude Code and sign in once. You won’t need to use it after that.',
          action: 'retry',
        }
      : {
          title: 'Install Claude Code',
          body: 'claudget reads your plan limits through Claude Code’s login. Install it and sign in once.',
          action: 'retry',
        };
  }
  if (official.status === 'signed-out' && app) {
    return {
      ...COPY['signed-out'],
      body: 'claudget reads your limits through Claude Code’s login, which is separate from the Claude app’s. Run this and sign in once.',
    };
  }
  return COPY[official.status as keyof typeof COPY];
}

/**
 * Stands in for the limits when there aren't any to show: one headline for
 * why, one line of what to do, and a button that does it. Local tokens keep
 * updating either way, and it says so.
 */
export function LimitsNotice({ official }: { official: OfficialUsage }): JSX.Element {
  const updateConfig = useStore((s) => s.updateConfig);
  if (official.status === 'ok' || official.status === 'never-fetched') return <LimitsSkeleton />;
  const copy = copyFor(official);
  const bridge = getBridge();

  const act = (): void => {
    if (copy.action === 'enable') void updateConfig({ enableOfficial: true });
    else if (copy.action === 'settings') void bridge?.windowAction({ type: 'open-settings' });
    else void bridge?.refresh();
  };

  return (
    <section className="notice2" data-status={official.status} aria-live="polite">
      <div className="notice2__text">
        <h3>{copy.title}</h3>
        <p>{copy.body}</p>
        <SignInSteps official={official} />
        {needsInstall(official) ? (
          <p className="notice2__small">
            Claude Code comes with Pro, Max, Team and Enterprise plans.
          </p>
        ) : null}
      </div>
      <div className="notice2__foot">
        <button type="button" className="btn2 btn2--primary" onClick={act}>
          {ACTION_LABEL[copy.action]}
        </button>
        {official.status !== 'disabled' ? (
          <span className="notice2__aside">Local usage keeps updating</span>
        ) : null}
      </div>
    </section>
  );
}
