// =============================================================================
// next.config.ts — Next.js 15 + Serwist PWA configuration
// =============================================================================

import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  swSrc: "src/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
});

const nextConfig = {
  reactStrictMode: true,
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
