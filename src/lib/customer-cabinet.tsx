"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  getLastOrderedDatesByProduct,
  isOrderHistoryStorageKey,
} from "@/lib/order-history";
import { CLIENT_PRICING_EVENT } from "@/lib/client-pricing-session";

const FAVORITES_KEY = "ultra-svet-favorites";
const RECENT_KEY = "ultra-svet-recent-products";
const NOTES_KEY = "ultra-svet-customer-notes";
const PRODUCT_NOTES_KEY = "ultra-svet-product-notes";
const ORDER_HISTORY_EVENT = "ultra-svet-order-history-updated";
const MAX_RECENT = 12;

export interface RecentProductEntry {
  productId: string;
  viewedAt: string;
}

type ProductNotes = Record<string, string>;

interface CustomerCabinetValue {
  hydrated: boolean;
  favoriteIds: string[];
  favoriteSet: Set<string>;
  favoriteCount: number;
  recent: RecentProductEntry[];
  notes: string;
  productNotes: ProductNotes;
  orderedProductDates: Record<string, string>;
  getLastOrderedDate: (productId: string) => string | undefined;
  isFavorite: (productId: string) => boolean;
  addFavorite: (productId: string) => void;
  removeFavorite: (productId: string) => void;
  toggleFavorite: (productId: string) => void;
  addRecent: (productId: string) => void;
  setNotes: (value: string) => void;
  setProductNote: (productId: string, value: string) => void;
}

const CustomerCabinetContext = createContext<CustomerCabinetValue | null>(null);

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota */
  }
}

function normalizeIds(ids: string[]) {
  return Array.from(new Set(ids.filter(Boolean)));
}

export function CustomerCabinetProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [recent, setRecent] = useState<RecentProductEntry[]>([]);
  const [notes, setNotesState] = useState("");
  const [productNotes, setProductNotes] = useState<ProductNotes>({});
  const [orderedProductDates, setOrderedProductDates] = useState<Record<string, string>>({});
  const [hydrated, setHydrated] = useState(false);

  const refresh = useCallback(() => {
    setFavoriteIds(normalizeIds(readJson<string[]>(FAVORITES_KEY, [])));
    setRecent(readJson<RecentProductEntry[]>(RECENT_KEY, []));
    setNotesState(readJson<string>(NOTES_KEY, ""));
    setProductNotes(readJson<ProductNotes>(PRODUCT_NOTES_KEY, {}));
    setOrderedProductDates(getLastOrderedDatesByProduct());
    setHydrated(true);
  }, []);

  useEffect(() => {
    refresh();
    const onStorage = (event: StorageEvent) => {
      if (
        event.key &&
        ![
          FAVORITES_KEY,
          RECENT_KEY,
          NOTES_KEY,
          PRODUCT_NOTES_KEY,
        ].includes(
          event.key
        ) &&
        !isOrderHistoryStorageKey(event.key)
      ) {
        return;
      }
      refresh();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(ORDER_HISTORY_EVENT, refresh);
    window.addEventListener(CLIENT_PRICING_EVENT, refresh);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(ORDER_HISTORY_EVENT, refresh);
      window.removeEventListener(CLIENT_PRICING_EVENT, refresh);
    };
  }, [refresh]);

  const addFavorite = useCallback((productId: string) => {
    setFavoriteIds((prev) => {
      if (prev.includes(productId)) return prev;
      const next = [productId, ...prev];
      writeJson(FAVORITES_KEY, next);
      return next;
    });
  }, []);

  const removeFavorite = useCallback((productId: string) => {
    setFavoriteIds((prev) => {
      if (!prev.includes(productId)) return prev;
      const next = prev.filter((id) => id !== productId);
      writeJson(FAVORITES_KEY, next);
      return next;
    });
  }, []);

  const toggleFavorite = useCallback((productId: string) => {
    setFavoriteIds((prev) => {
      const next = prev.includes(productId)
        ? prev.filter((id) => id !== productId)
        : [productId, ...prev];
      writeJson(FAVORITES_KEY, next);
      return next;
    });
  }, []);

  const addRecent = useCallback((productId: string) => {
    setRecent((prev) => {
      const next = [
        { productId, viewedAt: new Date().toISOString() },
        ...prev.filter((entry) => entry.productId !== productId),
      ].slice(0, MAX_RECENT);
      writeJson(RECENT_KEY, next);
      return next;
    });
  }, []);

  const setNotes = useCallback((value: string) => {
    setNotesState(value);
    writeJson(NOTES_KEY, value);
  }, []);

  const setProductNote = useCallback((productId: string, value: string) => {
    setProductNotes((prev) => {
      const next = { ...prev };
      if (value.trim()) next[productId] = value;
      else delete next[productId];
      writeJson(PRODUCT_NOTES_KEY, next);
      return next;
    });
  }, []);

  const favoriteSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);

  const value = useMemo(
    () => ({
      hydrated,
      favoriteIds,
      favoriteSet,
      favoriteCount: favoriteIds.length,
      recent,
      notes,
      productNotes,
      orderedProductDates,
      getLastOrderedDate: (productId: string) => orderedProductDates[productId],
      isFavorite: (productId: string) => favoriteSet.has(productId),
      addFavorite,
      removeFavorite,
      toggleFavorite,
      addRecent,
      setNotes,
      setProductNote,
    }),
    [
      hydrated,
      favoriteIds,
      favoriteSet,
      recent,
      notes,
      productNotes,
      orderedProductDates,
      addFavorite,
      removeFavorite,
      toggleFavorite,
      addRecent,
      setNotes,
      setProductNote,
    ]
  );

  return (
    <CustomerCabinetContext.Provider value={value}>
      {children}
    </CustomerCabinetContext.Provider>
  );
}

export function useCustomerCabinet() {
  const ctx = useContext(CustomerCabinetContext);
  if (!ctx) {
    throw new Error(
      "useCustomerCabinet must be used within CustomerCabinetProvider"
    );
  }
  return ctx;
}
