import { NextRequest, NextResponse } from "next/server";
import { catalog } from "@/lib/catalog";
import { detectProductBrand, normalizeBrandKey } from "@/lib/brand-detector";
import type { ClientRecord } from "@/lib/clients";
import { normalizePhone } from "@/lib/clients";
import type { ManagerOrder, ManagerOrderItem } from "@/lib/manager-orders";
import {
  ADMIN_SESSION_COOKIE,
  isValidAdminSession,
} from "@/lib/server/admin-auth";
import {
  readClients,
  updateClient,
} from "@/lib/server/clients-store";
import {
  createManagerOrder,
  readManagerOrders,
} from "@/lib/server/orders-store";
import {
  createCommercialProposal,
  filterProposalsForClient,
  normalizeProposalItemsForClient,
  readCommercialProposals,
} from "@/lib/server/proposals-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  if (!hasAdminSession(request)) return unauthorized();

  const { id } = await params;
  const details = await buildClientDetails(id);
  if (!details) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json(details, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  if (!hasAdminSession(request)) return unauthorized();

  const { id } = await params;
  try {
    const client = await updateClient(id, await request.json());
    if (!client) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const details = await buildClientDetails(client.id);
    return NextResponse.json(details ?? { client });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "invalid_client" },
      { status: 400 }
    );
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  if (!hasAdminSession(request)) return unauthorized();

  const { id } = await params;
  const clients = await readClients();
  const client = clients.find((item) => item.id === id);
  if (!client) return NextResponse.json({ error: "not_found" }, { status: 404 });

  try {
    const body = (await request.json()) as {
      action?: unknown;
      items?: unknown;
      managerComment?: unknown;
    };
    const action = typeof body.action === "string" ? body.action : "";

    if (action === "resetPassword") {
      const code = createLoginCode();
      const updated = await updateClient(client.id, { ...client, code });
      return NextResponse.json({ client: updated, code });
    }

    if (action === "repeatLastOrder") {
      const details = await buildClientDetails(client.id);
      const lastOrder = details?.orders[0];
      if (!lastOrder) {
        return NextResponse.json({ error: "no_orders" }, { status: 400 });
      }
      const order = await createOrderForClient(client, lastOrder.items);
      return NextResponse.json({ order }, { status: 201 });
    }

    if (action === "createOrder") {
      const items = Array.isArray(body.items)
        ? body.items.map(normalizeManualOrderItem).filter((item): item is ManagerOrderItem => Boolean(item))
        : [];
      if (items.length === 0) {
        return NextResponse.json({ error: "empty_order" }, { status: 400 });
      }
      const order = await createOrderForClient(client, items);
      return NextResponse.json({ order }, { status: 201 });
    }

    if (action === "createProposal") {
      const items = normalizeProposalItemsForClient(body.items, client);
      if (items.length === 0) {
        return NextResponse.json({ error: "empty_proposal" }, { status: 400 });
      }
      const total = roundMoney(
        items.reduce((sum, item) => sum + item.total, 0)
      );
      const proposal = await createCommercialProposal({
        date: new Date().toISOString(),
        clientId: client.id,
        clientName: client.name,
        clientPhone: client.phone,
        customer: {
          name: client.name,
          phone: client.phone,
          comment:
            "\u041a\u043e\u043c\u043c\u0435\u0440\u0447\u0435\u0441\u043a\u043e\u0435 \u043f\u0440\u0435\u0434\u043b\u043e\u0436\u0435\u043d\u0438\u0435 \u043c\u0435\u043d\u0435\u0434\u0436\u0435\u0440\u0430",
        },
        items,
        total,
        managerComment: firstString(body.managerComment),
      });
      return NextResponse.json({ proposal }, { status: 201 });
    }

    return NextResponse.json({ error: "unknown_action" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "action_failed" }, { status: 400 });
  }
}

async function buildClientDetails(id: string) {
  const clients = await readClients();
  const client = clients.find((item) => item.id === id);
  if (!client) return null;

  const allOrders = await readManagerOrders();
  const orders = allOrders.filter((order) => isClientOrder(order, client));
  const allProposals = await readCommercialProposals();
  const proposals = filterProposalsForClient(allProposals, client);
  const stats = buildStats(orders);
  const brands = buildBrandRows(client);

  return {
    client,
    orders,
    proposals,
    stats,
    brands,
  };
}

