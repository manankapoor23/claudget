import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { pathExists, readFileSafe } from './util/fs';

const execFileAsync = promisify(execFile);

/** Keychain service name Claude Code uses to store its OAuth credentials on macOS. */
const MACOS_KEYCHAIN_SERVICE = 'Claude Code-credentials';

export interface ClaudeCredentials {
  accessToken: string;
  refreshToken: string | null;
  /** Epoch ms when the access token expires. */
  expiresAt: number;
  subscriptionType: string | null;
  rateLimitTier: string | null;
  scopes: string[];
  organizationUuid: string | null;
}

interface RawCredentials {
  claudeAiOauth?: {
    accessToken?: unknown;
    refreshToken?: unknown;
    expiresAt?: unknown;
    subscriptionType?: unknown;
    rateLimitTier?: unknown;
    scopes?: unknown;
  };
  organizationUuid?: unknown;
}

/**
 * Why credentials couldn't be read. Each value maps to a different thing the
 * user has to do, which is the whole point of separating them — "no credentials
 * found" told people nothing about whether to sign in, install Claude Code, fix
 * a path, or allow a Keychain prompt.
 */
export type CredentialsProblem =
  | 'signed-out'
  | 'not-installed'
  | 'keychain-denied'
  | 'malformed'
  | 'no-token';

export interface LookupOptions {
  /**
   * Injectable Keychain reader. Defaults to the real one — but tests must be
   * able to override it, or they read whatever is in the developer's own login
   * Keychain and pass or fail depending on whose machine they run on.
   */
  readKeychain?: () => Promise<KeychainRead>;
}

export interface CredentialsLookup {
  credentials: ClaudeCredentials | null;
  problem: CredentialsProblem | null;
  /** Where the credentials came from, for display. */
  source: 'file' | 'keychain' | null;
  /** Factual detail for the UI's small print. Never contains a secret. */
  detail: string | null;
}

/** `security` exit codes we can act on. 44 is "no such item". */
const KEYCHAIN_NOT_FOUND = 44;
/** 51 is authorization denied; 128 is the user dismissing the prompt. */
const KEYCHAIN_DENIED = new Set([51, 128]);

export interface KeychainRead {
  raw: RawCredentials | null;
  problem: CredentialsProblem | null;
  detail: string | null;
}

/**
 * Reads the raw credentials JSON from the macOS login Keychain, where Claude
 * Code stores its OAuth token instead of a file.
 *
 * The exit code matters: a missing entry (44) means signed out, while a denied
 * or dismissed Keychain prompt (51/128) means the token is probably there and we
 * simply weren't allowed to look. Those need opposite advice, so they are no
 * longer both swallowed as "nothing here". The secret is never logged.
 */
async function readMacKeychainCredentials(): Promise<KeychainRead> {
  const none: KeychainRead = { raw: null, problem: null, detail: null };
  if (process.platform !== 'darwin') return none;

  try {
    const { stdout } = await execFileAsync('security', [
      'find-generic-password',
      '-s',
      MACOS_KEYCHAIN_SERVICE,
      '-w',
    ]);
    const trimmed = stdout.trim();
    if (!trimmed) return none;
    try {
      return { raw: JSON.parse(trimmed) as RawCredentials, problem: null, detail: null };
    } catch {
      return {
        raw: null,
        problem: 'malformed',
        detail: `The "${MACOS_KEYCHAIN_SERVICE}" Keychain entry is not valid JSON.`,
      };
    }
  } catch (err) {
    const code = (err as { code?: unknown }).code;
    if (code === KEYCHAIN_NOT_FOUND) return none;
    if (typeof code === 'number' && KEYCHAIN_DENIED.has(code)) {
      return {
        raw: null,
        problem: 'keychain-denied',
        detail: `macOS denied access to the "${MACOS_KEYCHAIN_SERVICE}" Keychain entry.`,
      };
    }
    return none;
  }
}

