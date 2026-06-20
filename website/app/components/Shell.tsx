import { LogoMark } from "../icons";
import ThemeToggle from "./ThemeToggle";

const NAV = [
  { id: "features", label: "Features" },
  { id: "how", label: "How it works" },
  { id: "download", label: "Download" },
];

export default function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell">
      {/* Toolbar header — sole chrome: brand left, nav + theme right */}
      <header className="header">
        <a href="#overview" className="header__brand">
          <LogoMark style={{ width: 30, height: 30 }} />
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
          <ThemeToggle />
        </div>
      </header>

      <main className="main">{children}</main>
    </div>
  );
}
