import { LogoMark } from "../icons";
import { REPO_URL } from "../constants";
import ThemeToggle from "./ThemeToggle";

const NAV = [
  { id: "app", label: "The app" },
  { id: "how", label: "How it works" },
  { id: "changelog", label: "Changelog" },
  { id: "download", label: "Download" },
];

export default function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell">
      <header className="header">
        <div className="header__inner">
          <a href="#top" className="header__brand">
            <LogoMark style={{ width: 18, height: 18 }} />
            claudget
          </a>
          <span className="header__spacer" />
          <nav className="header__nav">
            {NAV.map(({ id, label }) => (
              <a key={id} href={`#${id}`} className="header__link">
                {label}
              </a>
            ))}
          </nav>
          <div className="header__right">
            <a
              className="btn"
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              aria-label="Source on GitHub"
            >
              GitHub
            </a>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="main">{children}</main>
    </div>
  );
}
