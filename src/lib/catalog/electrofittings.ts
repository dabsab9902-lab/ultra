import type { Product } from "@/lib/types";

export const ELECTRO_SERIES_PARAM = "series";
export const ELECTRO_DESIGN_PARAM = "design";
export const ELECTRO_PRODUCT_TYPE_PARAM = "productType";

export interface ElectroFittingSpecs {
  series: string;
  design: string;
  productType: string;
}

const SERIES_KEY_PATTERN =
  /(?:сер[іи]я|series|колекц|коллекц|л[іи]н[іи]йк)/i;

const SERIES_EXCLUDED = new Set([
  "ip",
  "usb",
  "tv",
  "utp",
  "hdmi",
  "v",
  "a",
  "ma",
  "led",
  "schneider",
  "lezard",
  "lemanso",
  "lider",
  "electro",
  "house",
]);

const DESIGN_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "Перлинно-білий металік", pattern: /перлинно[-\s]?білий\s+метал[іi]к/i },
  { label: "Темно-сірий металік", pattern: /темно[-\s]?с[іi]рий\s+метал[іi]к/i },
  { label: "Сірий металік", pattern: /с[іi]рий\s+метал[іi]к/i },
  { label: "Серый металлик", pattern: /серый\s+металл?ик/i },
  { label: "Дуб вибілений матовий", pattern: /дуб\s+виб[іi]лений\s+матовий/i },
  { label: "Дуб класичний матовий", pattern: /дуб\s+класичний\s+матовий/i },
  { label: "Білий з хромом", pattern: /б[іi]л[аийе]+\s+з\s+(?:боковою|бічною)\s+вставкою\s+хром/i },
  { label: "Білий з золотом", pattern: /б[іi]л[аийе]+\s+з\s+(?:боковою|бічною)\s+вставкою\s+золото/i },
  { label: "Перламутр", pattern: /перламутр|перламутров/i },
  { label: "Антрацит", pattern: /антрацит/i },
  { label: "Алюміній", pattern: /алюм[іи]н[іи]й/i },
  { label: "Бронза", pattern: /бронз/i },
  { label: "Вишня", pattern: /вишн/i },
  { label: "Графіт", pattern: /граф[іи]т/i },
  { label: "Золото", pattern: /золото|золот/i },
  { label: "Крем", pattern: /крем/i },
  { label: "Сталь", pattern: /сталь/i },
  { label: "Хром", pattern: /хром/i },
  { label: "Білий", pattern: /б[іi]л[аийе]+|бел[аыйое]+/i },
  { label: "Чорний", pattern: /чорн[аийе]+|черн[аыйое]+/i },
  { label: "Сірий", pattern: /с[іi]р[аийе]+|сер[аыйое]+/i },
];

const cache = new WeakMap<Product, ElectroFittingSpecs>();

export function isElectroFittingProduct(product: Product) {
  const pathText = normalizeText(
    [product.categoryId, product.subcategory, product.categoryPath?.join(" ")]
      .filter(Boolean)
      .join(" ")
  );

  return (
    pathText.includes("електро фурнітура") ||
    pathText.includes("электро фурнитура") ||
    pathText.includes("розетки та вмикачі")
  );
}

export function getElectroFittingSpecs(product: Product): ElectroFittingSpecs {
  const cached = cache.get(product);
  if (cached) return cached;

  const specs: ElectroFittingSpecs = {
    series: extractSeries(product),
    design: extractDesign(product),
    productType: extractProductType(product),
  };
  cache.set(product, specs);
  return specs;
}

function extractSeries(product: Product) {
  const fromSpec = findSpecByKey(product, SERIES_KEY_PATTERN);
  if (fromSpec) return cleanupSeries(fromSpec, product);

  const fromQuoted = extractSeriesFromQuotedBrand(product);
  if (fromQuoted) return fromQuoted;

  const fromBrandTail = extractSeriesAfterBrand(product);
  if (fromBrandTail) return fromBrandTail;

  const skuPrefix = product.sku.match(/^([A-Za-zА-Яа-яІіЇїЄє]{3,18})(?=[\s.-])/u)?.[1];
  if (skuPrefix && product.name.toLocaleLowerCase("ru").includes(skuPrefix.toLocaleLowerCase("ru"))) {
    return cleanupSeries(skuPrefix, product);
  }

  return "";
}

