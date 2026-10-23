import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./ui.css";
import "./motion.css";
import { getLatestRelease } from "./lib/release";
import { Analytics } from "@vercel/analytics/next";

/* Apple devices render the system face (SF Pro), exactly as the app does, and
   never download these: with preload off, a browser only fetches a web font
   once an earlier family in the stack has failed to match. Everyone else gets
   Geist, which is what the app ships on Windows and Linux. */
const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
  preload: false,
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
  preload: false,
});

const SITE_URL = "https://claudget.vercel.app";

/* Kept to about 155 characters: Google truncates the snippet around there, and
   an old 207-character version was being cut mid-sentence in results. */
const TITLE = "claudget — your Claude Code limit, traced round the notch";

const DESCRIPTION =
  "Your Claude Code 5-hour limit as a line round your MacBook’s notch, and both limits in the menu bar, or a click away in the system tray. Free and open source.";

/* Social cards allow more room than a search snippet, so this one can breathe. */
const SOCIAL_DESCRIPTION =
  "A thin line round your MacBook’s notch grows as you use your Claude Code 5-hour limit; hover it for the details. Both limits sit in the menu bar, or a click away in the system tray, with alerts at 80% and 95%. Free and open source for macOS, Windows and Linux.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  // The canonical URL is declared by app/page.tsx: set here, every other route
  // (the 404 included) would claim to be the home page.
  verification: { google: "hisrb3hbv1S2oTt03-oC5inr18nAOWq47tRmBq02tNQ" },
  keywords: [
    "claudget",
    "Claude Code",
    "usage limits",
    "5-hour limit",
    "weekly limit",
    "menu bar app",
    "MacBook notch",
    "token usage",
    "Anthropic",
    "plan limits",
  ],
  authors: [{ name: "Manan Kapoor", url: "https://github.com/manankapoor23" }],
  creator: "Manan Kapoor",
  openGraph: {
    title: TITLE,
    description: SOCIAL_DESCRIPTION,
    url: SITE_URL,
    siteName: "claudget",
    type: "website",
    locale: "en_US",
    // Image comes from app/opengraph-image.tsx — declaring one here would
    // override the generated 1200x630 card with the old square logo.
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: SOCIAL_DESCRIPTION,
    // Image comes from app/twitter-image.tsx.
  },
  // Icons come from the file conventions: app/icon.png (the tile, edge to
  // edge, so it isn't tiny in a tab) and app/apple-icon.png (full-bleed and
  // opaque, since iOS rounds it and fills transparency with black).
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Paper, for everyone: the site is light first, whatever the system prefers.
  themeColor: "#f7f5f0",
};

// Applied before paint so a saved choice doesn't flash the other theme. With
// nothing saved, the site is paper (light), whatever the system prefers.
const THEME_BOOT = `(function(){try{var t=localStorage.getItem('claudget-theme');if(t==='light'||t==='dark'){document.documentElement.dataset.theme=t;}}catch(e){}})();`;

// Same trick for the platform: tag it before first paint so CSS can promote
// the visitor's own installer and show their own version of the page (the
// notch on a Mac, the tray on Windows and Linux) with no spinner and no swap.
// Left unset on mobile / unknown UAs, which get the Mac page and the neutral
// "Download". iPadOS presents a Mac user agent by default; touch points give
// it away (a real Mac reports none). `?os=mac|windows|linux` forces it, to
// preview each version; nothing links there.
const OS_BOOT = `(function(){try{var n=navigator,u=n.userAgent||"",p=(n.userAgentData&&n.userAgentData.platform)||n.platform||"",s=p+" "+u,o="",q=/[?&]os=(mac|windows|linux)(&|$)/.exec(location.search);if(q){o=q[1]==="windows"?"win":q[1];}else if(/android/i.test(s)){}else if(/iphone|ipad|ipod/i.test(s)){}else if(/mac/i.test(s)){if(!(n.maxTouchPoints>1)){o="mac";}}else if(/win/i.test(s)){o="win";}else if(/linux|x11|cros/i.test(s)){o="linux";}if(o){document.documentElement.dataset.os=o;}}catch(e){}})();`;

// Scroll entrances, as progressive enhancement. Only when this script runs, the
// observer exists and motion is welcome does `data-motion` go on <html>; only
// then does motion.css hold a [data-reveal] unit at its first frame until it
// scrolls into view (the bottom 18% of the viewport doesn't count, so it plays
// where it can be seen). With JS off, or if anything here throws, nothing is
// ever held back.
const MOTION_BOOT = `(function(){try{var d=document.documentElement;if(!("IntersectionObserver" in window)||matchMedia("(prefers-reduced-motion: reduce)").matches)return;d.dataset.motion="";document.addEventListener("DOMContentLoaded",function(){try{var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.dataset.in="";io.unobserve(e.target);}});},{rootMargin:"0px 0px -18% 0px"});document.querySelectorAll("[data-reveal]").forEach(function(el){io.observe(el);});}catch(e){delete d.dataset.motion;}});}catch(e){}})();`;

// Structured data — tells Google this is a free, cross-platform downloadable app.
// `softwareVersion` comes from the live release so it can't drift out of date.
const jsonLd = (version: string) => ({
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "claudget",
  applicationCategory: "DeveloperApplication",
  applicationSubCategory: "Developer utility",
  operatingSystem: "macOS 12+, Windows 10+ (x64), Linux (x64)",
  softwareRequirements: "Claude Code CLI",
  description: DESCRIPTION,
  url: SITE_URL,
  downloadUrl: "https://github.com/manankapoor23/claudget/releases/latest",
  installUrl: `${SITE_URL}/#download`,
  softwareVersion: version,
  softwareHelp: "https://github.com/manankapoor23/claudget#readme",
  releaseNotes: "https://github.com/manankapoor23/claudget/releases/latest",
  screenshot: `${SITE_URL}/opengraph-image`,
  isAccessibleForFree: true,
  license: "https://github.com/manankapoor23/claudget/blob/main/LICENSE",
  author: { "@type": "Person", name: "Manan Kapoor", url: "https://github.com/manankapoor23" },
  maintainer: {
    "@type": "Person",
    name: "Manan Kapoor",
    url: "https://github.com/manankapoor23",
  },
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  // No aggregateRating: there are no real reviews to point at, and inventing
  // one is exactly the kind of thing that earns a structured-data penalty.
});

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { version } = await getLatestRelease();
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
        <script dangerouslySetInnerHTML={{ __html: OS_BOOT }} />
        <script dangerouslySetInnerHTML={{ __html: MOTION_BOOT }} />
        <script
          type="application/ld+json"
          // "<" escaped so no string in the data (a tag name, say) can close the script.
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(jsonLd(version)).replace(/</g, "\\u003c"),
          }}
        />
      </head>
      <body>
        {children}
        {/* Vercel Web Analytics — page views only, no cookies, no cross-site
            identifiers. Sends nothing outside production. */}
        <Analytics />
      </body>
    </html>
  );
}
