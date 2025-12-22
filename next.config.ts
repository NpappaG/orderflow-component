import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root so Turbopack doesn't walk up to unrelated lockfiles
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
