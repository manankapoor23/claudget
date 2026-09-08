import {
  compareVersions,
  getLatestRelease,
  getReleaseHistory,
  type ReleaseHistoryEntry,
} from "../lib/release";

/* Used only if GitHub is unavailable during a render. Published releases are
   normally the source of truth, so new releases appear without editing this file. */
const FALLBACK_ENTRIES: ReleaseHistoryEntry[] = [
  {
    version: "0.2.5",
    date: "Aug 2026",
    changes: [
      "When plan limits can't be shown, the panel now says why and what fixes it. Signed out, Keychain access blocked, no Claude directory, and an expired or rejected login are all told apart — each needs a different thing from you.",
      "It also makes clear that tokens, cost and burn rate keep working regardless: those are read from your local transcripts and need no login at all.",
    ],
    url: "https://github.com/manankapoor23/claudget/releases/tag/v0.2.5",
  },
  {
    version: "0.2.4",
    date: "Aug 2026",
    changes: [
      "Roughly half the size on disk — 233 MB installed instead of 486 MB. Dropped ~220 Chromium locale bundles the English-only UI can never read, and stopped shipping macOS as a universal binary that put two copies of the Electron framework on every machine.",
      "macOS now has three downloads: Universal, Apple Silicon and Intel. The per-arch builds are about half the size; Universal still works on any Mac and stays the default.",
    ],
    url: "https://github.com/manankapoor23/claudget/releases/tag/v0.2.4",
  },
  {
    version: "0.2.3",
    date: "Aug 2026",
    changes: [
      "Fixed on macOS: live updates no longer stall during an active Claude Code session — the widget stayed frozen for the whole session and only caught up every two minutes.",
      "Fixed on macOS 26: changing a setting no longer freezes the app. Dragging the opacity slider is smooth again.",
    ],
    url: "https://github.com/manankapoor23/claudget/releases/tag/v0.2.3",
  },
  {
    version: "0.2.2",
    date: "Jun 2026",
    changes: ["New claudget app icon and branding across the app."],
    url: "https://github.com/manankapoor23/claudget/releases/tag/v0.2.2",
  },
  {
    version: "0.2.1",
    date: "Jun 2026",
    changes: ["Renamed to claudget — installers are now claudget-<version>-…"],
    url: "https://github.com/manankapoor23/claudget/releases/tag/v0.2.1",
  },
  {
    version: "0.2.0",
    date: "Jun 2026",
    changes: [
      "Glassmorphism redesign — frosted UI, single coral accent.",
      "Budgets & alerts: daily/monthly spend limits with native notifications at 80% and 100%.",
      "Spend forecast, plan-pace badge, and an insights panel (top project, model split, busiest hour).",
      "Stays on top across every macOS Space and over fullscreen apps.",
      "Auto-update on Windows & Linux.",
    ],
    url: "https://github.com/manankapoor23/claudget/releases/tag/v0.2.0",
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
  const [{ version: published }, history] = await Promise.all([
    getLatestRelease(),
    getReleaseHistory(),
  ]);
  const entries = history.length > 0 ? history : FALLBACK_ENTRIES;

  return (
    <div className="changelog">
      {entries.map((rel) => {
        const order = compareVersions(rel.version, published);
        return (
          <div className="changelog__entry" key={rel.version}>
            <div className="changelog__head">
              <a className="changelog__ver" href={rel.url} target="_blank" rel="noreferrer">
                v{rel.version}
              </a>
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
