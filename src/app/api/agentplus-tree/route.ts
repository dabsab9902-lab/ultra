import { NextRequest, NextResponse } from "next/server";
import { catalog } from "@/lib/catalog";
import {
  getAgentPlusTreeNode,
  getAgentPlusTreeProducts,
  readAgentPlusTree,
} from "@/lib/server/agentplus-tree-store";
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
  const offset = (page - 1) * limit;
  const pageProducts = await getAgentPlusTreeProducts(groupId, {
    offset,
    limit,
  });
  const pwaIds = pageProducts
    .map((item) => item.pwaProductId)
    .filter((id): id is string => Boolean(id));
  const pwaProducts = await priceProductsForRequest(catalog.getByIds(pwaIds), request);
  const productById = new Map<string, Product>(
    pwaProducts.map((product) => [product.id, product])
  );

  return NextResponse.json(
    {
      group,
      items: pageProducts.map((agent) => ({
        agent,
        product: agent.pwaProductId
          ? productById.get(agent.pwaProductId) ?? null
          : null,
      })),
      total: group.count,
      page,
      limit,
      hasMore: offset + pageProducts.length < group.count,
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
