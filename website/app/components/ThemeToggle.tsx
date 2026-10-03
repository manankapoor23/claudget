"use client";

import { useEffect, useState } from "react";
import { IconTheme, IconMoon } from "../icons";

type Theme = "dark" | "light";

/** The theme on screen: a saved choice (set before paint), else paper. The
 *  site is light first, whatever the system prefers. */
function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

/**
 * Both icons are always rendered and CSS shows the right one, from the same
 * rule that picks the colours — so the server-rendered button is already
 * correct before hydration, for a saved choice or the default alike.
 */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    setTheme(currentTheme());
  }, []);

  function toggle() {
    const next: Theme = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("claudget-theme", next);
    } catch {
      /* storage unavailable — ignore */
    }
    setTheme(next);
  }

  const label =
    theme === null ? "Switch theme" : theme === "dark" ? "Switch to light theme" : "Switch to dark theme";
  return (
    <button type="button" className="icon-btn theme-toggle" onClick={toggle} aria-label={label} title={label}>
      <IconTheme className="theme-toggle__sun" />
      <IconMoon className="theme-toggle__moon" />
    </button>
  );
}
