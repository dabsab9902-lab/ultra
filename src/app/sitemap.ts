import type { MetadataRoute } from "next";
import { catalog } from "@/lib/catalog";

const BASE_URL = "https://ultra-svet.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const products = catalog
    .query({ limit: 100 })
    .items.map((product) => ({
      url: `${BASE_URL}/product/${product.id}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }));

  return [
    {
      url: BASE_URL,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${BASE_URL}/catalog`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/cart`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.3,
    },
    ...products,
  ];
}
