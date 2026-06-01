import { normalizeSearchQuery, normalizeSku } from "@/lib/search/query";

export interface SearchableProduct {
  id: string | number;
  name?: string | null;
  title?: string | null;
  sku?: string | null;
  article?: string | null;
  categoryId?: string | null;
  subcategory?: string | null;
  specs?: Record<string, string | undefined> | null;
}

interface SearchProductsOptions {
  limit?: number;
}

interface ScoredProduct<T> {
  product: T;
  score: number;
  index: number;
}

export function normalizeProductSearchText(value: string): string {
  return normalizeSearchQuery(value).toLocaleLowerCase("ru");
}

export function searchProducts<T extends SearchableProduct>(
  query: string,
  products: T[],
  options: SearchProductsOptions = {}
): T[] {
  const normalizedQuery = normalizeProductSearchText(query);
  if (!normalizedQuery) return [];

  const queryTokens = normalizedQuery.split(" ").filter(Boolean);
  const compactQuery = normalizeSku(normalizedQuery);
  const scored: ScoredProduct<T>[] = [];

  products.forEach((product, index) => {
    const score = scoreProduct(product, normalizedQuery, queryTokens, compactQuery);
    if (score !== null) scored.push({ product, score, index });
  });

  scored.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    return a.index - b.index;
  });

  const limited =
    typeof options.limit === "number" ? scored.slice(0, options.limit) : scored;

  return limited.map((item) => item.product);
}

function scoreProduct<T extends SearchableProduct>(
  product: T,
  normalizedQuery: string,
  queryTokens: string[],
  compactQuery: string
): number | null {
  const nameText = normalizeProductSearchText(
    [product.name, product.title].map(toSearchValue).filter(Boolean).join(" ")
  );
  const codeText = normalizeProductSearchText(
    [
      product.sku,
      product.article,
      ...getArticleSpecValues(product.specs),
    ]
      .map(toSearchValue)
      .filter(Boolean)
      .join(" ")
  );
  const categoryText = normalizeProductSearchText(
    [product.categoryId, product.subcategory]
      .map(toSearchValue)
      .filter(Boolean)
      .join(" ")
  );
  const allText = normalizeProductSearchText(
    `${nameText} ${codeText} ${categoryText}`
  );
  const compactCode = normalizeSku(codeText);
  const compactAll = normalizeSku(allText);

  if (compactQuery && compactCode) {
    if (compactCode === compactQuery) return 0;
    if (compactCode.startsWith(compactQuery)) return 1;
    if (compactCode.includes(compactQuery)) return 2;
  }

  if (codeText.includes(normalizedQuery)) return 3;
  if (nameText === normalizedQuery) return 5;
  if (nameText.startsWith(normalizedQuery)) return 6;
  if (nameText.includes(normalizedQuery)) return 8;
  if (allText.includes(normalizedQuery)) return 9;
  if (queryTokens.length > 1 && queryTokens.every((token) => allText.includes(token))) {
    return 10;
  }
  if (compactQuery.length >= 2 && compactAll.includes(compactQuery)) return 11;

  return null;
}

function toSearchValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return "";
}

function getArticleSpecValues(
  specs: SearchableProduct["specs"]
): Array<string | undefined> {
  if (!specs) return [];

  return Object.entries(specs)
    .filter(([key]) => {
      const normalizedKey = normalizeProductSearchText(key);
      return normalizedKey.includes("артикул") || normalizedKey.includes("article");
    })
    .map(([, value]) => value);
}
