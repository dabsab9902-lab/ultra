"use client";

import { useEffect, useMemo, useState } from "react";
import type { Product } from "@/lib/types";
import { ProductRecommendationStrip } from "./ProductRecommendationStrip";

interface ContextualRecommendationsProps {
  productIds: string[];
  title: string;
  subtitle?: string;
  limit?: number;
  compact?: boolean;
}

export function ContextualRecommendations({
  productIds,
  title,
  subtitle,
  limit = 8,
  compact = false,
}: ContextualRecommendationsProps) {
  const idsKey = useMemo(
    () => Array.from(new Set(productIds.filter(Boolean))).join(","),
    [productIds]
  );
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    if (!idsKey) {
      setProducts([]);
      return;
    }

    const controller = new AbortController();
    const params = new URLSearchParams({
      ids: idsKey,
      limit: String(limit),
    });

    fetch(`/api/products/recommendations?${params}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("network");
        return (await response.json()) as { items?: Product[] };
      })
      .then((data) => {
        setProducts(Array.isArray(data.items) ? data.items : []);
      })
      .catch(() => {
        if (!controller.signal.aborted) setProducts([]);
      });

    return () => controller.abort();
  }, [idsKey, limit]);

  return (
    <ProductRecommendationStrip
      title={title}
      subtitle={subtitle}
      products={products}
      compact={compact}
    />
  );
}
