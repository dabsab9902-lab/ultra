import { readFileSync, existsSync, statSync } from "fs";
import { join } from "path";
import { getCategoryCorrection } from "@/lib/catalog/category-corrections";
import { OTHER_SUBCATEGORY, UNCATEGORIZED } from "@/lib/catalog/category-tree";
import { detectProductBrand, normalizeBrandName } from "@/lib/brand-detector";
import { resolveProductImageUrl } from "@/lib/product-image";
import { resolveDisplayArticle } from "@/lib/product-code";
import {
  BASE_PRICE_VERSION,
  getBasePriceFromSitePrice,
} from "@/lib/pricing";
import {
  getAgentPlusProductMatch,
  getAgentPlusProductsSignature,
} from "@/lib/catalog/agentplus-enrichment";
import type { CategoryId, Product } from "@/lib/types";

export interface ParsedProductRow {
  name?: string;
  title?: string;
  sku?: string;
  article?: string;
  siteArticle?: string;
  brandCode?: string;
  brand?: string;
  price: number;
  image?: string;
  imageUrl?: string;
  category?: string;
  subcategory?: string;
  categoryUrl?: string;
  subcategoryUrl?: string;
  categoryPath?: string[];
  categoryPathUrls?: string[];
  breadcrumbs?: Array<{ title?: string; url?: string }>;
  agentGuid?: string;
  agentPrice?: number;
  agentStock?: number;
  agentUnit?: string;
  agentCategoryPath?: string[];
  catalogHidden?: boolean;
  url: string;
}

export interface ParsedProductsFile {
  source?: string;
  generatedAt?: string;
  total?: number;
  products: ParsedProductRow[];
}

function readParsedFile(): ParsedProductsFile {
  const rootPath = join(process.cwd(), "products.json");
  if (existsSync(rootPath)) {
    return JSON.parse(readFileSync(rootPath, "utf-8")) as ParsedProductsFile;
  }

  const fallbackPath = join(process.cwd(), "src", "data", "products.json");
  const fallback = JSON.parse(readFileSync(fallbackPath, "utf-8")) as {
    products: Product[];
  };

  return {
    products: fallback.products.map((p) => ({
      name: p.name,
      sku: p.sku,
      brand: p.brand,
      price: p.price,
      image: p.image,
      imageUrl: p.image,
      category: p.specs?.["Категория"] ?? p.specs?.["Категорія"] ?? p.categoryId,
      subcategory: p.subcategory,
      agentGuid: p.agentGuid,
      agentPrice: p.agentPrice,
      agentStock: p.agentStock,
      agentUnit: p.agentUnit,
      agentCategoryPath: p.agentCategoryPath,
      catalogHidden: p.catalogHidden,
      url: p.sourceUrl ?? "",
    })),
  };
}

export function getCatalogProductsSignature(): string {
  const rootPath = join(process.cwd(), "products.json");
  if (existsSync(rootPath)) {
    const stat = statSync(rootPath);
    return `${rootPath}:${stat.mtimeMs}:${stat.size}:${BASE_PRICE_VERSION}:${getAgentPlusProductsSignature()}`;
  }

  const fallbackPath = join(process.cwd(), "src", "data", "products.json");
  const stat = statSync(fallbackPath);
  return `${fallbackPath}:${stat.mtimeMs}:${stat.size}:${BASE_PRICE_VERSION}:${getAgentPlusProductsSignature()}`;
}

export function normalizeProductCategory(categoryLabel?: string): CategoryId {
  const category = categoryLabel?.trim();
  return category && category.length > 0 ? category : UNCATEGORIZED;
}

function normalizeCategoryPath(row: ParsedProductRow) {
  const correction = getCategoryCorrection(row.url);
  if (correction) {
    return {
      path: correction.categoryPath,
      urls: correction.categoryPathUrls,
      hasRealPath: true,
    };
  }

  const breadcrumbPath = Array.isArray(row.breadcrumbs)
    ? row.breadcrumbs
        .map((crumb) => String(crumb?.title ?? "").trim())
        .filter(Boolean)
    : [];
  const breadcrumbUrls = Array.isArray(row.breadcrumbs)
    ? row.breadcrumbs.map((crumb) => String(crumb?.url ?? "").trim())
    : [];

  if (breadcrumbPath.length > 0) {
    return {
      path: breadcrumbPath,
      urls: breadcrumbPath.map((_, index) => breadcrumbUrls[index] ?? ""),
      hasRealPath: true,
    };
  }

  const storedPath = Array.isArray(row.categoryPath)
    ? row.categoryPath.map((entry) => String(entry).trim()).filter(Boolean)
    : [];
  const storedUrls = Array.isArray(row.categoryPathUrls)
    ? row.categoryPathUrls.map((entry) => String(entry ?? "").trim())
    : [];

  if (
    storedPath.length > 0 &&
    storedPath[0] &&
    storedPath[0] !== UNCATEGORIZED
  ) {
    return {
      path: storedPath,
      urls: storedPath.map((_, index) => storedUrls[index] ?? ""),
      hasRealPath: true,
    };
  }

  return {
    path: [UNCATEGORIZED],
    urls: [""],
    hasRealPath: false,
  };
}

