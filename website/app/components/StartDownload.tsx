"use client";

import { useEffect } from "react";

/**
 * Starts the download once this page's view has been handed to Vercel Web
 * Analytics, since that view is the click count.
 *
 * How the view is sent (@vercel/analytics 2.0.1 and its /_vercel/insights
 * script): <Analytics /> queues the page view on `window.vaq` and injects a
 * deferred script. When that script runs it sets `window.vai = true`, takes
 * over `window.va`, drains the queue and posts the view with
 * `fetch(…, { keepalive: true })`, which survives the page going away. So
 * `window.vai` is the signal: once it is set, the view is already on its way,
 * and a short settle (for the script's own await before the fetch) is enough.
 *
 * The flag is the script's private init guard, not an API, so nothing hangs on
 * it: if the script is blocked (ad blockers block it, and it never runs in an
 * automated browser) or a later version drops the flag, the download starts
 * after MAX_WAIT_MS anyway. Either way the GitHub asset is served as an
 * attachment, so the browser saves it and this page, with its first-launch
 * steps, stays on screen.
 */

const POLL_MS = 50;
/** After the script is up: its pageview fetch goes out a microtask or two later. */
const SETTLE_MS = 120;
/** Never hold a download longer than this, whatever analytics is doing. */
const MAX_WAIT_MS = 900;

export default function StartDownload({ href }: { href: string }) {
  useEffect(() => {
    let done = false;
    let settle: number | undefined;
    const started = performance.now();

    function go() {
      if (done) return;
      done = true;
      window.clearInterval(poll);
      window.clearTimeout(settle);
      window.location.assign(href);
    }

    const poll = window.setInterval(() => {
      if ((window as { vai?: boolean }).vai) {
        window.clearInterval(poll);
        settle = window.setTimeout(go, SETTLE_MS);
      } else if (performance.now() - started >= MAX_WAIT_MS) {
        go();
      }
    }, POLL_MS);

    return () => {
      done = true;
      window.clearInterval(poll);
      window.clearTimeout(settle);
    };
  }, [href]);

  return null;
}