function extractDesign(product: Product) {
  const source = `${product.name} ${Object.values(product.specs ?? {}).join(" ")}`;
  const match = DESIGN_PATTERNS.find((item) => item.pattern.test(source));
  return match?.label ?? "";
}

function extractProductType(product: Product) {
  const text = normalizeText(
    `${product.name} ${Object.values(product.specs ?? {}).join(" ")}`
  );
  if (text.includes("рамк")) return "Рамки";
  if (
    text.includes("механизм") ||
    text.includes("механізм") ||
    text.includes("кнопк") ||
    text.includes("диммер") ||
    text.includes("регулятор")
  ) {
    return "Механизмы";
  }
  if (text.includes("блок") && text.includes("розет") && text.includes("вимика")) {
    return "Блоки розетка + выключатель";
  }
  if (text.includes("розет")) return "Розетки";
  if (text.includes("вимика") || text.includes("выключ") || text.includes("перемика")) {
    return "Выключатели";
  }
  return "";
}

function extractSeriesFromQuotedBrand(product: Product) {
  const quoted = Array.from(product.name.matchAll(/["«]([^"»]{2,80})["»]/g));
  for (const match of quoted) {
    const value = cleanupSeries(removeBrandWords(match[1] ?? "", product.brand), product);
    if (value) return value;
  }
  return "";
}

function extractSeriesAfterBrand(product: Product) {
  const brandWords = product.brand
    .split(/\s+/)
    .map((word) => escapeRegExp(word.trim()))
    .filter(Boolean);
  if (brandWords.length === 0) return "";

  const brandPattern = brandWords.join("\\s+");
  const match = product.name.match(
    new RegExp(`${brandPattern}\\s+([\\p{L}][\\p{L}\\p{N}.-]{1,22})`, "iu")
  );

  return match?.[1] ? cleanupSeries(match[1], product) : "";
}

function findSpecByKey(product: Product, pattern: RegExp) {
  for (const [key, value] of Object.entries(product.specs ?? {})) {
    if (pattern.test(key) && String(value).trim()) return String(value).trim();
  }
  return "";
}

function cleanupSeries(value: string, product: Product) {
  const raw = value
    .replace(/["'«»]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!raw) return "";

  const compact = normalizeText(raw).replace(/[^a-zа-яіїє0-9]/g, "");
  const brandCompact = normalizeText(product.brand).replace(/[^a-zа-яіїє0-9]/g, "");
  const skuCompact = normalizeText(product.sku).replace(/[^a-zа-яіїє0-9]/g, "");

  if (compact.length < 2 || compact.length > 24) return "";
  if (/^\d+$/.test(compact)) return "";
  if (SERIES_EXCLUDED.has(compact)) return "";
  if (brandCompact && (compact === brandCompact || brandCompact.includes(compact))) {
    return "";
  }
  if (skuCompact && (compact === skuCompact || skuCompact.includes(compact))) {
    return "";
  }
  if (/\b(?:розетка|рамка|вимикач|выключатель|вилка|блок|зовнішній|внутрішній)\b/i.test(raw)) {
    return "";
  }

  return formatSeries(raw);
}

function removeBrandWords(value: string, brand: string) {
  const brandWords = brand.split(/\s+/).filter(Boolean);
  return brandWords
    .reduce(
      (current, word) =>
        current.replace(new RegExp(`\\b${escapeRegExp(word)}\\b`, "gi"), " "),
      value
    )
    .replace(/\s+/g, " ")
    .trim();
}

function formatSeries(value: string) {
  const raw = value.trim();
  if (/^[A-ZА-ЯІЇЄ0-9.-]+$/.test(raw)) return raw;
  return raw
    .split(/\s+/)
    .map((part) =>
      part.length <= 3 && /^[a-zа-яіїє]+$/i.test(part)
        ? part.toUpperCase()
        : part.charAt(0).toLocaleUpperCase("ru") + part.slice(1)
    )
    .join(" ");
}

function normalizeText(value: string) {
  return value
    .toLocaleLowerCase("ru")
    .replace(/ё/g, "е")
    .replace(/[\s_-]+/g, " ")
    .trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
