import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  cacheOnFrontEndNav: false,
  aggressiveFrontEndNavCaching: false,
  cacheStartUrl: false,
  dynamicStartUrl: false,
  extendDefaultRuntimeCaching: true,
  reloadOnOnline: true,
  fallbacks: {
    document: "/~offline",
    image: "/product-fallback.svg",
  },
  disable: process.env.NODE_ENV === "development",
  workboxOptions: {
    disableDevLogs: true,
    runtimeCaching: [
      {
        urlPattern: ({ url, sameOrigin }) =>
          sameOrigin && url.pathname === "/api/products/categories",
        handler: "StaleWhileRevalidate",
        options: {
          cacheName: "ultra-svet-categories-api",
          expiration: {
            maxEntries: 8,
            maxAgeSeconds: 24 * 60 * 60,
          },
          cacheableResponse: {
            statuses: [0, 200],
          },
        },
      },
      {
        urlPattern: ({ url, sameOrigin }) =>
          sameOrigin &&
          url.pathname.startsWith("/api/products") &&
          !url.searchParams.has("_clientPricing") &&
          !url.searchParams.has("clientId"),
        handler: "NetworkFirst",
        options: {
          cacheName: "ultra-svet-products-api",
          networkTimeoutSeconds: 3,
          expiration: {
            maxEntries: 128,
            maxAgeSeconds: 7 * 24 * 60 * 60,
          },
          cacheableResponse: {
            statuses: [0, 200],
          },
        },
      },
      {
        urlPattern: ({ request, url }) =>
          request.destination === "image" &&
          (url.origin === self.location.origin ||
            url.hostname === "ultra-svet.com" ||
            url.hostname.endsWith(".ultra-svet.com")),
        handler: "CacheFirst",
        options: {
          cacheName: "ultra-svet-product-images",
          expiration: {
            maxEntries: 300,
            maxAgeSeconds: 30 * 24 * 60 * 60,
          },
          cacheableResponse: {
            statuses: [0, 200],
          },
        },
      },
    ],
  },
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingIncludes: {
    "/*": ["./products.json", "./data/*.json"],
    "/api/**/*": ["./products.json", "./data/*.json"],
    "/admin/**/*": ["./products.json", "./data/*.json"],
  },
  images: {
    qualities: [48, 72],
    deviceSizes: [360, 414, 640, 768],
    imageSizes: [56, 96, 120, 192, 256],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "ultra-svet.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "www.ultra-svet.com",
        pathname: "/**",
      },
    ],
  },
};

export default withPWA(nextConfig);
