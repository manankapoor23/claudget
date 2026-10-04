// Writes a fake-but-realistic Claude Code data directory for the screenshot
// workflow: a few projects of transcript JSONL (same shape as the core parser
// tests), spread over the last week, with activity in the last hour so the
// current 5-hour block is live. No credentials are written, so plan limits
// show as signed out — exactly what a brand-new user sees.
//
//   node .github/screenshots/fixtures.mjs [claudeDir]   (default: ~/.claude)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? path.join(os.homedir(), '.claude'));
const HOUR = 3_600_000;
const now = Date.now();

const projects = [
  {
    cwd: '/home/dev/code/acme-api',
    branch: 'feature/rate-limits',
    model: 'claude-sonnet-4-6',
    titles: ['Add per-tenant rate limiting to the gateway', 'Fix the flaky webhook retry test'],
  },
  {
    cwd: '/home/dev/code/marketing-site',
    branch: 'main',
    model: 'claude-opus-4-8',
    titles: ['Redesign the pricing page hero', 'Make the nav accessible on mobile'],
  },
  {
    cwd: '/home/dev/code/infra',
    branch: 'chore/terraform-1.9',
    model: 'claude-haiku-4-5',
    titles: ['Bump terraform and fix the plan diff'],
  },
];

// Deterministic pseudo-random so every run renders the same numbers.
let seed = 42;
const rand = () => {
  seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31;
  return seed / 2 ** 31;
};

const slugOf = (cwd) => cwd.replace(/[/\\.]/g, '-');
let msg = 0;

for (const [pi, p] of projects.entries()) {
  const dir = path.join(root, 'projects', slugOf(p.cwd));
  fs.mkdirSync(dir, { recursive: true });
  p.titles.forEach((title, ti) => {
    const sessionId = `sess-${pi}-${ti}-${Math.floor(rand() * 1e9).toString(16)}`;
    // Sessions start between 6 days and 40 minutes ago; the first one is "now".
    const start = pi === 0 && ti === 0 ? now - 40 * 60_000 : now - (6 - pi - ti) * 22 * HOUR;
    const lines = [
      JSON.stringify({
        type: 'user',
        cwd: p.cwd,
        gitBranch: p.branch,
        sessionId,
        timestamp: new Date(start).toISOString(),
        message: { role: 'user', content: title },
      }),
    ];
    const turns = 18 + Math.floor(rand() * 30);
    for (let t = 0; t < turns; t++) {
      const ts = start + t * (60_000 + rand() * 90_000);
      if (ts > now) break;
      msg++;
      lines.push(
        JSON.stringify({
          type: 'assistant',
          timestamp: new Date(ts).toISOString(),
          requestId: `req_${msg}`,
          sessionId,
          uuid: `u${msg}`,
          cwd: p.cwd,
          gitBranch: p.branch,
          message: {
            id: `msg_${msg}`,
            model: p.model,
            usage: {
              input_tokens: Math.floor(3 + rand() * 40),
              output_tokens: Math.floor(120 + rand() * 1800),
              cache_creation_input_tokens: Math.floor(rand() * 9000),
              cache_read_input_tokens: Math.floor(15_000 + rand() * 90_000),
            },
          },
        }),
      );
    }
    const file = path.join(dir, `${sessionId}.jsonl`);
    fs.writeFileSync(file, lines.join('\n') + '\n');
    const mtime = new Date(Math.min(now, start + turns * 100_000));
    fs.utimesSync(file, mtime, mtime);
  });
}

// What the app reads to detect the CLI version (see detectCliVersion).
fs.mkdirSync(path.join(root, 'sessions'), { recursive: true });
fs.writeFileSync(
  path.join(root, 'sessions', 'fixture.json'),
  JSON.stringify({ version: '2.3.4 (Claude Code)' }),
);

console.log(`fixtures: wrote ${msg} assistant turns under ${root}`);
