import { catalog } from "@/lib/catalog";
import {
  getProductExplanation,
  getProductInsightText,
  normalizeInsightText,
} from "@/lib/product-explanations";
import type { Product } from "@/lib/types";

export interface ProductRecommendationItem {
  product: Product;
  label?: string;
  explanation?: string;
}

interface RelatedRule {
  match: (text: string) => boolean;
  terms: string[];
}

const RELATED_RULES: RelatedRule[] = [
  {
    match: (text) => includesAny(text, ["ввг", "пвс", "шввп", "сип", "кабель", "провод", "utp", "ftp"]),
    terms: ["гофра", "кабель-канал", "стяжки", "изолента", "наконечник"],
  },
  {
    match: (text) => includesAny(text, ["автомат", "узо", "дифавтомат", "реле", "контактор"]),
    terms: ["щит", "бокс", "гребенка", "шина", "клемма"],
  },
  {
    match: (text) => includesAny(text, ["светильник", "лампа", "прожектор", "led"]),
    terms: ["лампа", "датчик", "крепеж", "блок питания"],
  },
  {
    match: (text) => includesAny(text, ["розетка", "выключатель", "электрофурнитура"]),
    terms: ["рамка", "коробка", "подрозетник"],
  },
];

const PREMIUM_BRANDS = [
  "abb",
  "hager",
  "legrand",
  "schneider",
  "siemens",
  "eaton",
];

const VALUE_BRANDS = [
  "lemanso",
  "lxl",
  "mutlusan",
  "videx",
  "feron",
  "horoz",
];

export function getRelatedProducts(
  products: Product[],
  options: { limit?: number; excludeIds?: string[] } = {}
) {
  const limit = options.limit ?? 8;
  const excluded = new Set([
    ...products.map((product) => product.id),
    ...(options.excludeIds ?? []),
  ]);
  const scores = new Map<string, { product: Product; score: number }>();

  for (const product of products) {
    const text = getProductInsightText(product);
    const rules = RELATED_RULES.filter((rule) => rule.match(text));

    for (const rule of rules) {
      for (const term of rule.terms) {
        addSearchCandidates(scores, term, excluded, 80);
      }
    }

    addNeighborCandidates(scores, product, excluded, rules.length > 0 ? 22 : 35);
  }

  if (scores.size < limit) {
    addFallbackCandidates(scores, excluded, 8);
  }

  return Array.from(scores.values())
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.product.stock - a.product.stock ||
        a.product.name.localeCompare(b.product.name, "ru")
    )
    .map((entry) => entry.product)
    .slice(0, limit);
}

export function getProductAnalogSegments(product: Product) {
  const candidates = getAnalogCandidates(product);
  const prices = candidates.map((item) => item.price).sort((a, b) => a - b);
  const selected = new Map<string, ProductRecommendationItem>();

  for (const candidate of candidates) {
    const segment = getSegment(candidate, prices);
    const current = selected.get(segment.key);
    if (!current || analogScore(product, candidate) > analogScore(product, current.product)) {
      selected.set(segment.key, {
        product: candidate,
        label: segment.label,
        explanation: getAnalogExplanation(segment.label, candidate),
      });
    }
  }

  return [
    selected.get("value"),
    selected.get("middle"),
    selected.get("premium"),
  ].filter(Boolean) as ProductRecommendationItem[];
}

function addSearchCandidates(
  scores: Map<string, { product: Product; score: number }>,
  term: string,
  excluded: Set<string>,
  score: number
) {
  const result = catalog.query({ q: term, limit: 60, includeFilters: false });
  for (const product of result.items) {
    addCandidate(scores, product, excluded, score + stockBoost(product));
  }
}

