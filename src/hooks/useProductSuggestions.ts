"use client";

import { useEffect, useRef, useState } from "react";
import type { ClientSuggestion } from "@/lib/search/client-index";
import { normalizeSearchQuery } from "@/lib/search/query";
import {
  appendClientPricingCacheBuster,
  CLIENT_PRICING_EVENT,
  isClientPricingActive,
} from "@/lib/client-pricing-session";

export function useProductSuggestions(query: string, limit = 8) {
  const [items, setItems] = useState<ClientSuggestion[]>([]);
  const [ready, setReady] = useState(true);
  const [reloadTick, setReloadTick] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const refresh = () => setReloadTick((value) => value + 1);
    window.addEventListener(CLIENT_PRICING_EVENT, refresh);
    return () => window.removeEventListener(CLIENT_PRICING_EVENT, refresh);
  }, []);

  useEffect(() => {
    const normalized = normalizeSearchQuery(query);
    abortRef.current?.abort();

    if (normalized.length < 3) {
      setItems([]);
      setReady(true);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setReady(false);

    const timeout = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          q: normalized,
          limit: String(limit),
        });
        const clientPricing = isClientPricingActive();
        const url = appendClientPricingCacheBuster(
          `/api/products/suggest?${params}`
        );
        const res = await fetch(url, {
          signal: controller.signal,
          cache: clientPricing ? "no-store" : "default",
        });
        if (!res.ok) throw new Error("suggestions");
        const data = (await res.json()) as { items?: ClientSuggestion[] };
        if (!controller.signal.aborted) setItems(data.items ?? []);
      } catch {
        if (!controller.signal.aborted) setItems([]);
      } finally {
        if (!controller.signal.aborted) setReady(true);
      }
    }, 120);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [query, limit, reloadTick]);

  return { items, ready };
}
