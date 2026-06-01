"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { CartItem, Product } from "@/lib/types";
import { fetchProducts } from "@/lib/api/products";
import { CLIENT_PRICING_EVENT } from "@/lib/client-pricing-session";
import {
  loadLastOrder,
  saveLastOrder,
  type OrderSnapshot,
  type SaveOrderOptions,
} from "@/lib/order-history";

const STORAGE_KEY = "ultra-svet-cart";
const CART_SCHEMA = 1;

interface StoredCartItem {
  productId: string;
  quantity: number;
  minOrder: number;
}

interface CartContextValue {
  items: CartItem[];
  hydrated: boolean;
  addItem: (productId: string, minOrder: number, quantity?: number) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  adjustQuantity: (productId: string, delta: number) => void;
  clearCart: () => void;
  getItemQuantity: (productId: string) => number;
  repeatLastOrder: () => boolean;
  replaceWithOrder: (items: CartItem[]) => void;
  hasLastOrder: boolean;
  lastOrderDate: string | null;
  lastOrderItemCount: number;
  submitOrder: (options?: SaveOrderOptions) => OrderSnapshot | null;
  totalItems: number;
  totalPrice: number;
  cartProducts: { product: Product; quantity: number }[];
  cartLoading: boolean;
}

const CartContext = createContext<CartContextValue | null>(null);

interface StoredCartPayload {
  v: number;
  items: StoredCartItem[];
  savedAt: string;
}

function loadCart(): StoredCartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredCartPayload | StoredCartItem[];
    const items = Array.isArray(parsed)
      ? parsed
      : parsed.items ?? [];
    return items.map((i) => ({
      productId: i.productId,
      quantity: Math.max(1, Math.floor(i.quantity)),
      minOrder: 1,
    }));
  } catch {
    return [];
  }
}

