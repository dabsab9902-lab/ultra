import type { Product } from "@/lib/types";

const SERIES = "\u0421\u0435\u0440\u0438\u044f";
const POLES = "\u041f\u043e\u043b\u044e\u0441\u044b";
const CURRENT = "\u041d\u043e\u043c\u0438\u043d\u0430\u043b\u044c\u043d\u044b\u0439 \u0442\u043e\u043a";
const CURVE = "\u0425\u0430\u0440\u0430\u043a\u0442\u0435\u0440\u0438\u0441\u0442\u0438\u043a\u0430";
const BREAKING_CAPACITY =
  "\u041e\u0442\u043a\u043b\u044e\u0447\u0430\u044e\u0449\u0430\u044f \u0441\u043f\u043e\u0441\u043e\u0431\u043d\u043e\u0441\u0442\u044c";

export const ELECTRICAL_FILTER_KEYS = [
  SERIES,
  POLES,
  CURRENT,
  CURVE,
  BREAKING_CAPACITY,
] as const;

const LETTERS = "A-Za-z\\u0410-\\u042f\\u0430-\\u044f\\u0406\\u0456\\u0407\\u0457\\u0404\\u0454";

const EXCLUDED_SERIES = new Set([
  "AC",
  "AUX",
  "DC",
  "DIN",
  "ELECTRIC",
  "ELECTRIK",
  "IP",
  "KA",
  "LED",
  "MCB",
  "MCCB",
  "NO",
  "NC",
  "RCBO",
  "RCCB",
  "NEXT",
  "SHT",
  "UAH",
  "URL",
  "V",
  "VA",
  "W",
]);

const EXCLUDED_CURVES = new Set([
  "AC",
  "DC",
  "DIN",
  "IP",
  "KA",
  "KV",
  "KVA",
  "KW",
  "LED",
  "LM",
  "MA",
  "MCB",
  "MCCB",
  "MM",
  "RCBO",
  "RCCB",
  "V",
  "VA",
  "W",
]);

const cache = new WeakMap<Product, Record<string, string>>();
const seriesKeyPattern = /(?:\u0441\u0435\u0440|series|\u043b\u0438\u043d\u0435\u0439\u043a|\u043b\u0456\u043d\u0456\u0439\u043a)/i;
const curveKeyPattern = /(?:\u0445\u0430\u0440\u0430\u043a\u0442\u0435\u0440|\u043a\u0440\u0438\u0432|curve)/i;

export function getProductSpecValue(product: Product, key: string) {
  const direct = product.specs?.[key];
  if (direct && String(direct).trim()) return String(direct).trim();
  return getElectricalSpecs(product)[key];
}

export function getElectricalSpecs(product: Product): Record<string, string> {
  const cached = cache.get(product);
  if (cached) return cached;

  const source = buildSearchSource(product);
  const specs: Record<string, string> = {};
  const series = extractSeries(product, source);
  const poles = extractPoles(source);
  const current = extractCurrent(source);
  const curve = extractCurve(source, current);
  const breakingCapacity = extractBreakingCapacity(source);

  if (series) specs[SERIES] = series;
  if (poles) specs[POLES] = poles;
  if (current) specs[CURRENT] = current;
  if (curve) specs[CURVE] = curve;
  if (breakingCapacity) specs[BREAKING_CAPACITY] = breakingCapacity;

  cache.set(product, specs);
  return specs;
}

