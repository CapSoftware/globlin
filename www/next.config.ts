import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: {
    root: ".",
  },
};

export default nextConfig;
