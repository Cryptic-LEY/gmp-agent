import type { NextConfig } from "next";
import path from "path";

const allowedDevOrigins = [
  "localhost",
  "127.0.0.1",
  "192.168.1.161",
  ...(process.env.NEXT_ALLOWED_DEV_ORIGINS?.split(",").map(origin => origin.trim()).filter(Boolean) ?? []),
];

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  turbopack: {
    root: path.resolve(__dirname),
  },
  allowedDevOrigins: Array.from(new Set(allowedDevOrigins)),
};

export default nextConfig;
