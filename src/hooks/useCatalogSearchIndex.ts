"use client";

import { useEffect, useRef, useState } from "react";
import type { CompactSearchEntry } from "@/lib/catalog/search-index";
import {
  appendClientPricingCacheBuster,
  CLIENT_PRICING_EVENT,
  isClientPricingActive,
} from "@/lib/client-pricing-session";

const STORAGE_KEY = "ultra-svet-search-index-v";
const LAST_STORAGE_KEY = "ultra-svet-search-index-last";

export function useCatalogSearchIndex() {
  const [entries, setEntries] = useState<CompactSearchEntry[]>([]);
  const [ready, setReady] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);
  const loadingRef = useRef(false);

  useEffect(() => {
    const refreshIndex = () => {
      loadingRef.current = false;
      setReady(false);
      setEntries([]);
      setReloadTick((value) => value + 1);
    };

    window.addEventListener(CLIENT_PRICING_EVENT, refreshIndex);
    return () => {
      window.removeEventListener(CLIENT_PRICING_EVENT, refreshIndex);
    };
  }, []);

  useEffect(() => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    let cancelled = false;

    (async () => {
      const clientPricing = isClientPricingActive();
      try {
        const res = await fetch(
          appendClientPricingCacheBuster("/api/products/search-index"),
          { cache: clientPricing ? "no-store" : "default" }
        );
        if (!res.ok) throw new Error("index");
        const data = (await res.json()) as {
          version: string;
          entries: CompactSearchEntry[];
        };

        const cacheKey = `${STORAGE_KEY}${data.version}`;
        if (!clientPricing) {
          try {
            const cached = sessionStorage.getItem(cacheKey);
            if (cached) {
              if (cancelled) return;
              setEntries(JSON.parse(cached) as CompactSearchEntry[]);
              setReady(true);
              return;
            }
          } catch {
            /* sessionStorage недоступен */
          }
        }

        if (cancelled) return;
        setEntries(data.entries);
        setReady(true);

        if (!clientPricing) {
          try {
            sessionStorage.setItem(cacheKey, JSON.stringify(data.entries));
            localStorage.setItem(LAST_STORAGE_KEY, JSON.stringify(data.entries));
          } catch {
            /* quota */
          }
        }
      } catch {
        if (!clientPricing) {
          try {
            const cached = localStorage.getItem(LAST_STORAGE_KEY);
            if (cached && !cancelled) {
              setEntries(JSON.parse(cached) as CompactSearchEntry[]);
            }
          } catch {
            /* localStorage недоступен */
          }
        }
        if (cancelled) return;
        setReady(true);
      } finally {
        loadingRef.current = false;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [reloadTick]);

  return { entries, ready };
}
