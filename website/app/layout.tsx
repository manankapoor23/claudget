import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-mono",
  display: "swap",
});

const SITE_URL = "https://claudget.vercel.app";
const DESCRIPTION =
  "claudget — a lightweight, always-on-top desktop widget that shows your Claude Code usage in real time: tokens, cost, burn rate, plan limits, and recent sessions. 100% local by default. macOS, Windows, Linux.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "claudget — real-time Claude Code usage on your desktop",
  description: DESCRIPTION,
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
    title: "claudget — real-time Claude Code usage",
    description: DESCRIPTION,
    url: SITE_URL,
    siteName: "claudget",
    type: "website",
    images: [{ url: "/claudget-logo.png", width: 512, height: 512, alt: "claudget" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "claudget — real-time Claude Code usage",
    description: DESCRIPTION,
    images: ["/claudget-logo.png"],
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={plexMono.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}