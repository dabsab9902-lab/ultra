import { NextResponse } from "next/server";
import { catalog } from "@/lib/catalog";

export const runtime = "nodejs";

let cachedSignature = "";
let cachedBody = "";

export async function GET() {
  const signature = catalog.getSourceSignature();

  if (!cachedBody || cachedSignature !== signature) {
    cachedBody = JSON.stringify(catalog.getCategories());
    cachedSignature = signature;
  }

  return new NextResponse(cachedBody, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=1800",
    },
  });
}
