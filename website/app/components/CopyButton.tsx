"use client";

import { useEffect, useState } from "react";

/** Copies a command, the way the app's own fix-it panel does, and says so. */
export default function CopyButton({ text, what }: { text: string; what: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(t);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      // Clipboard blocked (insecure context, permissions) — the text stays selectable.
    }
  }

  return (
    <>
      <button type="button" className="copy" onClick={copy} aria-label={`Copy ${what}`}>
        {copied ? "Copied" : "Copy"}
      </button>
      <span className="sr-only" role="status">
        {copied ? `${what} copied` : ""}
      </span>
    </>
  );
}
