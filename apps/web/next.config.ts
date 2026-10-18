import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@inv/core", "@inv/db"],
  serverExternalPackages: ["@libsql/client", "libsql"],
  images: {
    remotePatterns: [{ protocol: "https", hostname: "community.fastly.steamstatic.com" }],
  },
};

export default config;
