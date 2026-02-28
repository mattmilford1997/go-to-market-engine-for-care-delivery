import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    // Tree-shake large icon/chart packages so only used exports are bundled
    optimizePackageImports: ["lucide-react", "recharts", "@radix-ui/react-dialog", "@radix-ui/react-dropdown-menu"],
  },
  async rewrites() {
    // Proxy /api/v1/* to the backend so the browser never hits a cross-origin URL.
    // Set BACKEND_URL in Vercel (server-side env) to the Railway backend origin.
    const backendUrl = process.env.BACKEND_URL || "http://localhost:8000";
    return [
      {
        source: "/api/v1/:path*",
        destination: `${backendUrl}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
