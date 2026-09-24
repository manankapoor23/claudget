import { IconGitHub } from "../icons";
import { REPO_URL } from "../constants";
import ThemeToggle from "./ThemeToggle";

/** In page order; Download is the header's own button instead. */
const NAV = [
  { id: "features", label: "Features" },
  { id: "privacy", label: "Privacy" },
  { id: "changelog", label: "Changelog" },
];

export default function Shell({
  children,
  footer,
}: {
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="shell">
      <header className="header">
        <div className="wrap header__inner">
          <a href="#top" className="brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/app-icon.png" alt="" width={26} height={26} />
            claudget
          </a>
          <nav className="nav" aria-label="Sections">
            {NAV.map(({ id, label }) => (
              <a key={id} href={`#${id}`}>
                {label}
              </a>
            ))}
          </nav>
          <div className="header__right">
            <a className="btn btn--primary btn--xs header__cta" href="#download">
              Download
            </a>
            <a
              className="icon-btn"
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              aria-label="claudget on GitHub"
              title="Source on GitHub"
            >
              <IconGitHub />
            </a>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main>{children}</main>
      {footer}
    </div>
  );
}
