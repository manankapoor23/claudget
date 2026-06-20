"use client";

import { useEffect, useState } from "react";
import { IconTheme, IconMoon } from "../icons";

type Theme = "dark" | "light";

export default function ThemeToggle() {
  // Dark is the default; the inline boot script may have already set "light".
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const current = (document.documentElement.dataset.theme as Theme) || "dark";
    setTheme(current);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("claudget-theme", next);
    } catch {
      /* storage unavailable — ignore */
    }
    setTheme(next);
  }

  const isDark = theme === "dark";
  return (
    <button
      type="button"
      className="btn btn--icon"
      onClick={toggle}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Light theme" : "Dark theme"}
    >
      {isDark ? (
        <IconTheme style={{ width: 16, height: 16 }} />
      ) : (
        <IconMoon style={{ width: 16, height: 16 }} />
      )}
    </button>
  );
}