import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createNoopLogger } from '@claude-widget/core';
import {
  LATEST_RELEASE_URL,
  MacUpdateCheck,
  downloadInstaller,
  installedViaHomebrew,
} from './update-check';

const release = (tag: string) => ({
  tag_name: tag,
  html_url: `https://github.com/manankapoor23/claudget/releases/tag/${tag}`,
  assets: [
    {
      name: `claudget-${tag.slice(1)}-arm64.dmg`,
      browser_download_url: `https://example.test/claudget-${tag.slice(1)}-arm64.dmg`,
    },
  ],
});

function setup(reply: () => Promise<unknown>) {
  const onChange = vi.fn();
  const fetchJson = vi.fn(reply);
  const check = new MacUpdateCheck({
    currentVersion: '0.3.5',
    arch: 'arm64',
    viaHomebrew: false,
    logger: createNoopLogger(),
    fetchJson,
    onChange,
  });
  return { check, onChange, fetchJson };
}

describe('MacUpdateCheck', () => {
  it('asks GitHub for the latest release and reports a newer one once', async () => {
    const { check, onChange, fetchJson } = setup(async () => release('v0.3.6'));
    await check.check();
    await check.check();
    expect(fetchJson).toHaveBeenCalledWith(LATEST_RELEASE_URL);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(check.update).toMatchObject({
      version: '0.3.6',
      downloadUrl: 'https://example.test/claudget-0.3.6-arm64.dmg',
    });
  });

  it('reports nothing when up to date', async () => {
    const { check, onChange } = setup(async () => release('v0.3.5'));
    await check.check();
    expect(check.update).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps what it knew when a check fails or GitHub replies with something else', async () => {
    let reply: () => Promise<unknown> = async () => release('v0.3.6');
    const { check } = setup(() => reply());
    await check.check();
    reply = async () => {
      throw new Error('offline');
    };
    await check.check();
    reply = async () => ({ message: 'API rate limit exceeded' });
    await check.check();
    expect(check.update?.version).toBe('0.3.6');
  });

  it('clears the notice when checking is switched off', async () => {
    const { check, onChange } = setup(async () => release('v0.3.6'));
    await check.check();
    check.clear();
    expect(check.update).toBeNull();
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});

describe('installedViaHomebrew', () => {
  it("looks for the cask in Homebrew's Caskroom, Apple silicon or Intel", () => {
    expect(installedViaHomebrew((p) => p === '/opt/homebrew/Caskroom/claudget')).toBe(true);
    expect(installedViaHomebrew((p) => p === '/usr/local/Caskroom/claudget')).toBe(true);
    expect(installedViaHomebrew(() => false)).toBe(false);
  });
});

describe('downloadInstaller', () => {
  const body = new TextEncoder().encode('a fake dmg');
  const sha = createHash('sha256').update(body).digest('hex');
  const update = (sha256: string | null, name = 'claudget-0.3.6-arm64.dmg') => ({
    version: '0.3.6',
    current: '0.3.5',
    downloadUrl: `https://example.test/v0.3.6/${name}`,
    sha256,
    notesUrl: 'https://example.test/v0.3.6',
    viaHomebrew: false,
  });
  const reply = async () => new Response(body);
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'claudget-dl-'));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('saves the DMG when its SHA-256 matches GitHub', async () => {
    const file = await downloadInstaller(update(sha), dir, reply);
    expect(file).toBe(path.join(dir, 'claudget-0.3.6-arm64.dmg'));
    expect(fs.readFileSync(file, 'utf8')).toBe('a fake dmg');
  });

  it('refuses a download that does not match, and leaves nothing behind', async () => {
    await expect(downloadInstaller(update('0'.repeat(64)), dir, reply)).rejects.toThrow(
      'Checksum mismatch',
    );
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it('only downloads DMGs, and gives up on an HTTP error', async () => {
    const page = { ...update(null), downloadUrl: 'https://example.test/releases/tag/v0.3.6' };
    await expect(downloadInstaller(page, dir, reply)).rejects.toThrow('No installer');
    const gone = async () => new Response('nope', { status: 404 });
    await expect(downloadInstaller(update(sha), dir, gone)).rejects.toThrow('HTTP 404');
  });
});
