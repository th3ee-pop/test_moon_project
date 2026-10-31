import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // EdgeOne Makers 本地开发预览通过 127.0.0.1 访问，需显式信任该来源
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