function buildSearchSource(product: Product) {
  const specsText = Object.entries(product.specs ?? {})
    .map(([key, value]) => `${key}: ${value}`)
    .join(" ");

  return [
    product.name,
    product.sku,
    product.brand,
    product.categoryId,
    product.subcategory,
    product.categoryPath?.join(" "),
    specsText,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractSeries(product: Product, source: string) {
  const fromSpec = findSpecByKey(product, seriesKeyPattern);
  if (fromSpec) return cleanupSeries(fromSpec, product);

  const dotMatch = source.match(
    /\b(?:[a-z]\.)?(?:mcb|rcbo|rccb|mccb|elcb)\.([a-z0-9-]{2,18})/i
  );
  if (dotMatch?.[1]) return cleanupSeries(dotMatch[1], product);

  const tokenMatches = source.matchAll(
    /\b([A-Z][a-z]+[0-9][A-Za-z0-9-]*|[a-z][A-Z][A-Za-z]*[0-9][A-Za-z0-9-]*|[A-Z]{2,12})\b/g
  );

  for (const match of tokenMatches) {
    const series = cleanupSeries(match[1], product);
    if (series) return series;
  }

  return "";
}

function extractPoles(source: string) {
  const withNeutral = source.match(
    /(^|[^\p{L}\p{N}])([1-4])\s*(?:p|\u0440|\u043f)\s*\+\s*n(?![\p{L}\p{N}])/iu
  );
  if (withNeutral?.[2]) return `${withNeutral[2]}P+N`;

  const short = source.match(
    /(^|[^\p{L}\p{N}])([1-4])\s*(?:p|\u0440|\u043f)(?![\p{L}\p{N}])/iu
  );
  if (short?.[2]) return `${short[2]}P`;

  const words = source.match(
    /(^|[^\p{L}\p{N}])([1-4])\s*\u043f\u043e\u043b\u044e\u0441[\u0430-\u044f\u0456\u0457\u0454]*(?![\p{L}\p{N}])/iu
  );
  if (words?.[2]) return `${words[2]}P`;

  return "";
}

function extractCurrent(source: string) {
  const matches = Array.from(
    source.matchAll(/(^|[^\p{L}\p{N}])(\d{1,4}(?:[.,]\d+)?)\s*(?:a|\u0430|\u0410|\u0430\u043c\u043f\u0435\u0440[\u0430-\u044f\u0456\u0457\u0454]*)(?![\p{L}\p{N}])/giu)
  );
  const current = matches.find((match) => {
    const before = source.slice(Math.max(0, (match.index ?? 0) - 2), match.index);
    return !/m\s*$/i.test(before);
  })?.[2];

  return current ? `${normalizeNumber(current)}A` : "";
}

function extractCurve(source: string, current: string) {
  const fromSpec = findSpecByKey(source, curveKeyPattern);
  const specCurve = normalizeCurve(fromSpec);
  if (specCurve) return specCurve;

  const withAmpere = Array.from(
    source.matchAll(
      new RegExp(
        `(^|[^\\p{L}\\p{N}])([${LETTERS}]{1,4})\\s*[- ]?\\s*\\d{1,4}(?:[.,]\\d+)?\\s*(?:a|\\u0430|\\u0410)(?![\\p{L}\\p{N}])`,
        "gu"
      )
    )
  )
    .map((match) => normalizeCurve(match[2] ?? match[1]))
    .find(Boolean);
  if (withAmpere) return withAmpere;

  const currentNumber = current.replace(/[^\d.,]/g, "");
  if (!currentNumber) return "";

  const compact = Array.from(
    source.matchAll(
      new RegExp(`(?:^|[.\\s(/-])([${LETTERS}]{1,4})\\s*(\\d{1,4})(?=$|[.,;\\s)/-])`, "g")
    )
  ).find((match) => {
    const curve = normalizeCurve(match[1]);
    return curve && normalizeNumber(match[2]) === normalizeNumber(currentNumber);
  });

  return compact ? normalizeCurve(compact[1]) : "";
}

function extractBreakingCapacity(source: string) {
  const match = source.match(/(^|[^\p{L}\p{N}])(\d{1,3}(?:[.,]\d+)?)\s*(?:ka|\u043aA|\u043a\u0410|\u043a\u0430)(?![\p{L}\p{N}])/iu);
  return match?.[2] ? `${normalizeNumber(match[2])} \u043a\u0410` : "";
}

function findSpecByKey(
  productOrSource: Product | string,
  pattern: RegExp
): string {
  if (typeof productOrSource === "string") {
    const source = productOrSource;
    const match = source.match(
      new RegExp(`(?:${pattern.source})\\s*[:=-]?\\s*([^,;|/]{1,40})`, "i")
    );
    return match?.[1]?.trim() ?? "";
  }

  for (const [key, value] of Object.entries(productOrSource.specs ?? {})) {
    if (pattern.test(key) && String(value).trim()) return String(value).trim();
  }

  return "";
}

function cleanupSeries(value: string, product: Product) {
  const raw = value.replace(/^[\"'\u00ab\u00bb]+|[\"'\u00ab\u00bb]+$/g, "").trim();
  if (!raw) return "";

  const normalized = raw.toUpperCase();
  const brand = product.brand.toUpperCase().replace(/[^A-Z\u0410-\u042f\u0406\u0407\u04040-9]/g, "");
  const sku = product.sku.toUpperCase().replace(/[^A-Z\u0410-\u042f\u0406\u0407\u04040-9]/g, "");
  const compact = normalized.replace(/[^A-Z\u0410-\u042f\u0406\u0407\u04040-9]/g, "");

  if (EXCLUDED_SERIES.has(compact)) return "";
  if (compact.length < 2 || compact.length > 18) return "";
  if (brand && (compact === brand || brand.startsWith(compact))) return "";
  if (sku && (compact === sku || sku.includes(compact))) return "";
  if (/^\d+$/.test(compact)) return "";

  return raw.length <= 4 ? raw.toUpperCase() : capitalizeMixed(raw);
}

function normalizeCurve(value?: string) {
  const curve = String(value ?? "")
    .replace(new RegExp(`[^${LETTERS}]`, "g"), "")
    .trim()
    .toUpperCase();

  if (!curve || curve.length > 4 || EXCLUDED_CURVES.has(curve)) return "";
  return curve;
}

function normalizeNumber(value: string) {
  const normalized = value.replace(",", ".");
  const numeric = Number(normalized);
  if (!Number.isFinite(numeric)) return value.replace(".", ",");
  return Number.isInteger(numeric)
    ? String(numeric)
    : String(Number(numeric.toFixed(2))).replace(".", ",");
}

function capitalizeMixed(value: string) {
  if (/^[A-Z0-9-]+$/.test(value)) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}
