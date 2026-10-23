import ThemeToggle from "./ThemeToggle";
import { DownloadCount } from "./Download";

/** In page order; Download is the header's own button instead. */
const DEFAULT_NAV = [
  { id: "features", label: "Features" },
  { id: "privacy", label: "Privacy" },
];

export default function Shell({
  children,
  footer,
  nav = DEFAULT_NAV,
  headerClass = "",
}: {
  children: React.ReactNode;
  footer?: React.ReactNode;
  nav?: { id: string; label: string }[];
  /** Extra class on the header, for a page that restyles it. */
  headerClass?: string;
}) {
  return (
    <div className="shell">
      <header className={`header ${headerClass}`.trim()}>
        <div className="wrap header__inner">
          <a href="#top" className="brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/app-icon.png" alt="" width={26} height={26} />
            claudget
          </a>
          <nav className="nav" aria-label="Sections">
            {nav.map(({ id, label }) => (
              <a key={id} href={`#${id}`}>
                {label}
              </a>
            ))}
          </nav>
          <div className="header__right">
            <DownloadCount />
            <a className="btn btn--xs header__cta" href="#download">
              Download
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
