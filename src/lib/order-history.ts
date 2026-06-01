import type { CartItem } from "@/lib/types";

const LAST_ORDER_KEY = "ultra-svet-last-order";
export const ORDER_HISTORY_KEY = "orderHistory";
const LEGACY_ORDER_HISTORY_KEY = "ultra-svet-order-history";
export const ORDER_HISTORY_KEYS = [ORDER_HISTORY_KEY, LEGACY_ORDER_HISTORY_KEY];
const ORDER_HISTORY_EVENT = "ultra-svet-order-history-updated";
const MAX_HISTORY = 12;

export interface OrderHistoryItem extends CartItem {
  id?: string;
  sku?: string;
  article?: string;
}

export interface OrderSnapshot {
  id?: string;
  orderId?: string;
  items: OrderHistoryItem[];
  savedAt: string;
  date?: string;
  customer?: OrderCustomer;
  total?: number;
}

export interface OrderCustomer {
  name: string;
  phone: string;
  comment?: string;
}

export interface SaveOrderOptions {
  customer?: OrderCustomer;
  total?: number;
  items?: Array<Partial<OrderHistoryItem> & { productId: string }>;
}

export function saveLastOrder(
  items: CartItem[],
  options: SaveOrderOptions = {}
): OrderSnapshot | null {
  if (typeof window === "undefined" || items.length === 0) return null;

  const now = new Date().toISOString();
  const orderId = createOrderId();
  const itemDetails = new Map(
    (options.items ?? []).map((item) => [String(item.productId), item])
  );
  const snapshot: OrderSnapshot = {
    id: orderId,
    orderId,
    date: now,
    savedAt: now,
    items: items.map((item) => ({
      productId: String(item.productId),
      quantity: item.quantity,
      minOrder: item.minOrder,
      sku: firstString(itemDetails.get(String(item.productId))?.sku),
      article: firstString(itemDetails.get(String(item.productId))?.article),
    })),
  };

  if (options.customer) {
    snapshot.customer = {
      name: options.customer.name.trim(),
      phone: options.customer.phone.trim(),
      comment: options.customer.comment?.trim() || undefined,
    };
  }

  if (typeof options.total === "number" && Number.isFinite(options.total)) {
    snapshot.total = Math.max(0, options.total);
  }

  localStorage.setItem(LAST_ORDER_KEY, JSON.stringify(snapshot));
  saveOrderToHistory(snapshot);
  window.dispatchEvent(new Event(ORDER_HISTORY_EVENT));
  return snapshot;
}

export function loadLastOrder(): OrderSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LAST_ORDER_KEY);
    if (!raw) return null;
    return normalizeOrder(JSON.parse(raw), 0);
  } catch {
    return null;
  }
}

export function loadOrderHistory(): OrderSnapshot[] {
  if (typeof window === "undefined") return [];

  try {
    const stored = readStoredOrderHistory();
    if (stored.length > 0) {
      persistOrderHistory(stored);
      return stored;
    }

    const last = loadLastOrder();
    if (last) {
      const history = dedupeOrders([last]);
      persistOrderHistory(history);
      return history;
    }

    const seeded = createSeedOrderHistory();
    persistOrderHistory(seeded);
    return seeded;
  } catch {
    return [];
  }
}

export function getLastOrderedDatesByProduct(
  orders = loadOrderHistory()
): Record<string, string> {
  const dates: Record<string, string> = {};

  for (const order of orders) {
    const orderedAt = order.date || order.savedAt;
    if (!orderedAt) continue;
    const timestamp = Date.parse(orderedAt);
    if (Number.isNaN(timestamp)) continue;

    for (const item of order.items) {
      for (const key of getItemIdentifiers(item)) {
        const current = dates[key];
        if (!current || timestamp > Date.parse(current)) {
          dates[key] = orderedAt;
        }
      }
    }
  }

  return dates;
}

