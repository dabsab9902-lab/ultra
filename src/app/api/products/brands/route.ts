import { NextResponse } from "next/server";
import { catalog } from "@/lib/catalog";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(
    { brands: catalog.getBrands() },
    {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    }
  );
}
