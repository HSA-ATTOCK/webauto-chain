import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // Point Turbopack at the actual project root so Next.js does not walk up to
    // C:\Users\HAIDER\ and drop our src/app directory + path aliases.
    root: path.resolve(__dirname),
  },
  // If you run the dev server on the local network and see cross-origin
  // warnings, you can add your dev origin to `allowedDevOrigins` per Next docs.
  // allowedDevOrigins: ['http://192.168.1.107:3000'],
};

export default nextConfig;
