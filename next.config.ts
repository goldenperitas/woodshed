import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 is a native module; keep it external to the server bundle.
  serverExternalPackages: ["better-sqlite3"],
  // Allow the dev server to be reached over the Tailscale hostname (iPhone testing).
  allowedDevOrigins: ["rios-macbook-pro.tail9301f7.ts.net"],
};

export default nextConfig;
