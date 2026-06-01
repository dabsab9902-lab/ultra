import { NextRequest, NextResponse } from "next/server";
import { catalog } from "@/lib/catalog";
import { getClientFromRequest } from "@/lib/server/client-pricing";
import { getClientPrice } from "@/lib/pricing";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const payload = catalog.getCompactSearchIndex();
  const client = await getClientFromRequest(request);
  const entries = client?.active
    ? payload.entries.map((entry) => {
        const product = catalog.getById(entry.id);
        return product
          ? { ...entry, price: getClientPrice(product, client) }
          : entry;
      })
    : payload.entries;

  return NextResponse.json(
    { ...payload, entries },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
