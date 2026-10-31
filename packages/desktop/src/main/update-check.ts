import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Logger } from '@claude-widget/core';
import { macUpdateFrom, type GitHubRelease, type UpdateInfo } from '../shared/update';

export const LATEST_RELEASE_URL =
  'https://api.github.com/repos/manankapoor23/claudget/releases/latest';
/** Soon after launch, then this often. */
export const FIRST_CHECK_DELAY_MS = 10_000;
export const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

/**
 * Downloads the new DMG into `dir` and checks it against GitHub's SHA-256.
 * Fetched by claudget rather than a browser, it carries no quarantine flag, so
 * the app copied out of it opens without the "damaged" warning. Resolves the
 * file's path.
 */
export async function downloadInstaller(
  update: UpdateInfo,
  dir: string,
  fetchFn: (url: string) => Promise<Response>,
): Promise<string> {
  const name = path.basename(new URL(update.downloadUrl).pathname);
  if (!name.endsWith('.dmg')) throw new Error('No installer for this Mac');
  const res = await fetchFn(update.downloadUrl);
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  const file = path.join(dir, name);
  const part = `${file}.download`;
  const hash = createHash('sha256');
  const out = fs.createWriteStream(part);
  try {
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      hash.update(chunk);
      if (!out.write(chunk)) await new Promise<void>((r) => out.once('drain', () => r()));
    }
    await new Promise<void>((resolve, reject) =>
      out.end((err?: Error | null) => (err ? reject(err) : resolve())),
    );
    const got = hash.digest('hex');
    if (update.sha256 && got !== update.sha256) throw new Error('Checksum mismatch');
    fs.renameSync(part, file);
    return file;
  } catch (err) {
    out.destroy();
    fs.rmSync(part, { force: true });
    throw err;
  }
}

/** Homebrew keeps a Caskroom entry for every cask it installed. */
export function installedViaHomebrew(exists: (p: string) => boolean = fs.existsSync): boolean {
  return ['/opt/homebrew/Caskroom/claudget', '/usr/local/Caskroom/claudget'].some(exists);
}

function isRelease(x: unknown): x is GitHubRelease {
  const r = x as Partial<GitHubRelease> | null;
  return (
    typeof r?.tag_name === 'string' && typeof r.html_url === 'string' && Array.isArray(r.assets)
  );
}

export interface MacUpdateCheckDeps {
  currentVersion: string;
  arch: string;
  viaHomebrew: boolean;
  logger: Logger;
  fetchJson: (url: string) => Promise<unknown>;
  onChange: (update: UpdateInfo | null) => void;
}

/**
 * macOS: asks GitHub for the latest release and keeps the newer one, if any,
 * for the popover and About to offer. A failed check keeps what it knew.
 */
export class MacUpdateCheck {
  private latest: UpdateInfo | null = null;

  constructor(private readonly deps: MacUpdateCheckDeps) {}

  get update(): UpdateInfo | null {
    return this.latest;
  }

  async check(): Promise<void> {
    let release: unknown;
    try {
      release = await this.deps.fetchJson(LATEST_RELEASE_URL);
    } catch (err) {
      this.deps.logger.warn('Update check failed', { err: String(err) });
      return;
    }
    if (!isRelease(release)) {
      this.deps.logger.warn('Update check: unexpected reply');
      return;
    }
    const { currentVersion, arch, viaHomebrew } = this.deps;
    this.set(macUpdateFrom(release, currentVersion, arch, viaHomebrew));
  }

  /** Checking switched off: stop offering what was found. */
  clear(): void {
    this.set(null);
  }

  private set(next: UpdateInfo | null): void {
    if (JSON.stringify(next) === JSON.stringify(this.latest)) return;
    this.latest = next;
    if (next) this.deps.logger.info('Update available', { version: next.version });
    this.deps.onChange(next);
  }
}
