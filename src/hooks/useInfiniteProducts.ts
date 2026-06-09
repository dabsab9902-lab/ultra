"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CatalogFilters, Product } from "@/lib/types";
import type { ProductSort } from "@/lib/product-sort";
import { fetchProducts } from "@/lib/api/products";
import { CLIENT_PRICING_EVENT } from "@/lib/client-pricing-session";
import {
  buildCatalogViewKey,
  clearCatalogViewState,
  readCatalogViewState,
  saveCatalogViewState,
} from "@/lib/catalog-view-state";

const PAGE_SIZE = 24;

interface UseInfiniteProductsOptions {
  q: string;
  category: string;
  subcategory?: string;
  categoryPath?: string[];
  brand?: string;
  series?: string;
  design?: string;
  productType?: string;
  cableMark?: string;
  priceMin?: number;
  priceMax?: number;
  inStock?: boolean;
  includePreorder?: boolean;
  specs?: Record<string, string>;
  featured?: boolean;
  preset?: "seasonal";
  ids?: string[];
  clientId?: string;
  sort?: ProductSort;
  enabled?: boolean;
}

export function useInfiniteProducts({
  q,
  category,
  subcategory = "all",
  categoryPath,
  brand,
  series,
  design,
  productType,
  cableMark,
  priceMin,
  priceMax,
  inStock,
  includePreorder = true,
  specs,
  featured = false,
  preset,
  ids,
  clientId,
  sort = "default",
  enabled = true,
}: UseInfiniteProductsOptions) {
  const [items, setItems] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [catalogTotal, setCatalogTotal] = useState(0);
  const [filters, setFilters] = useState<CatalogFilters | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restoredScrollY, setRestoredScrollY] = useState<number | null>(null);

  const idsKey = ids?.join(",") ?? "";
  const categoryPathKey = categoryPath?.join("\u001f") ?? "";
  const specsKey = specs
    ? Object.entries(specs)
        .map(([key, value]) => `${key}:${value}`)
        .sort()
        .join("|")
    : "";
  const queryKey = buildCatalogViewKey({
    q,
    category,
    subcategory,
    scope: [
      categoryPathKey ? `path:${categoryPathKey}` : "",
      brand ? `brand:${brand}` : "",
      series ? `series:${series}` : "",
      design ? `design:${design}` : "",
      productType ? `productType:${productType}` : "",
      cableMark ? `cableMark:${cableMark}` : "",
      Number.isFinite(priceMin) ? `priceMin:${priceMin}` : "",
      Number.isFinite(priceMax) ? `priceMax:${priceMax}` : "",
      typeof inStock === "boolean" ? `inStock:${inStock}` : "",
      includePreorder ? "" : "includePreorder:false",
      specsKey ? `specs:${specsKey}` : "",
      featured ? "featured" : "",
      preset ?? "",
      idsKey ? `ids:${idsKey}` : "",
      clientId ? `client:${clientId}` : "",
      sort !== "default" ? `sort:${sort}` : "",
    ]
      .filter(Boolean)
      .join("|"),
  });
  const queryKeyRef = useRef(queryKey);
  const itemsRef = useRef<Product[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const loadPage = useCallback(
    async (pageNum: number, replace: boolean) => {
      if (!enabled) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setError(null);

      try {
        const data = await fetchProducts({
          q: q || undefined,
          category: category === "all" ? undefined : category,
          subcategory: subcategory === "all" ? undefined : subcategory,
          categoryPath,
          brand,
          series,
          design,
          productType,
          cableMark,
          priceMin,
          priceMax,
          inStock,
          includePreorder,
          specs,
          page: pageNum,
          limit: PAGE_SIZE,
          offset: (pageNum - 1) * PAGE_SIZE,
          includeFilters: replace,
          featured,
          preset,
          ids: idsKey ? idsKey.split(",") : undefined,
          clientId,
          sort,
          signal: controller.signal,
        });

        if (queryKeyRef.current !== queryKey || controller.signal.aborted) {
          return;
        }

        const nextItems = replace
          ? data.items
          : mergeUniqueProducts(itemsRef.current, data.items);
        itemsRef.current = nextItems;

        setItems(nextItems);
        setTotal(data.total);
        setCatalogTotal(data.catalogTotal ?? 0);
        if (data.filters) {
          setFilters(data.filters);
        } else if (replace) {
          setFilters(null);
        }
        setHasMore(data.hasMore);
        setPage(pageNum);
        setRestoredScrollY(null);
        saveCatalogViewState({
          queryKey,
          q,
          category,
          subcategory,
          items: nextItems,
          total: data.total,
          catalogTotal: data.catalogTotal ?? 0,
          page: pageNum,
          hasMore: data.hasMore,
          scrollY: replace ? 0 : window.scrollY,
        });
      } catch {
        if (controller.signal.aborted) return;
        if (queryKeyRef.current === queryKey) {
          setError("Ошибка загрузки. Попробуйте снова.");
        }
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        if (queryKeyRef.current === queryKey && !controller.signal.aborted) {
          setLoading(false);
          setInitialLoading(false);
        }
      }
    },
    [
      q,
      category,
      subcategory,
      categoryPath,
      brand,
      series,
      design,
      productType,
      cableMark,
      priceMin,
      priceMax,
      inStock,
      includePreorder,
      specs,
      featured,
      preset,
      idsKey,
      clientId,
      sort,
      enabled,
      queryKey,
    ]
  );

  useEffect(() => {
    queryKeyRef.current = queryKey;
    if (!enabled) {
      abortRef.current?.abort();
      itemsRef.current = [];
      setItems([]);
      setTotal(0);
      setCatalogTotal(0);
      setFilters(null);
      setPage(1);
      setHasMore(false);
      setLoading(false);
      setInitialLoading(false);
      setError(null);
      setRestoredScrollY(null);
      return;
    }

    const restored = readCatalogViewState(queryKey);

    if (restored) {
      abortRef.current?.abort();
      itemsRef.current = restored.items;
      setItems(restored.items);
      setTotal(restored.total);
      setCatalogTotal(restored.catalogTotal);
      setFilters(null);
      setPage(restored.page);
      setHasMore(restored.hasMore);
      setLoading(false);
      setInitialLoading(false);
      setError(null);
      setRestoredScrollY(restored.scrollY);
    } else {
      itemsRef.current = [];
      setItems([]);
      setPage(1);
      setHasMore(true);
      setFilters(null);
      setInitialLoading(true);
      setRestoredScrollY(null);
      loadPage(1, true);
    }

    return () => abortRef.current?.abort();
  }, [queryKey, loadPage, enabled]);

  useEffect(() => {
    const refreshPrices = () => {
      queryKeyRef.current = queryKey;
      clearCatalogViewState(queryKey);
      itemsRef.current = [];
      setItems([]);
      setPage(1);
      setHasMore(true);
      setFilters(null);
      setInitialLoading(true);
      loadPage(1, true);
    };

    window.addEventListener(CLIENT_PRICING_EVENT, refreshPrices);
    return () => {
      window.removeEventListener(CLIENT_PRICING_EVENT, refreshPrices);
    };
  }, [queryKey, loadPage]);

  const loadMore = useCallback(() => {
    if (loading || !hasMore || initialLoading) return;
    loadPage(page + 1, false);
  }, [loading, hasMore, initialLoading, page, loadPage]);

  const retry = useCallback(() => {
    setInitialLoading(true);
    loadPage(1, true);
  }, [loadPage]);

  return {
    items,
    total,
    catalogTotal,
    filters,
    loading,
    initialLoading,
    hasMore,
    error,
    loadMore,
    retry,
    restoredScrollY,
    queryKey,
  };
}

function mergeUniqueProducts(current: Product[], nextPage: Product[]) {
  if (current.length === 0) return nextPage;
  const seen = new Set(current.map((product) => product.id));
  const next = [...current];

  for (const product of nextPage) {
    if (seen.has(product.id)) continue;
    seen.add(product.id);
    next.push(product);
  }

  return next;
}
