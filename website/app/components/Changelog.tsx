import { IconArrowRight } from "../icons";
import {
  compareVersions,
  getLatestRelease,
  getReleaseHistory,
  type ReleaseHistoryEntry,
} from "../lib/release";

/** How many releases show before the rest fold away. */
const SHOWN = 3;

const tag = (v: string) => `https://github.com/manankapoor23/claudget/releases/tag/v${v}`;

/**
 * Hand-written copy for releases whose GitHub notes open with the bug rather
 * than the fix (or have no notes at all). Used in place of the parsed notes for
 * these versions, and as the whole changelog if GitHub can't be read. Newer
 * releases need nothing here: their GitHub title and first paragraph are used.
 */
const CURATED: ReleaseHistoryEntry[] = [
  {
    version: "0.3.0",
    date: "Sep 2026",
    title: "Now in your menu bar",
    summary:
      "claudget moves from a floating window into the menu bar, with a popover, an optional floating pill and bar, a dashboard with limit history, and alerts at 80% and 95%.",
    changes: [],
    url: tag("0.3.0"),
  },
  {
    version: "0.2.5.1",
    date: "Sep 2026",
    title: "Improved session names",
    summary:
      "Recent sessions show the real project name and a short summary of the first request, with the Git branch as a fallback.",
    changes: [],
    url: tag("0.2.5.1"),
  },
  {
    version: "0.2.5",
    date: "Aug 2026",
    title: "Plan limits explain themselves",
    summary:
      "When plan limits can’t be shown, the panel now says why and what fixes it. Signed out, Keychain access blocked, no Claude folder, and an expired login are all told apart.",
    changes: [],
    url: tag("0.2.5"),
  },
  {
    version: "0.2.4",
    date: "Aug 2026",
    title: "Half the size on disk",
    summary:
      "233 MB installed instead of 486 MB, and Apple Silicon and Intel downloads alongside the Universal one.",
    changes: [],
    url: tag("0.2.4"),
  },
  {
    version: "0.2.3",
    date: "Aug 2026",
    title: "macOS reliability",
    summary:
      "Live updates no longer stall during an active Claude Code session, and changing a setting no longer freezes the app on macOS 26.",
    changes: [],
    url: tag("0.2.3"),
  },
  {
    version: "0.2.2",
    date: "Jun 2026",
    title: "A new icon",
    summary: "New claudget app icon and branding across the app.",
    changes: [],
    url: tag("0.2.2"),
  },
];

function Entry({
  rel,
  published,
  badges,
}: {
  rel: ReleaseHistoryEntry;
  published: string;
  badges: boolean;
}) {
  // The "Latest" badge is derived from the release that is actually published,
  // not from list order — otherwise it labels whatever sits at the top as
  // latest, which is wrong the moment an entry exists before its tag does.
  // Anything ahead of the published release is marked "Unreleased" instead, so
  // the changelog can never disagree with what the download buttons hand you.
  // With GitHub unreachable the published version is a guess, so no badges.
  const order = compareVersions(rel.version, published);
  const title = rel.title ?? `Version ${rel.version}`;
  return (
    <article className="log__entry">
      <div className="log__meta" aria-hidden>
        <span className="log__verline">
          <span className="log__ver">v{rel.version}</span>
          {badges && order === 0 ? <span className="log__badge">Latest</span> : null}
          {badges && order > 0 ? (
            <span className="log__badge log__badge--next">Unreleased</span>
          ) : null}
        </span>
        {rel.date ? <span className="log__date">{rel.date}</span> : null}
      </div>
      <div>
        <h3 className="log__title">
          <span className="sr-only">
            v{rel.version}
            {badges && order === 0 ? ", latest" : ""}
            {badges && order > 0 ? ", unreleased" : ""}
            {rel.date ? `, ${rel.date}` : ""}:{" "}
          </span>
          {title}
        </h3>
        {rel.summary ? <p className="log__summary">{rel.summary}</p> : null}
        {!rel.summary && rel.changes.length > 0 ? (
          <ul className="log__list">
            {rel.changes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        ) : null}
        <a className="more log__link" href={rel.url} target="_blank" rel="noreferrer">
          Release notes<span className="sr-only"> for v{rel.version}</span>
          <IconArrowRight />
        </a>
      </div>
    </article>
  );
}

export async function Changelog() {
  const [{ version: published, stale }, history] = await Promise.all([
    getLatestRelease(),
    getReleaseHistory(),
  ]);
  const curated = new Map(CURATED.map((c) => [c.version, c]));
  const entries =
    history.length > 0
      ? history.map((rel) => {
          const own = curated.get(rel.version);
          return own ? { ...rel, title: own.title, summary: own.summary, changes: own.changes } : rel;
        })
      : CURATED;
  const recent = entries.slice(0, SHOWN);
  const earlier = entries.slice(SHOWN);
  const badges = !stale && history.length > 0;

  return (
    <div className="log">
      {recent.map((rel) => (
        <Entry key={rel.version} rel={rel} published={published} badges={badges} />
      ))}
      {earlier.length > 0 ? (
        <details className="log__more">
          <summary>
            Earlier releases ({earlier.length})
            <IconArrowRight />
          </summary>
          {earlier.map((rel) => (
            <Entry key={rel.version} rel={rel} published={published} badges={badges} />
          ))}
        </details>
      ) : null}
    </div>
  );
}
