import { compareVersions, getLatestRelease } from '../lib/release';

/* Curated, user-facing summary — deliberately shorter than the repo's
   CHANGELOG.md, which carries the full engineering detail. Add an entry here
   when you cut a release; the badge below works itself out. */
const ENTRIES = [
  {
    version: '0.2.4',
    date: 'Aug 2026',
    changes: [
      'Roughly half the size on disk — 233 MB installed instead of 486 MB. Dropped ~220 Chromium locale bundles the English-only UI can never read, and stopped shipping macOS as a universal binary that put two copies of the Electron framework on every machine.',
      'macOS now has three downloads: Universal, Apple Silicon and Intel. The per-arch builds are about half the size; Universal still works on any Mac and stays the default.',
    ],
  },
  {
    version: '0.2.3',
    date: 'Aug 2026',
    changes: [
      'Fixed on macOS: live updates no longer stall during an active Claude Code session — the widget stayed frozen for the whole session and only caught up every two minutes.',
      'Fixed on macOS 26: changing a setting no longer freezes the app. Dragging the opacity slider is smooth again.',
    ],
  },
  {
    version: '0.2.2',
    date: 'Jun 2026',
    changes: ['New claudget app icon and branding across the app.'],
  },
  {
    version: '0.2.1',
    date: 'Jun 2026',
    changes: ['Renamed to claudget — installers are now claudget-<version>-…'],
  },
  {
    version: '0.2.0',
    date: 'Jun 2026',
    changes: [
      'Glassmorphism redesign — frosted UI, single coral accent.',
      'Budgets & alerts: daily/monthly spend limits with native notifications at 80% and 100%.',
      'Spend forecast, plan-pace badge, and an insights panel (top project, model split, busiest hour).',
      'Stays on top across every macOS Space and over fullscreen apps.',
      'Auto-update on Windows & Linux.',
    ],
  },
];

/**
 * The "Latest" badge is derived from the release that is actually published, not
 * from this list's order — otherwise it labels whatever happens to sit at the top
 * as latest, which is wrong the moment an entry is written before its tag exists.
 * Anything ahead of the published release is marked "Unreleased" instead, so the
 * changelog can never disagree with what the download buttons hand you.
 */
export async function Changelog() {
  const { version: published } = await getLatestRelease();

  return (
    <div className="changelog">
      {ENTRIES.map((rel) => {
        const order = compareVersions(rel.version, published);
        return (
          <div className="changelog__entry" key={rel.version}>
            <div className="changelog__head">
              <span className="changelog__ver">v{rel.version}</span>
              {order === 0 ? <span className="changelog__latest">Latest</span> : null}
              {order > 0 ? (
                <span
                  className="changelog__latest changelog__latest--unreleased"
                  title="Merged, but not yet published as a downloadable release."
                >
                  Unreleased
                </span>
              ) : null}
              <span className="changelog__date">{rel.date}</span>
            </div>
            <ul className="changelog__list">
              {rel.changes.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
