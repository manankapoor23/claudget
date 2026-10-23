"use client";

import { useEffect, useState } from "react";
import { Pill } from "../ui/Pill";
import { resetsIn, usePct } from "./store";

/**
 * While its section is on screen, the pill floats over the page itself, in
 * the corner, showing the same live number as the notch — the way it floats
 * over every window on the desktop.
 */
export default function FloatingPill({ target }: { target: string }) {
  const pct = usePct();
  const [on, setOn] = useState(false);

  useEffect(() => {
    const el = document.getElementById(target);
    if (!el || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(([e]) => setOn(e.isIntersecting), {
      rootMargin: "-30% 0px -30% 0px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, [target]);

  return (
    <div className="home-float ui-dark" data-on={on ? "" : undefined} aria-hidden="true">
      <Pill label="5-hour" pct={Math.round(pct)} estimated reset={resetsIn(pct)} />
    </div>
  );
}
