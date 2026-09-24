"use client";

import { useEffect, useState } from "react";
import { IconTheme, IconMoon } from "../icons";

type Theme = "dark" | "light";

/** The theme on screen: a saved choice (set before paint), else the system's. */
function currentTheme(): Theme {
  const set = document.documentElement.dataset.theme;
  if (set === "light" || set === "dark") return set;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

/**
 * Both icons are always rendered and CSS shows the right one, from the same
 * rules that pick the colours — so the server-rendered button is already
 * correct before hydration, for a saved choice or the system default alike.
 */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    setTheme(currentTheme());
    // Follow the system while nothing has been chosen.
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => setTheme(currentTheme());
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
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
