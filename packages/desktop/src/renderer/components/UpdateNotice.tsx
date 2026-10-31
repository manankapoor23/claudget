import { useState, type JSX } from 'react';
import { useStore } from '../store';
import { getBridge } from '../lib/api';
import { BREW_UPGRADE, type UpdateInfo } from '../../shared/update';
import { CheckIcon, CloseIcon, CopyIcon } from './icons';

const KEY = 'claudget-update-dismissed';

function dismissedVersion(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** `brew upgrade claudget`, with a button that copies it. */
export function BrewCommand(): JSX.Element {
  const [copied, setCopied] = useState(false);
  const copy = (): void => {
    void navigator.clipboard
      .writeText(BREW_UPGRADE)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {
        /* clipboard unavailable: the command is still on screen to select */
      });
  };
  return (
    <span className="brewcmd">
      <code>{BREW_UPGRADE}</code>
      <button
        type="button"
        className="iconbtn"
        onClick={copy}
        aria-label={copied ? 'Copied' : 'Copy command'}
        title={copied ? 'Copied' : 'Copy command'}
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
      </button>
    </span>
  );
}

type DownloadState = 'idle' | 'busy' | 'opened' | 'failed';

const AFTER: Record<'opened' | 'failed', string> = {
  opened: 'The installer is open. Quit claudget, then drag the new one into Applications.',
  failed: "Couldn't download it, so the release page is open instead.",
};

/**
 * Download (claudget fetches the DMG, checks it and opens it) or, for
 * Homebrew, the command to run; plus the release notes. After Download, a
 * line says what happened and what to do next.
 */
export function UpdateActions({ update }: { update: UpdateInfo }): JSX.Element {
  const bridge = getBridge();
  const [state, setState] = useState<DownloadState>('idle');
  const download = (): void => {
    if (!bridge) return;
    setState('busy');
    void bridge.openUpdate('download').then((ok) => setState(ok ? 'opened' : 'failed'));
  };
  const notes = (
    <button type="button" className="btn2" onClick={() => void bridge?.openUpdate('notes')}>
      What's new
    </button>
  );
  if (update.viaHomebrew) {
    return (
      <div className="update__actions update__actions--brew">
        <BrewCommand />
        {notes}
      </div>
    );
  }
  return (
    <>
      <div className="update__actions">
        <button
          type="button"
          className="btn2 btn2--primary"
          disabled={state === 'busy'}
          onClick={download}
        >
          {state === 'busy' ? 'Downloading…' : 'Download'}
        </button>
        {notes}
      </div>
      {state === 'opened' || state === 'failed' ? (
        <p className="update__after" role="status">
          {AFTER[state]}
        </p>
      ) : null}
    </>
  );
}

/**
 * macOS: a newer claudget is out. The Mac builds can't update themselves (see
 * shared/update.ts), so this says so and hands over the installer. Closing it
 * hides it until the next version.
 */
export function UpdateNotice(): JSX.Element | null {
  const update = useStore((s) => s.update);
  const [dismissed, setDismissed] = useState(dismissedVersion);
  if (!update || dismissed === update.version) return null;
  const close = (): void => {
    try {
      localStorage.setItem(KEY, update.version);
    } catch {
      // Private storage unavailable: it just won't stay closed.
    }
    setDismissed(update.version);
  };
  return (
    <section className="update" aria-label="Update available">
      <div className="update__head">
        <h2>claudget {update.version} is out</h2>
        <button
          type="button"
          className="iconbtn"
          aria-label="Not now"
          title="Not now"
          onClick={close}
        >
          <CloseIcon size={13} />
        </button>
      </div>
      <p>
        {update.viaHomebrew
          ? `You have ${update.current}. Installed with Homebrew, so update from Terminal:`
          : `You have ${update.current}. claudget can't update itself on a Mac yet, so it fetches the installer for you.`}
      </p>
      <UpdateActions update={update} />
    </section>
  );
}
