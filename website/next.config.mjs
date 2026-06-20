import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Pin the workspace root to this folder — the repo root also has a lockfile
  // (the Electron app), and Next would otherwise infer the wrong root.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;