function guessUnit(name: string): string {
  if (/\b(м\/уп|пог\.?\s*м|грн\/м)\b/i.test(name)) return "м";
  return "шт";
}

export function pseudoStock(sku: string, index: number): number {
  let hash = index + 1;
  const key = sku || String(index);
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0;
  }
  return 50 + (Math.abs(hash) % 1950);
}

export { normalizeSku } from "@/lib/search/query";

export function mapParsedToProducts(rows: ParsedProductRow[]): Product[] {
  return rows.map((row, index) => {
    const id = String(index + 1);
    const name = row.name ?? row.title ?? "";
    const sourceUrl = row.url ?? "";
    const brand = normalizeBrandName(row.brand || detectProductBrand(name));
    const sku =
      resolveDisplayArticle({
        article: row.article,
        sku: row.sku,
        brandCode: row.brandCode,
        title: row.title,
        name,
        url: sourceUrl,
        brand,
        siteArticle: row.siteArticle,
      }) || "Без артикула";
    const categoryPathInfo = normalizeCategoryPath(row);
    const categoryPath = categoryPathInfo.path;
    const categoryPathUrls = categoryPathInfo.urls;
    const categoryId = normalizeProductCategory(categoryPath[0]);
    const subcategory =
      categoryPathInfo.hasRealPath && categoryPath.length > 1
        ? categoryPath[categoryPath.length - 1]
        : OTHER_SUBCATEGORY;
    const unit = guessUnit(name);
    const minOrder = unit === "м" ? 100 : 10;
    const agentMatch = getAgentPlusProductMatch({
      ...row,
      name,
      sku,
      url: sourceUrl,
    });
    const agentPrice = toPositiveNumber(row.agentPrice ?? agentMatch?.agentPrice);
    const agentStock = toFiniteNumber(row.agentStock ?? agentMatch?.agentStock);
    const agentUnit = firstString(row.agentUnit, agentMatch?.agentUnit);
    const agentCategoryPath = normalizeAgentCategoryPath(
      row.agentCategoryPath ?? agentMatch?.agentCategoryPath
    );
    const stock = agentStock !== undefined ? Math.max(0, agentStock) : 0;
    const stockStatus =
      agentStock === undefined
        ? "unknown"
        : stock > 0
          ? "in_stock"
          : "preorder";
    const specs: Record<string, string> = {
      Артикул: sku,
      Бренд: brand,
      Категория: categoryId,
      Подкатегория: subcategory,
      "Категория сайта": categoryId,
      "Путь категории": categoryPath.join(" / "),
      Источник: "ultra-svet.com",
    };

    if (categoryPathUrls[0]?.trim()) {
      specs["URL категории"] = categoryPathUrls[0].trim();
    }
    if (categoryPathUrls.at(-1)?.trim()) {
      specs["URL подкатегории"] = categoryPathUrls.at(-1)?.trim() ?? "";
    }

    return {
      id,
      name,
      sku,
      brand,
      categoryId,
      subcategory,
      price: agentPrice ?? getBasePriceFromSitePrice(row.price),
      unit: agentUnit || unit,
      minOrder,
      stock,
      stockStatus,
      agentGuid: firstString(row.agentGuid, agentMatch?.agentGuid) || undefined,
      agentPrice,
      agentStock,
      agentUnit: agentUnit || undefined,
      agentCategoryPath,
      catalogHidden: Boolean(row.catalogHidden),
      image: resolveProductImageUrl(row),
      sourceUrl,
      description: `${name}. ${categoryId} / ${subcategory}`,
      categoryUrl: categoryPathUrls[0],
      subcategoryUrl: categoryPathUrls.at(-1),
      categoryPath,
      categoryPathUrls,
      specs,
      featured: index < 6,
    };
  });
}

function normalizeAgentCategoryPath(input: unknown) {
  if (!Array.isArray(input)) return undefined;
  const path = input.map((item) => String(item ?? "").trim()).filter(Boolean);
  return path.length > 0 ? path : undefined;
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return "";
}

function toPositiveNumber(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return undefined;
  return Math.round((number + Number.EPSILON) * 100) / 100;
}

function toFiniteNumber(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return undefined;
  return number;
}

let cached: Product[] | null = null;
let cachedSignature = "";

export function loadCatalogProducts(): Product[] {
  const signature = getCatalogProductsSignature();
  if (cached && cachedSignature === signature) return cached;

  const file = readParsedFile();
  const rows = file.products ?? [];
  if (rows.length === 0) {
    throw new Error("products.json пуст — выполните npm run parse");
  }

  const products = mapParsedToProducts(rows);
  cached = products;
  cachedSignature = signature;
  return products;
}

export function resetCatalogProductsCache() {
  cached = null;
  cachedSignature = "";
}
