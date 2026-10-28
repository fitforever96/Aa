/** @type {import('next').NextConfig} */
// PAGES=1 builds a static, server-less site for GitHub Pages under /Aa (AI routes excluded).
const pages = process.env.PAGES === "1";
const basePath = pages ? process.env.PAGES_BASE_PATH || "/Aa" : "";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  turbopack: {},
  basePath,
  env: { NEXT_PUBLIC_BASE_PATH: basePath, NEXT_PUBLIC_STATIC: pages ? "1" : "0" },
  ...(pages
    ? { output: "export", images: { unoptimized: true } }
    : {
        async headers() {
          return [
            { source: "/(.*)", headers: securityHeaders },
            { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }, { key: "Service-Worker-Allowed", value: "/" }] },
          ];
        },
      }),
};

export default nextConfig;
