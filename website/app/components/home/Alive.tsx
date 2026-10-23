"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Notch } from "../notch/Notch";
import { NotchCard } from "../notch/NotchCard";
import { Notice } from "../ui/Notice";
import { Pill } from "../ui/Pill";
import { WinToast } from "../ui/WinToast";
import { GlyphTray } from "../../icons";
import { TrayDesk } from "./TrayDesk";
import { cardFor, getPct, limitFor, resetsIn, setPct, usePct } from "./store";

/**
 * The page wears the product. The notch hangs from the top of the page, over
 * the header, with the line round it; in the hero its card is open, and a
 * slider (or a short played session) spends the limit so the line grows,
 * turns amber and red, and the page posts the same notifications the app
 * would. Scrolled, the notch settles into the header and its card drops on
 * hover or tap, as on a Mac.
 */

type Toast = { id: number; title: string; body: string };

/** The app's default alert thresholds, highest first. */
const THRESHOLDS = [95, 80];

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** A played session: spend most of the limit, get both alerts, see it reset
 *  (the pale glint lap), then climb back to where the page started. */
const SESSION: { to: number; ms: number; hold: number }[] = [
  { to: 97, ms: 5200, hold: 1500 },
  { to: 0, ms: 0, hold: 3600 },
  { to: 62, ms: 2600, hold: 0 },
];

