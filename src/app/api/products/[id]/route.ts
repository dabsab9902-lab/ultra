import { NextRequest, NextResponse } from "next/server";
import { catalog } from "@/lib/catalog";
import { priceProductForRequest } from "@/lib/server/client-pricing";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const product = catalog.getById(id);

  if (!product) {
    return NextResponse.json({ error: "Товар не найден" }, { status: 404 });
  }

  const pricedProduct = await priceProductForRequest(product, request);

  return NextResponse.json(pricedProduct, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