function saveCart(items: StoredCartItem[]) {
  if (typeof window === "undefined") return;
  const payload: StoredCartPayload = {
    v: CART_SCHEMA,
    items,
    savedAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota */
  }
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [productMap, setProductMap] = useState<Map<string, Product>>(new Map());
  const [cartLoading, setCartLoading] = useState(false);
  const [lastOrderDate, setLastOrderDate] = useState<string | null>(null);
  const [lastOrderItemCount, setLastOrderItemCount] = useState(0);
  const fetchedIds = useRef(new Set<string>());

  const refreshLastOrderMeta = useCallback(() => {
    const last = loadLastOrder();
    setLastOrderDate(last?.savedAt ?? null);
    setLastOrderItemCount(last?.items.length ?? 0);
  }, []);

  useEffect(() => {
    setItems(loadCart());
    refreshLastOrderMeta();
    setHydrated(true);
  }, [refreshLastOrderMeta]);

  useEffect(() => {
    if (!hydrated) return;
    saveCart(items);
  }, [items, hydrated]);

  useEffect(() => {
    if (!hydrated) return;

    const persist = () => saveCart(items);
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY || !e.newValue) return;
      try {
        const parsed = JSON.parse(e.newValue) as StoredCartPayload;
        if (parsed.items) setItems(parsed.items);
      } catch {
        /* ignore */
      }
    };

    window.addEventListener("beforeunload", persist);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("beforeunload", persist);
      window.removeEventListener("storage", onStorage);
    };
  }, [items, hydrated]);

  const fetchProductsForCart = useCallback(async (ids: string[]) => {
    const missing = ids.filter((id) => !fetchedIds.current.has(id));
    if (missing.length === 0) return;

    setCartLoading(true);
    try {
      const data = await fetchProducts({ ids: missing, limit: missing.length });
      setProductMap((prev) => {
        const next = new Map(prev);
        for (const p of data.items) {
          next.set(p.id, p);
          fetchedIds.current.add(p.id);
        }
        return next;
      });
    } finally {
      setCartLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!hydrated || items.length === 0) return;
    fetchProductsForCart(items.map((i) => i.productId));
  }, [items, hydrated, fetchProductsForCart]);

  useEffect(() => {
    if (!hydrated) return;

    const refreshPricing = () => {
      fetchedIds.current.clear();
      setProductMap(new Map());
      if (items.length > 0) {
        fetchProductsForCart(items.map((i) => i.productId));
      }
    };

    window.addEventListener(CLIENT_PRICING_EVENT, refreshPricing);
    return () => {
      window.removeEventListener(CLIENT_PRICING_EVENT, refreshPricing);
    };
  }, [items, hydrated, fetchProductsForCart]);

  const getItemQuantity = useCallback(
    (productId: string) => {
      const item = items.find((i) => i.productId === productId);
      return item?.quantity ?? 0;
    },
    [items]
  );

  const addItem = useCallback(
    (productId: string, _minOrder: number, quantity?: number) => {
      const qty = Math.max(1, Math.floor(quantity ?? 1));

      setItems((prev) => {
        const existing = prev.find((i) => i.productId === productId);
        if (existing) {
          return prev.map((i) =>
            i.productId === productId
              ? { ...i, quantity: i.quantity + qty }
              : i
          );
        }
        return [...prev, { productId, quantity: qty, minOrder: 1 }];
      });
    },
    []
  );

  const removeItem = useCallback((productId: string) => {
    setItems((prev) => prev.filter((i) => i.productId !== productId));
  }, []);

  const updateQuantity = useCallback((productId: string, quantity: number) => {
    const qty = Math.floor(quantity);
    setItems((prev) => {
      const item = prev.find((i) => i.productId === productId);
      if (!item) return prev;

      if (qty < 1) {
        return prev.filter((i) => i.productId !== productId);
      }

      return prev.map((i) =>
        i.productId === productId ? { ...i, quantity: qty } : i
      );
    });
  }, []);

  const adjustQuantity = useCallback((productId: string, delta: number) => {
    if (!delta) return;
    setItems((prev) => {
      const item = prev.find((i) => i.productId === productId);
      if (!item) return prev;

      const next = item.quantity + delta;
      if (next < 1) {
        return prev.filter((i) => i.productId !== productId);
      }

      return prev.map((i) =>
        i.productId === productId ? { ...i, quantity: next } : i
      );
    });
  }, []);

  const clearCart = useCallback(() => setItems([]), []);

  const replaceWithItems = useCallback((orderItems: CartItem[]) => {
    setItems(
      orderItems.map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
        minOrder: 1,
      }))
    );
  }, []);

  const repeatLastOrder = useCallback(() => {
    const last = loadLastOrder();
    if (!last?.items.length) return false;
    replaceWithItems(last.items);
    fetchedIds.current.clear();
    return true;
  }, [replaceWithItems]);

  const replaceWithOrder = useCallback((orderItems: CartItem[]) => {
    replaceWithItems(orderItems);
    fetchedIds.current.clear();
  }, [replaceWithItems]);

  const submitOrder = useCallback((options?: SaveOrderOptions) => {
    if (items.length === 0) return null;
    const snapshot = saveLastOrder(items, options);
    refreshLastOrderMeta();
    clearCart();
    return snapshot;
  }, [items, clearCart, refreshLastOrderMeta]);

  const hasLastOrder = Boolean(lastOrderDate);

  const cartProducts = useMemo(
    () =>
      items
        .map((item) => {
          const product = productMap.get(item.productId);
          if (!product) return null;
          return { product, quantity: item.quantity };
        })
        .filter(Boolean) as { product: Product; quantity: number }[],
    [items, productMap]
  );

  const totalItems = useMemo(
    () => items.reduce((sum, i) => sum + i.quantity, 0),
    [items]
  );

  const totalPrice = useMemo(
    () =>
      cartProducts.reduce(
        (sum, { product, quantity }) => sum + product.price * quantity,
        0
      ),
    [cartProducts]
  );

  const value = useMemo(
    () => ({
      items,
      hydrated,
      addItem,
      removeItem,
      updateQuantity,
      adjustQuantity,
      clearCart,
      getItemQuantity,
      repeatLastOrder,
      replaceWithOrder,
      hasLastOrder,
      lastOrderDate,
      lastOrderItemCount,
      submitOrder,
      totalItems,
      totalPrice,
      cartProducts,
      cartLoading,
    }),
    [
      items,
      hydrated,
      addItem,
      removeItem,
      updateQuantity,
      adjustQuantity,
      clearCart,
      getItemQuantity,
      repeatLastOrder,
      replaceWithOrder,
      hasLastOrder,
      lastOrderDate,
      lastOrderItemCount,
      submitOrder,
      totalItems,
      totalPrice,
      cartProducts,
      cartLoading,
    ]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