/**
 * Reads Claude Code's OAuth credentials and, on failure, says why.
 *
 * Prefers `~/.claude/.credentials.json`, falling back to the macOS login
 * Keychain. The raw token is never logged or returned in `detail`.
 */
export async function lookupCredentials(
  credentialsPath: string,
  opts: LookupOptions = {},
): Promise<CredentialsLookup> {
  const claudeDir = path.dirname(credentialsPath);
  let source: 'file' | 'keychain' | null = null;
  let raw: RawCredentials | null = null;

  const fileText = await readFileSafe(credentialsPath);
  if (fileText !== null) {
    try {
      raw = JSON.parse(fileText) as RawCredentials;
      source = 'file';
    } catch {
      return {
        credentials: null,
        problem: 'malformed',
        source: 'file',
        detail: `${credentialsPath} exists but is not valid JSON.`,
      };
    }
  }

  if (!raw) {
    const keychain = await (opts.readKeychain ?? readMacKeychainCredentials)();
    if (keychain.problem) {
      return {
        credentials: null,
        problem: keychain.problem,
        source: 'keychain',
        detail: keychain.detail,
      };
    }
    if (keychain.raw) {
      raw = keychain.raw;
      source = 'keychain';
    }
  }

  if (!raw) {
    // Nothing in either place. Whether Claude Code has ever run here decides
    // between "sign in again" and "this isn't the right directory".
    const dirExists = await pathExists(claudeDir);
    return dirExists
      ? {
          credentials: null,
          problem: 'signed-out',
          source: null,
          detail: `No stored login in ${claudeDir} or the macOS Keychain.`,
        }
      : {
          credentials: null,
          problem: 'not-installed',
          source: null,
          detail: `${claudeDir} does not exist.`,
        };
  }

  const oauth = raw.claudeAiOauth;
  if (!oauth || typeof oauth.accessToken !== 'string' || oauth.accessToken.length === 0) {
    return {
      credentials: null,
      problem: 'no-token',
      source,
      detail: 'Credentials were found, but they carry no access token.',
    };
  }

  return {
    credentials: toCredentials(raw, oauth),
    problem: null,
    source,
    detail: null,
  };
}

/**
 * Just the credentials, or null. Kept for callers that only need the values and
 * not the reason — {@link lookupCredentials} is what the UI path uses.
 */
export async function readCredentials(
  credentialsPath: string,
  opts: LookupOptions = {},
): Promise<ClaudeCredentials | null> {
  return (await lookupCredentials(credentialsPath, opts)).credentials;
}

function toCredentials(
  raw: RawCredentials,
  oauth: NonNullable<RawCredentials['claudeAiOauth']>,
): ClaudeCredentials {
  return {
    accessToken: oauth.accessToken as string,
    refreshToken: typeof oauth.refreshToken === 'string' ? oauth.refreshToken : null,
    expiresAt: typeof oauth.expiresAt === 'number' ? oauth.expiresAt : 0,
    subscriptionType: typeof oauth.subscriptionType === 'string' ? oauth.subscriptionType : null,
    rateLimitTier: typeof oauth.rateLimitTier === 'string' ? oauth.rateLimitTier : null,
    scopes: Array.isArray(oauth.scopes)
      ? oauth.scopes.filter((s): s is string => typeof s === 'string')
      : [],
    organizationUuid: typeof raw.organizationUuid === 'string' ? raw.organizationUuid : null,
  };
}

export type RedactedCredentials = Omit<ClaudeCredentials, 'accessToken' | 'refreshToken'> & {
  hasAccessToken: boolean;
  hasRefreshToken: boolean;
};

/** Produces a secret-free view safe to include in snapshots and logs. */
export function redactCredentials(c: ClaudeCredentials): RedactedCredentials {
  return {
    expiresAt: c.expiresAt,
    subscriptionType: c.subscriptionType,
    rateLimitTier: c.rateLimitTier,
    scopes: c.scopes,
    organizationUuid: c.organizationUuid,
    hasAccessToken: c.accessToken.length > 0,
    hasRefreshToken: Boolean(c.refreshToken),
  };
}
