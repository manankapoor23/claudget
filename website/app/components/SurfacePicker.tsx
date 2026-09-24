"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export interface Surface {
  id: string;
  name: string;
  /** One line under the stage, saying what this view is for. */
  desc: string;
  /** Server-rendered stage for this surface. */
  stage: ReactNode;
}

/**
 * A segmented control over one full-width stage. A WAI-ARIA tab set: arrow
 * keys, Home and End move and select; each stage is a focusable tabpanel.
 * Every panel is rendered up front and only faded, so all of them are in the
 * HTML and the stage never changes height.
 */
export default function SurfacePicker({ surfaces }: { surfaces: Surface[] }) {
  const [active, setActive] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const uid = useId();

  function select(i: number) {
    const next = (i + surfaces.length) % surfaces.length;
    setActive(next);
    tabs.current[next]?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const keys: Record<string, () => void> = {
      ArrowRight: () => select(active + 1),
      ArrowDown: () => select(active + 1),
      ArrowLeft: () => select(active - 1),
      ArrowUp: () => select(active - 1),
      Home: () => select(0),
      End: () => select(surfaces.length - 1),
    };
    const run = keys[e.key];
    if (!run) return;
    e.preventDefault();
    run();
  }

  return (
    <div className="picker">
      <div
        className="picker__tabs"
        role="tablist"
        aria-label="Ways to see your usage"
        onKeyDown={onKeyDown}
      >
        {surfaces.map((s, i) => (
          <button
            key={s.id}
            ref={(el) => {
              tabs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${uid}-tab-${s.id}`}
            className="picker__tab"
            aria-selected={i === active}
            aria-controls={`${uid}-panel-${s.id}`}
            tabIndex={i === active ? 0 : -1}
            onClick={() => setActive(i)}
          >
            {s.name}
          </button>
        ))}
      </div>

      <div className="picker__stage">
        {surfaces.map((s, i) => (
          <div
            key={s.id}
            role="tabpanel"
            id={`${uid}-panel-${s.id}`}
            className="picker__panel"
            aria-labelledby={`${uid}-tab-${s.id}`}
            tabIndex={0}
            data-active={i === active ? "" : undefined}
            inert={i !== active}
          >
            {s.stage}
            <p className="picker__caption">{s.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