export default function Alive({ children }: { children: ReactNode }) {
  const pct = usePct();
  const [planPct, setPlanPct] = useState(62);
  const [drawn, setDrawn] = useState(false);
  const [compact, setCompact] = useState(false);
  const [open, setOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const announced = useRef(0);
  const raf = useRef(0);
  const touched = useRef(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The line draws itself in once; after that, changes ease (notch.css).
  useEffect(() => {
    const t = setTimeout(() => setDrawn(true), 1500);
    return () => clearTimeout(t);
  }, []);

  // Scrolled past the hero's top, the notch settles into the header.
  useEffect(() => {
    let f = 0;
    const on = () => {
      if (f) return;
      f = requestAnimationFrame(() => {
        f = 0;
        const c = window.scrollY > 24;
        setCompact(c);
        if (!c) setOpen(false);
      });
    };
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => {
      window.removeEventListener("scroll", on);
      cancelAnimationFrame(f);
    };
  }, []);

  // The app's alerts, as the app decides them (shared/alerts.ts,
  // main/limit-alerts.ts): once per threshold per window — the highest one
  // crossed that hasn't been announced — and silence until the window resets,
  // which here is the line going back to 0%.
  useEffect(() => {
    if (pct <= 0) {
      announced.current = 0;
      return;
    }
    const crossed = THRESHOLDS.find((t) => pct >= t);
    if (crossed === undefined || crossed <= announced.current) return;
    announced.current = crossed;
    const left = Math.max(0, Math.round(100 - pct));
    const title =
      left === 0
        ? "5-hour limit reached"
        : crossed >= 95
          ? "5-hour limit almost gone"
          : `5-hour limit at ${crossed}%`;
    const id = Date.now() + Math.random();
    setToasts((t) => [
      ...t.slice(-1),
      { id, title, body: `${left}% left · resets in ${resetsIn(pct)}` },
    ]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5200);
  }, [pct]);

  const stop = useCallback(() => {
    cancelAnimationFrame(raf.current);
    setPlaying(false);
  }, []);

  const play = useCallback(() => {
    cancelAnimationFrame(raf.current);
    setPlaying(true);
    let step = 0;
    let from = getPct();
    let t0 = performance.now();
    const tick = (now: number) => {
      // Played only while the hero is in view: reading on, the page settles
      // back where it started rather than posting alerts over the text.
      if (window.scrollY > window.innerHeight * 0.6) {
        setPct(62);
        setPlaying(false);
        return;
      }
      const s = SESSION[step];
      const t = now - t0;
      if (t < s.ms) {
        setPct(from + (s.to - from) * ease(t / s.ms));
      } else {
        setPct(s.to);
        if (t >= s.ms + s.hold) {
          step += 1;
          if (step >= SESSION.length) {
            setPlaying(false);
            return;
          }
          from = getPct();
          t0 = now;
        }
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  }, []);

  // Once, if the visitor is still at the top and hasn't touched anything.
  useEffect(() => {
    if (!("motion" in document.documentElement.dataset)) return;
    const t = setTimeout(() => {
      if (!touched.current && window.scrollY < 80) play();
    }, 3400);
    return () => {
      clearTimeout(t);
      cancelAnimationFrame(raf.current);
    };
  }, [play]);

  const hover = (on: boolean) => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (on) setOpen(true);
    else hideTimer.current = setTimeout(() => setOpen(false), 180);
  };

  const p = Math.round(pct);
  const card = cardFor(pct);
  // What the card says, spoken the app's way (shared/limits.ts pctSpoken).
  const spoken = [
    `5-hour limit about ${p} percent used, estimated`,
    card.resetsIn ? `resets in ${card.resetsIn}` : "no reset scheduled",
    card.fullBy ? `full by ${card.fullBy}` : null,
    `weekly ${card.weekly} percent used. Open the full picture.`,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <>
      {/* On a Mac (and wherever the platform is unknown): the notch, over the
          header. Decorative to assistive tech: the hero card and slider below
          carry the same numbers. */}
      <div className="home-notch os-mac" data-compact={compact ? "" : undefined}>
        <div className="home-notch__scale">
          <Notch
            id={`home-${planPct}`}
            pct={pct}
            cometPct={planPct}
            className={playing ? "is-live" : ""}
            estimated
            draw={!drawn}
            delay={0.2}
            drawFor={1.1}
            onCometLoop={() => setPlanPct(Math.round(getPct()))}
            style={{ "--k": "var(--kb)" } as React.CSSProperties}
          />
          <button
            type="button"
            className="home-notch__hit"
            aria-label={`5-hour limit about ${p} percent used, estimated. Show the details.`}
            aria-expanded={compact ? open : true}
            onPointerEnter={(e) => compact && e.pointerType === "mouse" && hover(true)}
            onPointerLeave={(e) => compact && e.pointerType === "mouse" && hover(false)}
            // Keyboard focus opens it; a tap's focus leaves that to the click.
            onFocus={(e) => compact && e.currentTarget.matches(":focus-visible") && setOpen(true)}
            onBlur={() => compact && setOpen(false)}
            onClick={() => {
              if (compact) setOpen((o) => !o);
            }}
          />
          {/* Settled in the header, it has claudget's menu-bar item beside
              it, as on any Mac: both limits, the estimate wearing its "~". */}
          <span className="home-notch__title" aria-hidden="true">
            <GlyphTray width={16} height={16} />
            <span>
              ~{p}% · {card.weekly}%
            </span>
          </span>
        </div>
      </div>

      {/* Scrolled: the card drops from the notch, as on the machine. */}
      <div
        className="home-hovercard os-mac"
        data-open={compact && open ? "" : undefined}
        onPointerEnter={(e) => e.pointerType === "mouse" && hover(true)}
        onPointerLeave={(e) => e.pointerType === "mouse" && hover(false)}
      >
        <a href="#picture" className="home-hovercard__link" aria-label="Open the full picture">
          <NotchCard data={card} />
        </a>
      </div>

      <section className="home-hero" aria-labelledby="hero-title">
        <a href="#picture" className="home-slot os-mac" aria-label={spoken}>
          <NotchCard
            data={card}
            className={playing ? "home-slot__card is-live" : "home-slot__card"}
          />
        </a>

        {/* Windows and Linux: the tray, its popover open, and the pill. The
            pill's ring wears the app's verdict tone (shared/limits.ts
            verdictFor): amber from 70%, red from 90%; below 70% only a pace
            that would fill the limit 15 points ahead of the clock turns it,
            which this steady demo never reaches. */}
        <div className="home-desk os-other">
          <TrayDesk
            className={playing ? "is-live" : ""}
            label="claudget on Windows and Linux: its tray icon pressed and the popover open above the taskbar, with the 5-hour limit, the weekly limit, today’s tokens and the busiest sessions; the floating pill in the corner. The slider below spends the limit."
            five={limitFor(pct)}
            pill={<Pill label="5-hour" pct={p} estimated reset={resetsIn(pct)} />}
          />
        </div>

        <div className="home-try">
          <button
            type="button"
            className="home-try__play"
            onClick={() => {
              touched.current = true;
              if (playing) stop();
              else play();
            }}
            aria-label={playing ? "Pause the session" : "Play a session"}
          >
            {playing ? (
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <rect x="4" y="3" width="2.6" height="10" rx="1" />
                <rect x="9.4" y="3" width="2.6" height="10" rx="1" />
              </svg>
            ) : (
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M5 3.2v9.6a.6.6 0 0 0 .9.5l7.6-4.8a.6.6 0 0 0 0-1L5.9 2.7a.6.6 0 0 0-.9.5z" />
              </svg>
            )}
          </button>
          <label className="home-try__track" data-tone={p >= 90 ? "bad" : p >= 70 ? "warn" : "ok"}>
            <span className="sr-only">Try it: how much of the 5-hour limit is used</span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={p}
              style={{ "--v": `${p}%` } as React.CSSProperties}
              onChange={(e) => {
                touched.current = true;
                stop();
                setPct(Number(e.target.value));
              }}
            />
          </label>
          <output className="home-try__val">{p}%</output>
        </div>

        {children}
      </section>

      {/* The app's notifications, posted by the page. */}
      <div className="home-toasts ui-dark" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="home-toast">
            <div className="os-mac">
              <Notice title={t.title} body={t.body} when="now" />
            </div>
            <div className="os-other">
              <WinToast title={t.title} body={t.body} />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
