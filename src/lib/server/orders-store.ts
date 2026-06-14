import { mkdir, readFile, writeFile } from "fs/promises";
import { dirname } from "path";
import {
  ensureRuntimeDataFile,
  getRuntimeDataStoreInfo,
} from "@/lib/server/json-data-store";
import {
  isOrderStatus,
  type ManagerOrder,
  type ManagerOrderCustomer,
  type ManagerOrderItem,
  type OrderStatus,
} from "@/lib/manager-orders";

const ORDERS_FILE_NAME = "orders.json";
const STORE_VERSION = 1;

interface StoredOrdersFile {
  version: number;
  orders: ManagerOrder[];
}

export interface OrdersStorageInfo {
  mode: "local-file" | "vercel-tmp";
  durable: boolean;
  backupRequired: boolean;
  label: string;
  location: string;
}

export async function readManagerOrders(): Promise<ManagerOrder[]> {
  const file = await readOrdersFile();
  return file.orders
    .map(normalizeStoredOrder)
    .filter((order): order is ManagerOrder => Boolean(order))
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
}

export function getOrdersStorageInfo(): OrdersStorageInfo {
  const runtime = getRuntimeDataStoreInfo(ORDERS_FILE_NAME);
  const temporary = runtime.runtime === "vercel-tmp";

  return {
    mode: temporary ? "vercel-tmp" : "local-file",
    durable: runtime.durable,
    backupRequired: temporary,
    label: temporary ? "Vercel /tmp" : "data/orders.json",
    location: runtime.filePath,
  };
}

export async function createManagerOrder(input: unknown): Promise<ManagerOrder> {
  const order = normalizeIncomingOrder(input);
  if (!order) {
    throw new Error("invalid_order");
  }

  const file = await readOrdersFile();
  const existingIndex = file.orders.findIndex(
    (item) => item.orderId === order.orderId || item.id === order.id
  );

  if (existingIndex >= 0) {
    return file.orders[existingIndex];
  }

  const next = [order, ...file.orders];
  await writeOrdersFile(next);
  return order;
}

export async function importManagerOrders(input: unknown) {
  const rawOrders = extractOrders(input);
  const current = await readManagerOrders();
  const next = [...current];
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const rawOrder of rawOrders) {
    const incoming = normalizeStoredOrder(rawOrder);
    if (!incoming) {
      skipped += 1;
      continue;
    }

    const index = next.findIndex((order) => isSameOrder(order, incoming));
    if (index >= 0) {
      next[index] = {
        ...incoming,
        id: next[index].id,
        orderId: next[index].orderId,
      };
      updated += 1;
      continue;
    }

    next.unshift(incoming);
    created += 1;
  }

  await writeOrdersFile(next);
  return {
    orders: await readManagerOrders(),
    created,
    updated,
    skipped,
  };
}

export async function updateManagerOrderStatus(
  id: string,
  status: OrderStatus
): Promise<ManagerOrder | null> {
  const file = await readOrdersFile();
  const index = file.orders.findIndex(
    (order) => order.id === id || order.orderId === id
  );
  if (index < 0) return null;

  const updated: ManagerOrder = {
    ...file.orders[index],
    status,
    updatedAt: new Date().toISOString(),
  };
  const next = [...file.orders];
  next[index] = updated;
  await writeOrdersFile(next);
  return updated;
}

function normalizeIncomingOrder(input: unknown): ManagerOrder | null {
  const value = asRecord(input);
  const now = new Date().toISOString();
  const orderId = firstString(value.orderId, value.id) || createOrderId();
  const customer = normalizeCustomer(value.customer);
  const items = Array.isArray(value.items)
    ? value.items.map(normalizeItem).filter((item): item is ManagerOrderItem => Boolean(item))
    : [];

  if (!customer.name || !customer.phone || items.length === 0) return null;

  const total =
    positiveNumber(value.total) ??
    items.reduce((sum, item) => sum + item.total, 0);
  const date = firstString(value.date, value.savedAt, value.createdAt) || now;

  return {
    id: orderId,
    orderId,
    date,
    clientId: firstString(value.clientId) || undefined,
    clientName: firstString(value.clientName) || undefined,
    clientPhone: firstString(value.clientPhone) || undefined,
    customer,
    items,
    total,
    status: "Новый",
    createdAt: now,
    updatedAt: now,
  };
}

function normalizeStoredOrder(input: unknown): ManagerOrder | null {
  const value = asRecord(input);
  const incoming = normalizeIncomingOrder(value);
  if (!incoming) return null;
  const status = isOrderStatus(value.status) ? value.status : incoming.status;
  const createdAt = firstString(value.createdAt) || incoming.createdAt;
  const updatedAt = firstString(value.updatedAt) || createdAt;

  return {
    ...incoming,
    status,
    createdAt,
    updatedAt,
  };
}

function extractOrders(input: unknown) {
  if (Array.isArray(input)) return input;
  const value = asRecord(input);
  return Array.isArray(value.orders) ? value.orders : [];
}

function isSameOrder(first: ManagerOrder, second: ManagerOrder) {
  return first.id === second.id || first.orderId === second.orderId;
}

function normalizeCustomer(input: unknown): ManagerOrderCustomer {
  const value = asRecord(input);
  return {
    name: firstString(value.name),
    phone: firstString(value.phone),
    comment: firstString(value.comment) || undefined,
  };
}

function normalizeItem(input: unknown): ManagerOrderItem | null {
  const value = asRecord(input);
  const sku = firstString(value.sku, value.article);
  const name = firstString(value.name, value.title);
  const quantity = positiveNumber(value.quantity) ?? 0;
  const price = positiveNumber(value.price) ?? 0;
  const total = positiveNumber(value.total) ?? price * quantity;

  if ((!sku && !name) || quantity <= 0) return null;

  return {
    productId: firstString(value.productId, value.id) || undefined,
    sku: sku || "Без артикула",
    name: name || sku || "Товар",
    quantity,
    unit: firstString(value.unit) || "шт",
    price,
    total,
  };
}

async function readOrdersFile(): Promise<StoredOrdersFile> {
  try {
    const filePath = await getOrdersFilePath();
    const raw = await readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw) as StoredOrdersFile | ManagerOrder[];
    if (Array.isArray(parsed)) {
      return { version: STORE_VERSION, orders: parsed };
    }
    return {
      version: parsed.version ?? STORE_VERSION,
      orders: Array.isArray(parsed.orders) ? parsed.orders : [],
    };
  } catch {
    return { version: STORE_VERSION, orders: [] };
  }
}

async function writeOrdersFile(orders: ManagerOrder[]) {
  const filePath = await getOrdersFilePath();
  await mkdir(dirname(filePath), { recursive: true });
  const payload: StoredOrdersFile = {
    version: STORE_VERSION,
    orders,
  };
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
}

async function getOrdersFilePath() {
  return ensureRuntimeDataFile(
    ORDERS_FILE_NAME,
    `${JSON.stringify({ version: STORE_VERSION, orders: [] }, null, 2)}\n`
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return "";
}

function positiveNumber(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return undefined;
  return Math.max(0, number);
}

function createOrderId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `order-${crypto.randomUUID()}`;
  }
  return `order-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
