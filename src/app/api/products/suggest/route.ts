import { NextRequest, NextResponse } from "next/server";
import { catalog } from "@/lib/catalog";
import { getClientFromRequest } from "@/lib/server/client-pricing";
import { getClientPrice } from "@/lib/pricing";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const q = searchParams.get("q") ?? "";
  const limit = Math.min(12, Math.max(1, Number(searchParams.get("limit") ?? "8")));

  if (!q.trim()) {
    return NextResponse.json({ items: [] });
  }

  const client = await getClientFromRequest(request);
  const items = catalog.suggest(q, limit).map((item) => {
    const product = catalog.getById(item.id);
    return product && client?.active
      ? { ...item, price: getClientPrice(product, client) }
      : item;
  });
  return NextResponse.json({ items });
}
