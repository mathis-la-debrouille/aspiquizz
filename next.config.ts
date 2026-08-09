import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Custom server (server.ts) hosts Next + Socket.IO on one process/port —
  // incompatible with Turbopack, see CLAUDE.md. The webpack dev server is
  // used instead (no --turbopack flag anywhere in the scripts).
  reactStrictMode: true,
  eslint: {
    // Linting runs separately via `pnpm lint`; don't block `next build` on it.
    ignoreDuringBuilds: true,
  },
  images: {
    // Question/media images are served through the authenticated /media/[id]
    // route, never next/image's remote loader against arbitrary hosts.
    unoptimized: false,
  },
};

export default nextConfig;
