import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectClaudeSetup, installCommandFor } from './setup';

const only = (...paths: string[]) => {
  const set = new Set(paths);
  return (p: string) => set.has(p);
};

describe('detectClaudeSetup', () => {
  const home = '/Users/sam';
  const mac = { platform: 'darwin' as const, home, env: { PATH: '/usr/bin:/bin' } };

  it('finds the claude command in the installers’ usual places, not just PATH', () => {
    expect(detectClaudeSetup({ ...mac, exists: only(`${home}/.local/bin/claude`) }).cli).toBe(true);
    expect(detectClaudeSetup({ ...mac, exists: only('/opt/homebrew/bin/claude') }).cli).toBe(true);
    expect(detectClaudeSetup({ ...mac, exists: only('/bin/claude') }).cli).toBe(true);
    expect(detectClaudeSetup({ ...mac, exists: only('/somewhere/else/claude') }).cli).toBe(false);
  });

  it('finds the Claude app, installed or having run', () => {
    expect(detectClaudeSetup({ ...mac, exists: only('/Applications/Claude.app') })).toEqual({
      cli: false,
      app: true,
    });
    const data = `${home}/Library/Application Support/Claude`;
    expect(detectClaudeSetup({ ...mac, exists: only(data) }).app).toBe(true);
    expect(detectClaudeSetup({ ...mac, exists: () => false })).toEqual({ cli: false, app: false });
  });

  it('knows the Windows places', () => {
    const env = { Path: 'C:\\Tools', LOCALAPPDATA: 'C:\\L', APPDATA: 'C:\\R' };
    const win = { platform: 'win32' as const, home: 'C:\\Users\\sam', env };
    expect(
      detectClaudeSetup({ ...win, exists: only(path.join('C:\\Tools', 'claude.exe')) }).cli,
    ).toBe(true);
    expect(
      detectClaudeSetup({ ...win, exists: only(path.join('C:\\R', 'npm', 'claude.cmd')) }).cli,
    ).toBe(true);
    expect(
      detectClaudeSetup({ ...win, exists: only(path.join('C:\\L', 'AnthropicClaude')) }).app,
    ).toBe(true);
  });
});

describe('installCommandFor', () => {
  it('gives the official installer for the platform', () => {
    expect(installCommandFor('darwin')).toBe('curl -fsSL https://claude.ai/install.sh | bash');
    expect(installCommandFor('linux')).toBe('curl -fsSL https://claude.ai/install.sh | bash');
    expect(installCommandFor('win32')).toBe('irm https://claude.ai/install.ps1 | iex');
  });
});
