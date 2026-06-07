"use client";

import type { Product } from "@/lib/types";
import { normalizeSearchQuery } from "@/lib/search/query";

const STORAGE_KEY = "ultra-svet-catalog-view-state:v1";
const MAX_CACHED_ITEMS = 1000;
const CACHE_TTL_MS = 30 * 60 * 1000;

export interface CatalogViewState {
  queryKey: string;
  q: string;
  category: string;
  subcategory: string;
  items: Product[];
  total: number;
  catalogTotal: number;
  page: number;
  hasMore: boolean;
  scrollY: number;
  savedAt: number;
}

export function buildCatalogViewKey({
  q,
  category,
  subcategory,
  scope,
}: {
  q: string;
  category: string;
  subcategory?: string;
  scope?: string;
}) {
  return [
    normalizeSearchQuery(q),
    category || "all",
    subcategory || "all",
    scope || "default",
  ].join("\u0000");
}

export function readCatalogViewState(queryKey: string): CatalogViewState | null {
  const state = readRawState();
  if (!state || state.queryKey !== queryKey) return null;
  if (Date.now() - state.savedAt > CACHE_TTL_MS) return null;
  if (!Array.isArray(state.items) || state.items.length === 0) return null;
  return state;
}

export function saveCatalogViewState(
  nextState: Omit<CatalogViewState, "savedAt">
) {
  if (typeof window === "undefined") return;

  const items = nextState.items.slice(0, MAX_CACHED_ITEMS);
  const page = Math.max(
    1,
    Math.min(nextState.page, Math.ceil(items.length / 24) || 1)
  );
  const state: CatalogViewState = {
    ...nextState,
    items,
    page,
    scrollY: Math.max(0, Math.floor(nextState.scrollY)),
    savedAt: Date.now(),
  };

  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    try {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ ...state, items: items.slice(0, 200), page: 1 })
      );
    } catch {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  }
}

export function saveCatalogScrollState(queryKey: string, scrollY: number) {
  if (typeof window === "undefined") return;
  const state = readRawState();
  if (!state || state.queryKey !== queryKey) return;

  try {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...state,
        scrollY: Math.max(0, Math.floor(scrollY)),
        savedAt: Date.now(),
      })
    );
  } catch {
    /* keep current cache */
  }
}

export function clearCatalogViewState(queryKey?: string) {
  if (typeof window === "undefined") return;
  if (!queryKey) {
    sessionStorage.removeItem(STORAGE_KEY);
    return;
  }

  const state = readRawState();
  if (state?.queryKey === queryKey) {
    sessionStorage.removeItem(STORAGE_KEY);
  }
}

function readRawState(): CatalogViewState | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const state = JSON.parse(raw) as Partial<CatalogViewState>;
    if (!state.queryKey || !Array.isArray(state.items)) return null;
    return {
      queryKey: state.queryKey,
      q: String(state.q ?? ""),
      category: String(state.category ?? "all"),
      subcategory: String(state.subcategory ?? "all"),
      items: state.items as Product[],
      total: Number(state.total) || 0,
      catalogTotal: Number(state.catalogTotal) || 0,
      page: Math.max(1, Number(state.page) || 1),
      hasMore: Boolean(state.hasMore),
      scrollY: Math.max(0, Number(state.scrollY) || 0),
      savedAt: Number(state.savedAt) || 0,
    };
  } catch {
    return null;
  }
}
