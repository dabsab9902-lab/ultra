import { NextRequest, NextResponse } from "next/server";
import { catalog } from "@/lib/catalog";
import { detectProductBrand } from "@/lib/brand-detector";
import {
  getAgentPlusTreeNode,
  getAgentPlusTreeProducts,
  readAgentPlusTree,
} from "@/lib/server/agentplus-tree-store";
import {
  normalizeProductSort,
  sortItems,
} from "@/lib/product-sort";
import { priceProductsForRequest } from "@/lib/server/client-pricing";
import type { Product } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const groupId = searchParams.get("groupId") ?? "";

  if (!groupId) {
    const tree = await readAgentPlusTree();
    return NextResponse.json(
      {
        roots: tree.roots,
        totalGroups: tree.totalGroups,
        totalProducts: tree.totalProducts,
        matchedProducts: tree.matchedProducts,
        generatedAt: tree.generatedAt,
      },
      {
        headers: {
          "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
        },
      }
    );
  }

  const group = await getAgentPlusTreeNode(groupId);
  if (!group) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const page = parsePositiveInt(searchParams.get("page"), 1);
  const limit = Math.min(parsePositiveInt(searchParams.get("limit"), 40), 100);
  const sort = normalizeProductSort(searchParams.get("sort"));
  const offset = (page - 1) * limit;
  const allProducts = await getAgentPlusTreeProducts(groupId);
  const pwaIds = allProducts
    .map((item) => item.pwaProductId)
    .filter((id): id is string => Boolean(id));
  const pwaProducts = await priceProductsForRequest(catalog.getByIds(pwaIds), request);
  const productById = new Map<string, Product>(
    pwaProducts.map((product) => [product.id, product])
  );
  const sortedRows = sortItems(
    allProducts.map((agent) => ({
      agent,
      product: agent.pwaProductId
        ? productById.get(agent.pwaProductId) ?? null
        : null,
    })),
    sort,
    (row, index) => ({
      name: row.product?.name ?? row.agent.name,
      brand: row.product?.brand ?? detectProductBrand(row.agent.name),
      price: row.product?.price ?? row.agent.price,
      stock: row.product?.stock ?? row.agent.stock,
      index,
    })
  );
  const pageRows = sortedRows.slice(offset, offset + limit);

  return NextResponse.json(
    {
      group,
      items: pageRows,
      total: sortedRows.length,
      page,
      limit,
      hasMore: offset + pageRows.length < sortedRows.length,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}

function parsePositiveInt(value: string | null, fallback: number) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.floor(parsed));
}