function addNeighborCandidates(
  scores: Map<string, { product: Product; score: number }>,
  source: Product,
  excluded: Set<string>,
  score: number
) {
  const pools: Product[][] = [];

  if (source.categoryPath && source.categoryPath.length > 1) {
    pools.push(
      catalog.query({
        categoryPath: source.categoryPath.slice(0, -1),
        limit: 80,
        includeFilters: false,
      }).items
    );
  }

  pools.push(
    catalog.query({
      categoryId: source.categoryId,
      limit: 80,
      includeFilters: false,
    }).items
  );

  for (const pool of pools) {
    for (const product of pool) {
      if (product.subcategory === source.subcategory) continue;
      addCandidate(scores, product, excluded, score + stockBoost(product));
    }
  }
}

function addFallbackCandidates(
  scores: Map<string, { product: Product; score: number }>,
  excluded: Set<string>,
  score: number
) {
  const pool = catalog.query({ limit: 80, includeFilters: false }).items;
  for (const product of pool) {
    addCandidate(scores, product, excluded, score + stockBoost(product));
  }
}

function addCandidate(
  scores: Map<string, { product: Product; score: number }>,
  product: Product,
  excluded: Set<string>,
  score: number
) {
  if (excluded.has(product.id)) return;
  const current = scores.get(product.id);
  if (!current || score > current.score) {
    scores.set(product.id, { product, score });
  }
}

function getAnalogCandidates(product: Product) {
  const byPath = product.categoryPath?.length
    ? catalog.query({
        categoryPath: product.categoryPath,
        limit: 100,
        includeFilters: false,
      }).items
    : [];
  const bySubcategory = catalog.query({
    categoryId: product.categoryId,
    subcategory: product.subcategory,
    limit: 100,
    includeFilters: false,
  }).items;

  const seen = new Set<string>();
  return [...byPath, ...bySubcategory]
    .filter((candidate) => {
      if (candidate.id === product.id || seen.has(candidate.id)) return false;
      seen.add(candidate.id);
      return true;
    })
    .sort((a, b) => analogScore(product, b) - analogScore(product, a))
    .slice(0, 60);
}

function getSegment(product: Product, sortedPrices: number[]) {
  const brand = normalizeInsightText(product.brand);
  if (PREMIUM_BRANDS.some((item) => brand.includes(item))) {
    return { key: "premium", label: "Премиум вариант" };
  }
  if (VALUE_BRANDS.some((item) => brand.includes(item))) {
    return { key: "value", label: "Доступный вариант" };
  }

  const low = percentile(sortedPrices, 0.34);
  const high = percentile(sortedPrices, 0.67);
  if (product.price <= low) return { key: "value", label: "Доступный вариант" };
  if (product.price >= high) return { key: "premium", label: "Премиум вариант" };
  return { key: "middle", label: "Оптимальный вариант" };
}

function getAnalogExplanation(label: string, product: Product) {
  const explanation = getProductExplanation(product);
  return `${label}. ${explanation}`;
}

function analogScore(source: Product, candidate: Product) {
  const sourceTokens = significantTokens(source);
  const candidateText = getProductInsightText(candidate);
  const shared = sourceTokens.filter((token) => candidateText.includes(token)).length;
  const sameBrand = source.brand && source.brand === candidate.brand ? 2 : 0;
  const priceDistance =
    source.price > 0 ? Math.abs(candidate.price - source.price) / source.price : 0;
  return shared * 10 + sameBrand + stockBoost(candidate) - priceDistance;
}

function significantTokens(product: Product) {
  return Array.from(
    new Set(
      getProductInsightText(product)
        .split(" ")
        .filter((token) => token.length >= 3 || /\d/.test(token))
        .slice(0, 24)
    )
  );
}

function percentile(values: number[], ratio: number) {
  if (values.length === 0) return 0;
  const index = Math.min(
    values.length - 1,
    Math.max(0, Math.floor((values.length - 1) * ratio))
  );
  return values[index];
}

function stockBoost(product: Product) {
  return product.stock > 0 ? 4 : 0;
}

function includesAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}
