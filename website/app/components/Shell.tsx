"use client";

import { useEffect, useState } from "react";
import {
  LogoMark,
  IconOverview,
  IconFeatures,
  IconFlow,
  IconDownload,
  IconGitHub,
} from "../icons";
import { REPO_URL } from "../constants";
import ThemeToggle from "./ThemeToggle";

const NAV = [
  { id: "overview", label: "Home", Icon: IconOverview },
  { id: "features", label: "Specs", Icon: IconFeatures },
  { id: "how", label: "Flow", Icon: IconFlow },
  { id: "download", label: "Get", Icon: IconDownload },
];

export default function Shell({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState("overview");

  useEffect(() => {
    const ids = [...NAV.map((n) => n.id), "footer"];
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.id);
        }
      },
      { rootMargin: "-45% 0px -50% 0px", threshold: 0 },
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  return (
    <div className="shell">
      {/* Fixed sidebar */}
      <aside className="sidebar">
        <a href="#overview" className="sidebar__logo" aria-label="Top">
          <LogoMark style={{ width: 22, height: 22 }} />
        </a>
        <nav className="sidebar__nav">
          {NAV.map(({ id, label, Icon }) => (
            <a
              key={id}
              href={`#${id}`}
              className={`navitem ${active === id ? "is-active" : ""}`}
            >
              <Icon />
              <span>{label}</span>
            </a>
          ))}
        </nav>
        <a
          className="navitem sidebar__foot"
          href={REPO_URL}
          target="_blank"
          rel="noreferrer"
        >
          <IconGitHub style={{ width: 24, height: 24 }} />
          <span>Code</span>
        </a>
      </aside>

      {/* Toolbar header — minimal: brand left, actions right */}
      <header className="header">
        <a href="#overview" className="header__brand">
          <LogoMark style={{ width: 16, height: 16, color: "var(--accent)" }} />
          claudget
        </a>
        <span className="header__spacer" />
        <div className="header__right">
          <ThemeToggle />
          <a className="btn btn--primary" href="#download">
            <IconDownload style={{ width: 16, height: 16 }} />
            Download
          </a>
        </div>
      </header>

      <main className="main">{children}</main>
    </div>
  );
}