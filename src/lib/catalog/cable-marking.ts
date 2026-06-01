import type { Product } from "@/lib/types";

export const CABLE_MARK_PARAM = "cableMark";

export const CABLE_MARKS = [
  "ВВГ",
  "ПВС",
  "ШВВП",
  "СИП",
  "КГ",
  "ПВ",
  "UTP",
  "FTP",
] as const;

export type CableMark = (typeof CABLE_MARKS)[number];

const CABLE_ROOTS = new Set([
  "кабель та провід",
  "кабель и провод",
  "кабель",
]);

const MARK_PATTERNS: Array<{ mark: CableMark; pattern: RegExp }> = [
  { mark: "ВВГ", pattern: /(?:^|[^A-ZА-ЯІЇЄҐ0-9])ВВГ(?:[A-ZА-ЯІЇЄҐ0-9.-]*)?/iu },
  { mark: "ШВВП", pattern: /(?:^|[^A-ZА-ЯІЇЄҐ0-9])ШВВП(?:[A-ZА-ЯІЇЄҐ0-9.-]*)?/iu },
  { mark: "ПВС", pattern: /(?:^|[^A-ZА-ЯІЇЄҐ0-9])ПВС(?:[A-ZА-ЯІЇЄҐ0-9.-]*)?/iu },
  { mark: "СИП", pattern: /(?:^|[^A-ZА-ЯІЇЄҐ0-9])СИП(?:[A-ZА-ЯІЇЄҐ0-9.-]*)?/iu },
  { mark: "UTP", pattern: /(?:^|[^A-ZА-ЯІЇЄҐ0-9])UTP(?:[A-ZА-ЯІЇЄҐ0-9.-]*)?/iu },
  { mark: "FTP", pattern: /(?:^|[^A-ZА-ЯІЇЄҐ0-9])FTP(?:[A-ZА-ЯІЇЄҐ0-9.-]*)?/iu },
  { mark: "КГ", pattern: /(?:^|[^A-ZА-ЯІЇЄҐ0-9])КГ(?:[A-ZА-ЯІЇЄҐ0-9.-]*)?/iu },
  { mark: "ПВ", pattern: /(?:^|[^A-ZА-ЯІЇЄҐ0-9])ПВ(?:[-\s]?\d+)?(?=$|[^A-ZА-ЯІЇЄҐ0-9])/iu },
];

const cache = new WeakMap<Product, string>();

export function isCableProduct(product: Product) {
  const path = product.categoryPath?.length
    ? product.categoryPath
    : [product.categoryId, product.subcategory].filter(Boolean);
  const root = normalizeText(path[0] ?? "");

  return (
    CABLE_ROOTS.has(root) ||
    (root.includes("кабель") &&
      (root.includes("провід") || root.includes("провод")))
  );
}

export function getCableMarking(product: Product) {
  const cached = cache.get(product);
  if (cached !== undefined) return cached;

  const source = `${product.name} ${product.sku} ${Object.values(product.specs ?? {}).join(" ")}`;
  const mark = MARK_PATTERNS.find((item) => item.pattern.test(source))?.mark ?? "";
  cache.set(product, mark);
  return mark;
}

function normalizeText(value: string) {
  return value
    .toLocaleLowerCase("ru")
    .replace(/ё/g, "е")
    .replace(/[\s_-]+/g, " ")
    .trim();
}
