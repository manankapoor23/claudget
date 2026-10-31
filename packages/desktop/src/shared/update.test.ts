import { describe, expect, it } from 'vitest';
import { compareVersions, macUpdateFrom, type GitHubRelease } from './update';

const DL = 'https://github.com/manankapoor23/claudget/releases/download/v0.3.6';
const release = (
  tag: string,
  names: string[],
  extra: Partial<GitHubRelease> = {},
): GitHubRelease => ({
  tag_name: tag,
  html_url: `https://github.com/manankapoor23/claudget/releases/tag/${tag}`,
  assets: names.map((name) => ({
    name,
    browser_download_url: `${DL}/${name}`,
    digest: `sha256:${name.includes('arm64') ? 'a' : 'b'}${'0'.repeat(63)}`,
  })),
  ...extra,
});
const ALL = ['claudget-0.3.6-arm64.dmg', 'claudget-0.3.6-x64.dmg', 'claudget-0.3.6-universal.dmg'];

describe('compareVersions', () => {
  it('compares numerically, part by part', () => {
    expect(compareVersions('0.3.10', '0.3.9')).toBeGreaterThan(0);
    expect(compareVersions('v0.3.5', '0.3.5')).toBe(0);
    expect(compareVersions('0.3', '0.3.0')).toBe(0);
    expect(compareVersions('0.2.9', '0.3.0')).toBeLessThan(0);
  });
  it('treats anything unreadable as equal, so it never offers a bogus update', () => {
    expect(compareVersions('nightly', '0.3.5')).toBe(0);
  });
});

describe('macUpdateFrom', () => {
  it("offers this Mac's own DMG", () => {
    expect(macUpdateFrom(release('v0.3.6', ALL), '0.3.5', 'arm64', false)).toEqual({
      version: '0.3.6',
      current: '0.3.5',
      downloadUrl: `${DL}/claudget-0.3.6-arm64.dmg`,
      sha256: `a${'0'.repeat(63)}`,
      notesUrl: 'https://github.com/manankapoor23/claudget/releases/tag/v0.3.6',
      viaHomebrew: false,
    });
    expect(macUpdateFrom(release('v0.3.6', ALL), '0.3.5', 'x64', true)?.downloadUrl).toBe(
      `${DL}/claudget-0.3.6-x64.dmg`,
    );
  });
  it('falls back to the universal DMG, then the release page', () => {
    const uni = release('v0.3.6', ['claudget-0.3.6-universal.dmg']);
    expect(macUpdateFrom(uni, '0.3.5', 'arm64', false)?.downloadUrl).toBe(
      `${DL}/claudget-0.3.6-universal.dmg`,
    );
    const none = release('v0.3.6', []);
    expect(macUpdateFrom(none, '0.3.5', 'arm64', false)).toMatchObject({
      downloadUrl: none.html_url,
      sha256: null,
    });
  });
  it('offers nothing when up to date, ahead, or for drafts and pre-releases', () => {
    expect(macUpdateFrom(release('v0.3.5', ALL), '0.3.5', 'arm64', false)).toBeNull();
    expect(macUpdateFrom(release('v0.3.4', ALL), '0.3.5', 'arm64', false)).toBeNull();
    expect(
      macUpdateFrom(release('v0.3.6', ALL, { prerelease: true }), '0.3.5', 'arm64', false),
    ).toBeNull();
    expect(
      macUpdateFrom(release('v0.3.6', ALL, { draft: true }), '0.3.5', 'arm64', false),
    ).toBeNull();
    expect(macUpdateFrom(release('latest', ALL), '0.3.5', 'arm64', false)).toBeNull();
  });
});
