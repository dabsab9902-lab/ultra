"use client";

import { useEffect, useState } from "react";
import { searchDelayMs } from "@/lib/search/query";

export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

/** Для каталога: артикул — без задержки, название — короткая. */
export function useCatalogSearchQuery(query: string): string {
  const delay = searchDelayMs(query);
  return useDebouncedValue(query, delay);
}
