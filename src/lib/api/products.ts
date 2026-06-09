import type { CatalogPage, Product } from "@/lib/types";
import type { ProductSort } from "@/lib/product-sort";
import {
  appendClientPricingCacheBuster,
  isClientPricingActive,
} from "@/lib/client-pricing-session";

export interface FetchProductsParams {
  q?: string;
  category?: string;
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
  page?: number;
  limit?: number;
  offset?: number;
  includeFilters?: boolean;
  sort?: ProductSort;
  featured?: boolean;
  preset?: "seasonal";
  ids?: string[];
  clientId?: string;
  signal?: AbortSignal;
}

export type ProductsResponse = CatalogPage & { catalogTotal?: number };

export async function fetchProducts(
  params: FetchProductsParams = {}
): Promise<ProductsResponse> {
  const sp = new URLSearchParams();
  if (params.q) sp.set("q", params.q);
  if (params.category && params.category !== "all") {
    sp.set("category", params.category);
  }
  if (params.subcategory && params.subcategory !== "all") {
    sp.set("subcategory", params.subcategory);
  }
  if (params.categoryPath?.length) {
    sp.set("path", params.categoryPath.join("\u001f"));
  }
  if (params.brand) sp.set("brand", params.brand);
  if (params.series) sp.set("series", params.series);
  if (params.design) sp.set("design", params.design);
  if (params.productType) sp.set("productType", params.productType);
  if (params.cableMark) sp.set("cableMark", params.cableMark);
  if (Number.isFinite(params.priceMin)) sp.set("priceMin", String(params.priceMin));
  if (Number.isFinite(params.priceMax)) sp.set("priceMax", String(params.priceMax));
  if (typeof params.inStock === "boolean") sp.set("inStock", String(params.inStock));
  if (params.includePreorder === false) sp.set("includePreorder", "false");
  if (params.specs) {
    for (const [key, value] of Object.entries(params.specs)) {
      if (key && value) sp.append("spec", `${key}\u001f${value}`);
    }
  }
  if (params.page) sp.set("page", String(params.page));
  if (params.limit) sp.set("limit", String(params.limit));
  if (Number.isFinite(params.offset)) sp.set("offset", String(params.offset));
  if (params.includeFilters === false) sp.set("includeFilters", "false");
  if (params.sort && params.sort !== "default") sp.set("sort", params.sort);
  if (params.featured) sp.set("featured", "true");
  if (params.preset) sp.set("preset", params.preset);
  if (params.ids?.length) sp.set("ids", params.ids.join(","));
  if (params.clientId) sp.set("clientId", params.clientId);

  const url = `/api/products?${sp}`;
  const clientPricing = isClientPricingActive();
  const requestUrl = appendClientPricingCacheBuster(url);

  try {
    const res = await fetch(requestUrl, {
      signal: params.signal,
      cache: clientPricing ? "no-store" : "default",
    });
    if (!res.ok) throw new Error("network");
    return res.json();
  } catch (error) {
    if (params.signal?.aborted) throw error;
    const cached = clientPricing
      ? null
      : await readCachedJson<ProductsResponse>(url);
    if (cached) return cached;
    throw new Error("Не удалось загрузить каталог");
  }
}

export async function fetchProduct(
  id: string,
  signal?: AbortSignal
): Promise<Product> {
  const url = `/api/products/${id}`;
  const clientPricing = isClientPricingActive();
  const requestUrl = appendClientPricingCacheBuster(url);

  try {
    const res = await fetch(requestUrl, {
      signal,
      cache: clientPricing ? "no-store" : "default",
    });
    if (!res.ok) throw new Error("network");
    return res.json();
  } catch (error) {
    if (signal?.aborted) throw error;
    const cached = clientPricing ? null : await readCachedJson<Product>(url);
    if (cached) return cached;
    throw new Error("Товар не найден");
  }
}

async function readCachedJson<T>(url: string): Promise<T | null> {
  if (typeof window === "undefined" || !("caches" in window)) return null;

  try {
    const cacheNames = await caches.keys();
    for (const cacheName of cacheNames) {
      const cache = await caches.open(cacheName);
      const response = await cache.match(url);
      if (response?.ok) return (await response.clone().json()) as T;
    }
  } catch {
    return null;
  }

  return null;
}