function isClientOrder(order: ManagerOrder, client: ClientRecord) {
  const clientPhone = normalizePhone(client.phone);
  return (
    order.clientId === client.id ||
    normalizePhone(order.clientPhone ?? "") === clientPhone ||
    normalizePhone(order.customer.phone) === clientPhone
  );
}

function buildStats(orders: ManagerOrder[]) {
  const categoryCounts = new Map<string, number>();
  const brandCounts = new Map<string, number>();

  for (const order of orders) {
    for (const item of order.items) {
      const product = findProductForItem(item);
      const quantity = Number(item.quantity) || 0;
      const category = product?.categoryId || "Без категории";
      const brand = product?.brand || detectProductBrand(item.name);

      categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + quantity);
      brandCounts.set(brand, (brandCounts.get(brand) ?? 0) + quantity);
    }
  }

  return {
    orderCount: orders.length,
    totalAmount: roundMoney(orders.reduce((sum, order) => sum + order.total, 0)),
    lastOrder: orders[0] ?? null,
    topCategories: topEntries(categoryCounts),
    topBrands: topEntries(brandCounts),
  };
}

function buildBrandRows(client: ClientRecord) {
  const discountMap = new Map(
    client.discounts.map((discount) => [
      normalizeBrandKey(discount.brand),
      discount,
    ])
  );
  const seen = new Set<string>();
  const rows = catalog
    .getBrands()
    .filter((brand) => brand.name !== "Без бренда")
    .map((brand) => {
      const key = normalizeBrandKey(brand.name);
      seen.add(key);
      const discount = discountMap.get(key);
      return {
        brand: brand.name,
        count: brand.count,
        percent: discount?.percent ?? 0,
        hasDiscount: Boolean(discount),
      };
    });

  for (const discount of client.discounts) {
    const key = normalizeBrandKey(discount.brand);
    if (seen.has(key)) continue;
    rows.push({
      brand: discount.brand,
      count: 0,
      percent: discount.percent,
      hasDiscount: true,
    });
  }

  return rows.sort((a, b) => {
    if (a.hasDiscount !== b.hasDiscount) return a.hasDiscount ? -1 : 1;
    return a.brand.localeCompare(b.brand, "ru");
  });
}

function findProductForItem(item: ManagerOrderItem) {
  if (item.productId) {
    const byId = catalog.getById(item.productId);
    if (byId) return byId;
  }

  const matches = catalog.query({
    q: item.sku,
    limit: 5,
    includeFilters: false,
  }).items;
  return matches.find((product) => product.sku === item.sku) ?? matches[0];
}

async function createOrderForClient(
  client: ClientRecord,
  items: ManagerOrderItem[]
) {
  const normalizedItems = items.map((item) => ({
    ...item,
    total: roundMoney((Number(item.price) || 0) * (Number(item.quantity) || 0)),
  }));
  const total = roundMoney(
    normalizedItems.reduce((sum, item) => sum + item.total, 0)
  );

  return createManagerOrder({
    date: new Date().toISOString(),
    clientId: client.id,
    clientName: client.name,
    clientPhone: client.phone,
    customer: {
      name: client.name,
      phone: client.phone,
      comment: "Заказ создан менеджером",
    },
    items: normalizedItems,
    total,
  });
}

function normalizeManualOrderItem(input: unknown): ManagerOrderItem | null {
  const value = input && typeof input === "object"
    ? (input as Record<string, unknown>)
    : {};
  const sku = firstString(value.sku, value.article);
  const name = firstString(value.name, value.title);
  const quantity = positiveNumber(value.quantity);
  const price = positiveNumber(value.price);
  const unit = firstString(value.unit) || "шт";

  if ((!sku && !name) || !quantity || price === undefined) return null;

  return {
    productId: firstString(value.productId) || undefined,
    sku: sku || name,
    name: name || sku,
    quantity,
    unit,
    price,
    total: roundMoney(price * quantity),
  };
}

function topEntries(map: Map<string, number>) {
  return Array.from(map.entries())
    .map(([name, count]) => ({ name, count: roundMoney(count) }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ru"))
    .slice(0, 5);
}

function hasAdminSession(request: NextRequest) {
  const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  return isValidAdminSession(token);
}

function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

function createLoginCode() {
  return String(Math.floor(1000 + Math.random() * 9000));
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

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
