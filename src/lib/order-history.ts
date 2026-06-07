import type { CartItem } from "@/lib/types";
import { getClientSession } from "@/lib/client-pricing-session";

export const ORDER_HISTORY_KEY = "orderHistory";
const LEGACY_ORDER_HISTORY_KEY = "ultra-svet-order-history";
export const ORDER_HISTORY_KEYS = [ORDER_HISTORY_KEY, LEGACY_ORDER_HISTORY_KEY];
const CLIENT_LAST_ORDER_PREFIX = "ultra-svet-last-order:";
const CLIENT_ORDER_HISTORY_PREFIX = "ultra-svet-order-history:";
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
  clientId?: string;
  clientName?: string;
  clientPhone?: string;
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

  const client = getClientSession();
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
    clientId: client?.id,
    clientName: client?.name,
    clientPhone: client?.phone,
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

  if (client) {
    localStorage.setItem(getClientLastOrderKey(client.id), JSON.stringify(snapshot));
    saveOrderToHistory(snapshot, client.id);
  }
  window.dispatchEvent(new Event(ORDER_HISTORY_EVENT));
  return snapshot;
}

export function loadLastOrder(): OrderSnapshot | null {
  if (typeof window === "undefined") return null;
  const client = getClientSession();
  if (!client) return null;
  try {
    const raw = localStorage.getItem(getClientLastOrderKey(client.id));
    if (!raw) return null;
    return normalizeOrder(JSON.parse(raw), 0);
  } catch {
    return null;
  }
}

export function loadOrderHistory(): OrderSnapshot[] {
  if (typeof window === "undefined") return [];
  const client = getClientSession();
  if (!client) return [];

  try {
    const stored = readStoredOrderHistory(client.id, client.phone);
    if (stored.length > 0) {
      persistOrderHistory(stored, client.id);
      return stored;
    }

    const last = loadLastOrder();
    if (last) {
      const history = dedupeOrders([last]);
      persistOrderHistory(history, client.id);
      return history;
    }

    return [];
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

export function isOrderHistoryStorageKey(key: string) {
  return (
    ORDER_HISTORY_KEYS.includes(key) ||
    key.startsWith(CLIENT_ORDER_HISTORY_PREFIX) ||
    key.startsWith(CLIENT_LAST_ORDER_PREFIX)
  );
}

function readStoredOrderHistory(clientId: string, clientPhone: string): OrderSnapshot[] {
  const orders: OrderSnapshot[] = [];

  for (const key of [getClientOrderHistoryKey(clientId), ...ORDER_HISTORY_KEYS]) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      const rawOrders = Array.isArray(parsed) ? parsed : [parsed];
      orders.push(
        ...rawOrders
          .filter((order) => Array.isArray(order?.items) && order.items.length > 0)
          .map(normalizeOrder)
          .filter((order) => isOrderForClient(order, clientId, clientPhone))
      );
    } catch {
      /* ignore invalid stored history */
    }
  }

  return dedupeOrders(orders);
}

function saveOrderToHistory(snapshot: OrderSnapshot, clientId: string): void {
  const history = readStoredOrderHistory(clientId, snapshot.clientPhone ?? "");
  const next = dedupeOrders([normalizeOrder(snapshot, 0), ...history]).slice(
    0,
    MAX_HISTORY
  );
  persistOrderHistory(next, clientId);
}

function persistOrderHistory(history: OrderSnapshot[], clientId: string) {
  const payload = JSON.stringify(history);
  localStorage.setItem(getClientOrderHistoryKey(clientId), payload);
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
    clientId: firstString(value.clientId),
    clientName: firstString(value.clientName),
    clientPhone: firstString(value.clientPhone),
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

function getClientLastOrderKey(clientId: string) {
  return `${CLIENT_LAST_ORDER_PREFIX}${clientId}`;
}

function getClientOrderHistoryKey(clientId: string) {
  return `${CLIENT_ORDER_HISTORY_PREFIX}${clientId}`;
}

function isOrderForClient(order: OrderSnapshot, clientId: string, clientPhone: string) {
  if (order.clientId) return order.clientId === clientId;
  const phone = normalizeIdentifier(clientPhone);
  if (!phone) return false;
  return (
    normalizeIdentifier(order.clientPhone) === phone ||
    normalizeIdentifier(order.customer?.phone) === phone
  );
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
