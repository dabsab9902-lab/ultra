import { NextRequest, NextResponse } from "next/server";
import { catalog } from "@/lib/catalog";
import { toPublicClient } from "@/lib/clients";
import { applyClientPrices } from "@/lib/pricing";
import {
  ADMIN_SESSION_COOKIE,
  isValidAdminSession,
} from "@/lib/server/admin-auth";
import { priceProductsForRequest } from "@/lib/server/client-pricing";
import {
  CLIENT_SESSION_COOKIE,
  readClients,
} from "@/lib/server/clients-store";
import type { Product } from "@/lib/types";

export const runtime = "nodejs";
const CATEGORY_PATH_SEPARATOR = "\u001f";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const q = searchParams.get("q") ?? undefined;
  const categoryId = searchParams.get("category") ?? "all";
  const subcategory = searchParams.get("subcategory") ?? "all";
  const categoryPath = parseCategoryPath(searchParams.get("path"));
  const brand = searchParams.get("brand") ?? undefined;
  const series = searchParams.get("series") ?? undefined;
  const design = searchParams.get("design") ?? undefined;
  const productType = searchParams.get("productType") ?? undefined;
  const cableMark = searchParams.get("cableMark") ?? undefined;
  const priceMin = parseOptionalNumber(searchParams.get("priceMin"));
  const priceMax = parseOptionalNumber(searchParams.get("priceMax"));
  const inStock =
    searchParams.get("inStock") === "true"
      ? true
      : searchParams.get("inStock") === "false"
        ? false
        : undefined;
  const specs = parseSpecFilters(searchParams);
  const page = parsePositiveInt(searchParams.get("page"), 1);
  const limit = parsePositiveInt(searchParams.get("limit"), 20);
  const offset = parseOptionalOffset(searchParams.get("offset"));
  const includeFilters = searchParams.get("includeFilters") !== "false";
  const featured = searchParams.get("featured") === "true";
  const preset = searchParams.get("preset") === "seasonal" ? "seasonal" : undefined;
  const idsParam = searchParams.get("ids");
  const clientId = searchParams.get("clientId") ?? "";

  const ids = idsParam
    ? idsParam.split(",").map((id) => id.trim()).filter(Boolean).slice(0, 100)
    : undefined;

  const result = catalog.query({
    q,
    categoryId,
    subcategory,
    categoryPath,
    brand,
    series,
    design,
    productType,
    cableMark,
    priceMin,
    priceMax,
    inStock,
    specs,
    page,
    limit,
    offset,
    includeFilters,
    featured,
    preset,
    ids,
  });
  const items = clientId
    ? await priceProductsForAdminClient(result.items, request, clientId)
    : await priceProductsForRequest(result.items, request);

  return NextResponse.json(
    {
      ...result,
      items,
      filters: result.filters,
      catalogTotal: catalog.getTotalCount(),
    },
    {
      headers: {
        "Cache-Control": getCacheControl(request, clientId),
      },
    }
  );
}

async function priceProductsForAdminClient<T extends Product>(
  products: T[],
  request: NextRequest,
  clientId: string
) {
  const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  if (!isValidAdminSession(token)) {
    return priceProductsForRequest(products, request);
  }

  const clients = await readClients();
  const client = clients.find((item) => item.id === clientId);
  return applyClientPrices(products, client ? toPublicClient(client) : null);
}

function parseCategoryPath(value: string | null): string[] | undefined {
  if (!value) return undefined;
  const path = value
    .split(CATEGORY_PATH_SEPARATOR)
    .map((entry) => entry.trim())
    .filter(Boolean);
  return path.length > 0 ? path : undefined;
}

function parsePositiveInt(value: string | null, fallback: number) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.floor(parsed));
}

function parseOptionalNumber(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseOptionalOffset(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.max(0, Math.floor(parsed));
}

function getCacheControl(request: NextRequest, clientId: string) {
  const personalized =
    Boolean(clientId) ||
    Boolean(request.cookies.get(CLIENT_SESSION_COOKIE)?.value) ||
    Boolean(request.cookies.get(ADMIN_SESSION_COOKIE)?.value);

  return personalized
    ? "no-store"
    : "public, s-maxage=30, stale-while-revalidate=120";
}

function parseSpecFilters(searchParams: URLSearchParams) {
  const entries = searchParams.getAll("spec");
  if (entries.length === 0) return undefined;

  const specs: Record<string, string> = {};
  for (const entry of entries) {
    const [key, value] = entry.split(CATEGORY_PATH_SEPARATOR);
    const cleanKey = key?.trim();
    const cleanValue = value?.trim();
    if (cleanKey && cleanValue) specs[cleanKey] = cleanValue;
  }
  return Object.keys(specs).length > 0 ? specs : undefined;
}
