import type { Metadata, Viewport } from "next";
import { Inter, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { getLatestRelease } from "./lib/release";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-mono",
  display: "swap",
});

const SITE_URL = "https://claudget.vercel.app";
/* Kept under ~155 characters: Google truncates the snippet around there, and the
   old 207-character version was being cut mid-sentence in results. */
const DESCRIPTION =
  "A small desktop monitor for Claude Code. Track tokens, cost, burn rate and plan limits from your own local transcripts. Free, open source, local-first.";

/* Social cards allow more room than a search snippet, so this one can breathe. */
const SOCIAL_DESCRIPTION =
  "Track Claude Code tokens, cost, burn rate and plan limits from a small always-on-top desktop widget. Reads your own local transcripts — no API key, read-only by default. macOS, Windows, Linux.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "claudget — Claude Code usage widget for your desktop",
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  verification: { google: "hisrb3hbv1S2oTt03-oC5inr18nAOWq47tRmBq02tNQ" },
  keywords: [
    "claudget",
    "Claude Code",
    "usage widget",
    "token usage",
    "Anthropic",
    "desktop widget",
    "burn rate",
    "plan limits",
    "Electron",
  ],
  authors: [{ name: "Manan Kapoor", url: "https://github.com/manankapoor23" }],
  creator: "Manan Kapoor",
  openGraph: {
    title: "claudget — a small desktop monitor for Claude Code",
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
    title: "claudget — a small desktop monitor for Claude Code",
    description: SOCIAL_DESCRIPTION,
    // Image comes from app/twitter-image.tsx.
  },
  icons: {
    icon: [{ url: "/claudget-logo.png", type: "image/png" }],
    apple: [{ url: "/claudget-logo.png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#14181a" },
    { media: "(prefers-color-scheme: light)", color: "#c7d3c2" },
  ],
};

// Applied before paint so a saved light-theme choice doesn't flash dark.
const THEME_BOOT = `(function(){try{var t=localStorage.getItem('claudget-theme');if(t==='light'||t==='dark'){document.documentElement.dataset.theme=t;}}catch(e){}})();`;

// Same trick for the download buttons: tag the platform before first paint so
// CSS can promote the visitor's own installer with no spinner and no swap.
// Left unset on mobile / unknown UAs, which shows the neutral "Download free".
const OS_BOOT = `(function(){try{var n=navigator,u=n.userAgent||"",p=(n.userAgentData&&n.userAgentData.platform)||n.platform||"",s=p+" "+u,o="";if(/android/i.test(s)){}else if(/iphone|ipad|ipod/i.test(s)){}else if(/mac/i.test(s)){o="mac";}else if(/win/i.test(s)){o="win";}else if(/linux|x11|cros/i.test(s)){o="linux";}if(o){document.documentElement.dataset.os=o;}}catch(e){}})();`;

// Structured data — tells Google this is a free, cross-platform downloadable app.
// `softwareVersion` comes from the live release so it can't drift out of date.
const jsonLd = (version: string) => ({
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "claudget",
  alternateName: "Claude Code usage widget",
  applicationCategory: "DeveloperApplication",
  applicationSubCategory: "Developer utility",
  operatingSystem: "macOS 11+, Windows 10+, Linux x64",
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

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { version } = await getLatestRelease();
  return (
    <html
      lang="en"
      className={`${inter.variable} ${plexMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
        <script dangerouslySetInnerHTML={{ __html: OS_BOOT }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd(version)) }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}