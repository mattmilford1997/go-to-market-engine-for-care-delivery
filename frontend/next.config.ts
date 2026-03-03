import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    // Tree-shake large icon/chart packages so only used exports are bundled
    optimizePackageImports: ["lucide-react", "recharts", "@radix-ui/react-dialog", "@radix-ui/react-dropdown-menu"],
  },
  async rewrites() {
    // Proxy /api/v1/* to the backend so the browser never hits a cross-origin URL.
    // Resolution order: BACKEND_URL → base of NEXT_PUBLIC_API_URL → localhost.
    let backendUrl = process.env.BACKEND_URL?.replace(/\/$/, "") ?? "";
    if (!backendUrl) {
      const pub = process.env.NEXT_PUBLIC_API_URL ?? "";
      backendUrl = pub.startsWith("http")
        ? pub.replace(/\/api\/v1\/?$/, "").replace(/\/$/, "")
        : "http://localhost:8000";
    }
    return [
      {
        source: "/api/v1/:path*",
        destination: `${backendUrl}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
