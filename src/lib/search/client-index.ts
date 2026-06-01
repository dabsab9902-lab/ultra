import { searchProducts } from "@/lib/search/products";
import type { CategoryId } from "@/lib/types";
import type { CompactSearchEntry } from "@/lib/catalog/search-index";

export interface ClientSuggestion {
  id: string;
  sku: string;
  name: string;
  price: number;
  categoryId: CategoryId;
}

export function searchClientIndex(
  entries: CompactSearchEntry[],
  query: string,
  categoryId: CategoryId | "all",
  limit = 8
): ClientSuggestion[] {
  const pool =
    categoryId === "all"
      ? entries
      : entries.filter((entry) => entry.categoryId === categoryId);

  return searchProducts(query, pool, { limit }).map((entry) => ({
    id: entry.id,
    sku: entry.sku,
    name: entry.name,
    price: entry.price,
    categoryId: entry.categoryId,
  }));
}
