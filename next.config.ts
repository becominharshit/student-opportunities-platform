import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Auth callback URLs contain one-time codes. Never print incoming URLs in dev.
  logging: { incomingRequests: false },
};

export default nextConfig;