function readStoredOrderHistory(): OrderSnapshot[] {
  const orders: OrderSnapshot[] = [];

  for (const key of ORDER_HISTORY_KEYS) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      const rawOrders = Array.isArray(parsed) ? parsed : [parsed];
      orders.push(
        ...rawOrders
          .filter((order) => Array.isArray(order?.items) && order.items.length > 0)
          .map(normalizeOrder)
      );
    } catch {
      /* ignore invalid stored history */
    }
  }

  return dedupeOrders(orders);
}

function saveOrderToHistory(snapshot: OrderSnapshot): void {
  const history = readStoredOrderHistory();
  const next = dedupeOrders([normalizeOrder(snapshot, 0), ...history]).slice(
    0,
    MAX_HISTORY
  );
  persistOrderHistory(next);
}

function persistOrderHistory(history: OrderSnapshot[]) {
  const payload = JSON.stringify(history);
  for (const key of ORDER_HISTORY_KEYS) {
    localStorage.setItem(key, payload);
  }
}

function normalizeOrder(order: unknown, index: number): OrderSnapshot {
  const value = (order ?? {}) as Record<string, unknown>;
  const savedAt = String(value.savedAt || value.date || new Date().toISOString());
  const id = String(value.id || value.orderId || `order-${index}`);
  const rawItems = Array.isArray(value.items) ? value.items : [];

  return {
    id,
    orderId: String(value.orderId || id),
    savedAt,
    date: String(value.date || savedAt),
    items: rawItems.map(normalizeItem).filter((item) => item.productId),
    customer: normalizeCustomer(value.customer),
    total:
      typeof value.total === "number" && Number.isFinite(value.total)
        ? Math.max(0, value.total)
        : undefined,
  };
}

function normalizeItem(item: unknown): OrderHistoryItem {
  const value = (item ?? {}) as Record<string, unknown>;
  const productId = firstString(
    value.productId,
    value.id,
    value.sku,
    value.article
  );
  const quantity = Number(value.quantity) || 1;
  const minOrder = Number(value.minOrder) || 1;

  return {
    productId,
    quantity,
    minOrder,
    id: firstString(value.id),
    sku: firstString(value.sku),
    article: firstString(value.article),
  };
}

function createSeedOrderHistory(): OrderSnapshot[] {
  const date = new Date();
  date.setDate(date.getDate() - 7);
  const savedAt = date.toISOString();

  return [
    {
      id: "demo-order-1",
      orderId: "demo-order-1",
      date: savedAt,
      savedAt,
      items: [
        { productId: "1", quantity: 10, minOrder: 1 },
        { productId: "2", quantity: 5, minOrder: 1 },
      ],
    },
  ];
}

function dedupeOrders(orders: OrderSnapshot[]): OrderSnapshot[] {
  const seen = new Set<string>();
  const next: OrderSnapshot[] = [];

  for (const order of orders) {
    if (!order.items.length) continue;
    const key = order.orderId || order.id || `${order.date}-${signature(order)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(order);
  }

  return next;
}

function getItemIdentifiers(item: OrderHistoryItem): string[] {
  return Array.from(
    new Set(
      [item.productId, item.id, item.sku, item.article]
        .map((value) => normalizeIdentifier(value))
        .filter(Boolean)
    )
  );
}

function signature(order: OrderSnapshot) {
  return order.items
    .map((item) => `${item.productId}:${item.quantity}`)
    .sort()
    .join("|");
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return "";
}

function normalizeIdentifier(value: unknown) {
  return firstString(value).trim().toLowerCase();
}

function normalizeCustomer(value: unknown): OrderCustomer | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const name = firstString(raw.name);
  const phone = firstString(raw.phone);
  const comment = firstString(raw.comment);
  if (!name && !phone && !comment) return undefined;
  return {
    name,
    phone,
    comment: comment || undefined,
  };
}

function createOrderId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `order-${crypto.randomUUID()}`;
  }
  return `order-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
