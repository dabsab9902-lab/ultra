import type { Product } from "@/lib/types";

export type StatsPeriod = "week" | "month" | "quarter" | "all";

export const STATS_PERIODS: Array<{ value: StatsPeriod; label: string }> = [
  { value: "week", label: "Неделя" },
  { value: "month", label: "Месяц" },
  { value: "quarter", label: "Квартал" },
  { value: "all", label: "Все время" },
];

export interface CategoryStatsItem {
  productId?: string;
  id?: string;
  sku?: string;
  article?: string;
  quantity?: number;
  price?: number;
  total?: number;
}

export interface CategoryStatsOrder {
  id?: string;
  orderId?: string;
  date?: string;
  savedAt?: string;
  items: CategoryStatsItem[];
}

export interface CategoryStatsRow {
  key: string;
  category: string;
  subcategory: string;
  label: string;
  quantity: number;
  amount: number;
  orderCount: number;
  favoriteCount: number;
}

export interface CategoryStatsSummary {
  period: StatsPeriod;
  orderCount: number;
  itemCount: number;
  rows: CategoryStatsRow[];
  favoriteRows: CategoryStatsRow[];
  topByQuantity: CategoryStatsRow | null;
  topByAmount: CategoryStatsRow | null;
  topByFavorite: CategoryStatsRow | null;
  topByOrderCount: CategoryStatsRow | null;
}

export function normalizeStatsPeriod(value: unknown): StatsPeriod {
  return value === "week" ||
    value === "month" ||
    value === "quarter" ||
    value === "all"
    ? value
    : "all";
}

export function filterOrdersByStatsPeriod<T extends CategoryStatsOrder>(
  orders: T[],
  period: StatsPeriod
) {
  const from = getPeriodStart(period);
  if (!from) return orders;

  return orders.filter((order) => {
    const timestamp = Date.parse(order.date || order.savedAt || "");
    return Number.isFinite(timestamp) && timestamp >= from.getTime();
  });
}

export function buildCategoryOrderStats<TOrder extends CategoryStatsOrder>({
  orders,
  favoriteProducts = [],
  period = "all",
  resolveProduct,
}: {
  orders: TOrder[];
  favoriteProducts?: Product[];
  period?: StatsPeriod;
  resolveProduct: (item: CategoryStatsItem) => Product | undefined;
}): CategoryStatsSummary {
  const filteredOrders = filterOrdersByStatsPeriod(orders, period);
  const rows = new Map<string, CategoryStatsRow>();

  filteredOrders.forEach((order, orderIndex) => {
    const touchedInOrder = new Set<string>();

    order.items.forEach((item) => {
      const product = resolveProduct(item);
      if (!product) return;

      const row = getOrCreateRow(rows, product);
      const quantity = positiveNumber(item.quantity) || 1;
      row.quantity = roundStat(row.quantity + quantity);
      row.amount = roundStat(row.amount + lineAmount(item, product, quantity));
      touchedInOrder.add(row.key);
    });

    for (const key of touchedInOrder) {
      const row = rows.get(key);
      if (row) row.orderCount += 1;
    }

    if (!order.id && !order.orderId && orderIndex < 0) {
      return;
    }
  });

  const favoriteRows = new Map<string, CategoryStatsRow>();
  for (const product of favoriteProducts) {
    const row = getOrCreateRow(favoriteRows, product);
    row.favoriteCount += 1;
  }

  const orderRows = Array.from(rows.values()).sort(
    (a, b) => b.amount - a.amount || b.quantity - a.quantity || labelSort(a, b)
  );
  const favorites = Array.from(favoriteRows.values()).sort(
    (a, b) => b.favoriteCount - a.favoriteCount || labelSort(a, b)
  );

  return {
    period,
    orderCount: filteredOrders.length,
    itemCount: filteredOrders.reduce((sum, order) => sum + order.items.length, 0),
    rows: orderRows,
    favoriteRows: favorites,
    topByQuantity: topBy(orderRows, "quantity"),
    topByAmount: topBy(orderRows, "amount"),
    topByFavorite: topBy(favorites, "favoriteCount"),
    topByOrderCount: topBy(orderRows, "orderCount"),
  };
}

function getOrCreateRow(map: Map<string, CategoryStatsRow>, product: Product) {
  const category = product.categoryId?.trim() || "Без категории";
  const subcategory = product.subcategory?.trim() || "Другое";
  const key = `${category}\u0000${subcategory}`;
  const existing = map.get(key);
  if (existing) return existing;

  const row: CategoryStatsRow = {
    key,
    category,
    subcategory,
    label: subcategory ? `${category} / ${subcategory}` : category,
    quantity: 0,
    amount: 0,
    orderCount: 0,
    favoriteCount: 0,
  };
  map.set(key, row);
  return row;
}

function lineAmount(item: CategoryStatsItem, product: Product, quantity: number) {
  const total = positiveNumber(item.total);
  if (total !== undefined) return total;

  const price = positiveNumber(item.price) ?? positiveNumber(product.price) ?? 0;
  return price * quantity;
}

function topBy(
  rows: CategoryStatsRow[],
  field: "quantity" | "amount" | "favoriteCount" | "orderCount"
) {
  return [...rows]
    .filter((row) => row[field] > 0)
    .sort((a, b) => b[field] - a[field] || labelSort(a, b))[0] ?? null;
}

function getPeriodStart(period: StatsPeriod) {
  if (period === "all") return null;

  const start = new Date();
  if (period === "week") start.setDate(start.getDate() - 7);
  if (period === "month") start.setMonth(start.getMonth() - 1);
  if (period === "quarter") start.setMonth(start.getMonth() - 3);
  start.setHours(0, 0, 0, 0);
  return start;
}

function positiveNumber(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return undefined;
  return number;
}

function roundStat(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function labelSort(a: CategoryStatsRow, b: CategoryStatsRow) {
  return a.label.localeCompare(b.label, "ru");
}
