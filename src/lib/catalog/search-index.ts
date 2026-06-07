import { normalizeSku } from "@/lib/search/query";
import {
  createProductSearchQueryVariants,
  hasSearchWordPrefix,
  normalizeProductSearchText,
  type ProductSearchQueryVariant,
} from "@/lib/search/products";
import type { CategoryId, Product } from "@/lib/types";

export interface SearchSuggestion {
  id: string;
  sku: string;
  name: string;
  price: number;
  categoryId: CategoryId;
  subcategory: string;
}

export interface CompactSearchEntry {
  id: string;
  sku: string;
  sn: string;
  name: string;
  brand: string;
  categoryId: CategoryId;
  subcategory: string;
  price: number;
}

interface IndexedProduct {
  product: Product;
  nameText: string;
  codeText: string;
  allText: string;
  compactCode: string;
  compactAll: string;
}

interface ScoredProduct {
  product: Product;
  score: number;
  index: number;
}

export class CatalogSearchIndex {
  private products: Product[] = [];
  private idToProduct = new Map<string, Product>();
  private indexed: IndexedProduct[] = [];
  private compactIndex: CompactSearchEntry[] = [];

  build(products: Product[]) {
    this.products = products;
    this.idToProduct.clear();
    this.indexed = [];
    this.compactIndex = [];

    for (const product of products) {
      this.idToProduct.set(product.id, product);
      this.indexed.push(createIndexedProduct(product));
      this.compactIndex.push({
        id: product.id,
        sku: product.sku,
        sn: normalizeSku(product.sku),
        name: product.name,
        brand: product.brand,
        categoryId: product.categoryId,
        subcategory: product.subcategory,
        price: product.price,
      });
    }
  }

  getCompactIndex(): CompactSearchEntry[] {
    return this.compactIndex;
  }

  searchIds(
    query: string,
    allowed: Set<string> | null,
    maxResults = 5000
  ): string[] {
    return searchIndexedProducts(query, this.indexed, allowed, maxResults).map(
      (product) => product.id
    );
  }

  suggest(
    query: string,
    allowed: Set<string> | null,
    limit = 8
  ): SearchSuggestion[] {
    return searchIndexedProducts(query, this.indexed, allowed, limit).map((product) => ({
      id: product.id,
      sku: product.sku,
      name: product.name,
      price: product.price,
      categoryId: product.categoryId,
      subcategory: product.subcategory,
    }));
  }
}

function createIndexedProduct(product: Product): IndexedProduct {
  const nameText = normalizeProductSearchText(product.name);
  const codeText = normalizeProductSearchText(
    [product.sku].filter(Boolean).join(" ")
  );
  const brandText = normalizeProductSearchText(product.brand);
  const categoryText = normalizeProductSearchText(
    [product.categoryId, product.subcategory, ...(product.categoryPath ?? [])]
      .filter(Boolean)
      .join(" ")
  );
  const allText = normalizeProductSearchText(
    `${nameText} ${codeText} ${brandText} ${categoryText}`
  );

  return {
    product,
    nameText,
    codeText,
    allText,
    compactCode: normalizeSku(codeText),
    compactAll: normalizeSku(allText),
  };
}

function searchIndexedProducts(
  query: string,
  indexed: IndexedProduct[],
  allowed: Set<string> | null,
  limit: number
): Product[] {
  const normalizedQuery = normalizeProductSearchText(query);
  if (!normalizedQuery) return [];

  const queryVariants = createProductSearchQueryVariants(normalizedQuery);
  const scored: ScoredProduct[] = [];

  indexed.forEach((entry, index) => {
    if (allowed && !allowed.has(entry.product.id)) return;
    const score = getBestIndexedScore(entry, queryVariants);
    if (score !== null) scored.push({ product: entry.product, score, index });
  });

  scored.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    return a.index - b.index;
  });

  return scored.slice(0, limit).map((item) => item.product);
}

function getBestIndexedScore(
  entry: IndexedProduct,
  queryVariants: ProductSearchQueryVariant[]
): number | null {
  let bestScore: number | null = null;

  for (const variant of queryVariants) {
    const score = scoreIndexedProduct(
      entry,
      variant.normalizedQuery,
      variant.queryTokens,
      variant.compactQuery
    );
    if (score === null) continue;
    const weightedScore = score + variant.penalty;
    if (bestScore === null || weightedScore < bestScore) {
      bestScore = weightedScore;
    }
  }

  return bestScore;
}

function scoreIndexedProduct(
  entry: IndexedProduct,
  normalizedQuery: string,
  queryTokens: string[],
  compactQuery: string
): number | null {
  if (compactQuery && entry.compactCode) {
    if (entry.compactCode === compactQuery) return 0;
    if (entry.compactCode.startsWith(compactQuery)) return 1;
    if (entry.compactCode.includes(compactQuery)) return 2;
  }

  if (entry.codeText.includes(normalizedQuery)) return 3;
  if (entry.nameText === normalizedQuery) return 5;
  if (entry.nameText.startsWith(normalizedQuery)) return 6;
  if (hasSearchWordPrefix(entry.nameText, normalizedQuery)) return 8;
  if (hasSearchWordPrefix(entry.allText, normalizedQuery)) return 9;
  if (
    queryTokens.length > 1 &&
    queryTokens.every((token) => entry.allText.includes(token))
  ) {
    return 10;
  }
  if (compactQuery.length >= 2 && entry.compactAll.includes(compactQuery)) {
    return 11;
  }
  if (entry.nameText.includes(normalizedQuery)) return 12;
  if (entry.allText.includes(normalizedQuery)) return 13;

  return null;
}
