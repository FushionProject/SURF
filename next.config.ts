import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";

const localNetworkOrigins = Object.values(networkInterfaces())
  .flatMap((interfaces) => interfaces ?? [])
  .filter((network) => network.family === "IPv4" && !network.internal)
  .map((network) => network.address);

const nextConfig: NextConfig = {
  turbopack: { root: process.cwd() },
  outputFileTracingRoot: process.cwd(),
  outputFileTracingExcludes: { "/*": ["./.surf-data/spot-stats/**/*"] },
  // Keep LAN-origin access explicit so the development app can be tested on a
  // phone without broadly relaxing Next.js cross-origin protections.
  allowedDevOrigins: localNetworkOrigins,
};

export default nextConfig;
