// npm run stats — the project's numbers, for the maintainer's eyes only.
//
// Reads public GitHub counters and, when this machine is logged in to the
// Vercel CLI, the website's Web Analytics. Nothing here touches the app, and
// the app still sends nothing anywhere: the "running copies" figure is an
// estimate from GitHub's own count of the update-check files that installed
// Windows and Linux builds fetch.
//
// Optional: GITHUB_TOKEN (else `gh auth token`), VERCEL_TOKEN (else the Vercel
// CLI's login), VERCEL_PROJECT_ID / VERCEL_TEAM_ID (else website/.vercel).

/* global fetch */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = 'manankapoor23/claudget';
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INSTALLER = /\.(dmg|exe|AppImage|deb)$/;
/** Installed Windows/Linux builds check for an update at launch and every 6 h. */
const CHECKS_PER_DAY = 4;
const DAY = 86_400_000;

const fmt = (n) => n.toLocaleString('en-US');

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function githubToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  try {
    return execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim() || null;
  } catch {
    return null;
  }
}

async function github(endpoint, token) {
  const res = await fetch(`https://api.github.com/${endpoint}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) throw new Error(`GitHub ${endpoint}: HTTP ${res.status}`);
  return res.json();
}

function vercelAuth() {
  const token =
    process.env.VERCEL_TOKEN ??
    [
      path.join(os.homedir(), 'Library/Application Support/com.vercel.cli/auth.json'),
      path.join(os.homedir(), '.local/share/com.vercel.cli/auth.json'),
    ]
      .map(readJson)
      .find((a) => a?.token)?.token;
  const link = readJson(path.join(repoRoot, 'website/.vercel/project.json'));
  const projectId = process.env.VERCEL_PROJECT_ID ?? link?.projectId;
  const teamId = process.env.VERCEL_TEAM_ID ?? link?.orgId;
  return token && projectId ? { token, projectId, teamId } : null;
}

async function visits(auth, filter) {
  const url = new URL('https://api.vercel.com/v1/query/web-analytics/visits/count');
  url.searchParams.set('projectId', auth.projectId);
  if (auth.teamId) url.searchParams.set('teamId', auth.teamId);
  url.searchParams.set('filter', filter);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${auth.token}` } });
  if (!res.ok) throw new Error(`Vercel analytics: HTTP ${res.status}`);
  const body = await res.json();
  return { ...body.data, since: body.query?.since };
}

function row(label, value, note = '') {
  console.log(`  ${label.padEnd(30)} ${String(value).padStart(8)}${note ? `   ${note}` : ''}`);
}

const token = githubToken();
const [repo, releases] = await Promise.all([
  github(`repos/${REPO}`, token),
  github(`repos/${REPO}/releases?per_page=100`, token),
]);
const published = releases.filter((r) => !r.draft);
const latest = published.find((r) => !r.prerelease) ?? published[0];
const installers = (r) =>
  r.assets.filter((a) => INSTALLER.test(a.name)).reduce((s, a) => s + a.download_count, 0);
const asset = (r, name) => r?.assets.find((a) => a.name === name)?.download_count ?? 0;

console.log(`\nclaudget stats — ${new Date().toLocaleString()}\n`);

console.log('GitHub');
row(
  'Installer downloads',
  fmt(published.reduce((s, r) => s + installers(r), 0)),
  'every release; updates count again',
);
if (latest) {
  row(`  of which ${latest.tag_name}`, fmt(installers(latest)));
}
row('Stars', fmt(repo.stargazers_count));
row('Forks', fmt(repo.forks_count));
row('Open issues + PRs', fmt(repo.open_issues_count));

if (latest) {
  const days = Math.max(1, (Date.now() - Date.parse(latest.published_at)) / DAY);
  const perDay = (n) => Math.round(n / days / CHECKS_PER_DAY);
  const win = asset(latest, 'latest.yml');
  const linux = asset(latest, 'latest-linux.yml');
  console.log(
    `\nRunning copies (Windows + Linux, rough), over ${days.toFixed(1)} days of ${latest.tag_name}`,
  );
  row('Windows', `~${fmt(perDay(win))}`, `${fmt(win)} update checks`);
  row('Linux', `~${fmt(perDay(linux))}`, `${fmt(linux)} update checks`);
  console.log('  Macs never check (no auto-update), so they are not in this.');
}

console.log('\nWebsite (Vercel Web Analytics)');
const auth = vercelAuth();
if (!auth) {
  console.log('  skipped: log in with `vercel login`, and link website/ with `vercel link`');
} else {
  try {
    const [clicks, home] = await Promise.all([
      visits(auth, "startswith(requestPath, '/get/')"),
      visits(auth, "requestPath eq '/'"),
    ]);
    row('Download clicks (visitors)', fmt(clicks.visitors), `${fmt(clicks.pageviews)} clicks`);
    row('Homepage visitors', fmt(home.visitors), `${fmt(home.pageviews)} views`);
    console.log(
      `  Since ${clicks.since?.slice(0, 10) ?? 'analytics began'}; clicks only since 2026-10-08.` +
        ' A visitor counts once a day, and ad blockers hide some.',
    );
  } catch (err) {
    console.log(`  skipped: ${err.message}`);
  }
}
console.log('');
