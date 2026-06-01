import { NextRequest, NextResponse } from "next/server";
import { catalog } from "@/lib/catalog";
import {
  getProductAnalogSegments,
  getRelatedProducts,
} from "@/lib/server/product-recommendations";
import { priceProductsForRequest } from "@/lib/server/client-pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const mode = searchParams.get("mode") === "analogs" ? "analogs" : "related";
  const limit = parseLimit(searchParams.get("limit"));
  const ids = parseIds(searchParams.get("ids") ?? searchParams.get("id"));
  const products = catalog.getByIds(ids);

  if (products.length === 0) {
    return NextResponse.json(
      { items: [], segments: [] },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }

  if (mode === "analogs") {
    const segments = getProductAnalogSegments(products[0]).slice(0, 3);
    const priced = await priceProductsForRequest(
      segments.map((segment) => segment.product),
      request
    );
    return NextResponse.json(
      {
        segments: segments.map((segment, index) => ({
          ...segment,
          product: priced[index],
        })),
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }

  const items = getRelatedProducts(products, { limit });
  const pricedItems = await priceProductsForRequest(items, request);

  return NextResponse.json(
    { items: pricedItems },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}

function parseIds(value: string | null) {
  if (!value) return [];
  return value
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .slice(0, 24);
}

function parseLimit(value: string | null) {
  const number = Number(value ?? 8);
  if (!Number.isFinite(number)) return 8;
  return Math.min(12, Math.max(1, Math.floor(number)));
}
