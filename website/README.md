# claudget — website

Marketing / download site for **claudget**, the real-time Claude Code usage widget for the
desktop. Built with **Next.js (App Router)** + **TypeScript**, statically prerendered, and
designed to deploy to **Vercel** with zero configuration.

The visual language is an **Ink & Sage** take on [`../DESIGN.md`](../DESIGN.md): neo-brutalist,
editorial, printed-report aesthetic — IBM Plex Mono, a fixed icon sidebar, a sage toolbar
header, hard 2px borders, no rounded corners, no shadows, terminal-style gauges. The site is
**dark by default** with a light-theme toggle in the header (persisted to `localStorage`);
both themes share one set of CSS custom properties in [`app/globals.css`](app/globals.css).

## Local development

```bash
cd website
npm install
npm run dev      # http://localhost:3000
```

Other scripts:

| Script          | What it does                                  |
| --------------- | --------------------------------------------- |
| `npm run dev`   | Dev server with hot reload.                   |
| `npm run build` | Production build (static prerender).          |
| `npm run start` | Serve the production build locally.           |

## Deploying to Vercel

This site lives in a subdirectory (`website/`) of a monorepo whose root is the Electron app,
so Vercel must be told where the site is.

### Option A — Vercel dashboard (recommended)

1. Push this repo to GitHub (already at `github.com/manankapoor23/claudget`).
2. In Vercel → **Add New Project** → import the `claudget` repo.
3. Set **Root Directory** to `website`.
4. Framework preset auto-detects **Next.js**. Build command `next build`, output handled
   automatically. Click **Deploy**.

Every push to `main` then redeploys automatically.

### Option B — Vercel CLI

```bash
cd website
npx vercel            # first run: log in + link the project, set root dir to "."
npx vercel --prod     # promote to production
```

## Updating download links

Download buttons point at the repo's **latest GitHub release**
(`/releases/latest`). All external links are centralized in
[`app/constants.ts`](app/constants.ts) — update `REPO_URL` there if the repo moves.

Publish platform binaries with `npm run package` (from the repo root) and attach the
artifacts to a GitHub release; the buttons resolve to whatever the latest release contains.

## Structure

```
website/
  app/
    layout.tsx        Root layout, fonts (IBM Plex Mono), metadata, viewport
    page.tsx          All page sections + the widget mockup
    globals.css       Design system — every token from DESIGN.md
    icons.tsx         Stroke-based SVG icon set
    constants.ts      External URLs (repo, releases, docs)
    components/
      Shell.tsx       Fixed sidebar + yellow toolbar header (scroll-spy nav)
  public/
    icon.svg          Favicon (bar-chart mark)
```