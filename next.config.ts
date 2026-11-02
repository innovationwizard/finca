// =============================================================================
// next.config.ts — Next.js 15 + Serwist PWA configuration
// =============================================================================

import path from "path";
import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  swSrc: "src/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
  additionalPrecacheEntries: [
    { url: "/models/blazeface.json", revision: "harvest-p1" },
    { url: "/models/blazeface.bin", revision: "harvest-p1" },
    { url: "/models/facemesh.json", revision: "harvest-p1" },
    { url: "/models/facemesh.bin", revision: "harvest-p1" },
    { url: "/models/faceres.json", revision: "harvest-p1" },
    { url: "/models/faceres.bin", revision: "harvest-p1" },
  ],
});

const nextConfig = {
  reactStrictMode: true,
  webpack: (config: { resolve: { alias?: Record<string, string> } }, { isServer }: { isServer: boolean }) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@vladmandic/human": path.join(
        process.cwd(),
        isServer
          ? "src/lib/face/human-server-stub.ts"
          : "node_modules/@vladmandic/human/dist/human.esm.js",
      ),
    };
    return config;
  },
  experimental: {
    typedRoutes: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https" as const,
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      // Signed (private) objects — bug-report screenshots on /admin/reportes.
      // Rendered with `unoptimized` so the image never lands in the CDN cache:
      // these captures contain payroll data and their URLs expire in an hour.
      {
        protocol: "https" as const,
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/sign/**",
      },
    ],
  },
};

export default withSerwist(nextConfig);
