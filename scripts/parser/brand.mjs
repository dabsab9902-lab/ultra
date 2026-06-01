import { stripHtml } from "./text.mjs";

export const UNKNOWN_BRAND = "Без бренда";

const KNOWN_BRANDS = [
  "Lemanso",
  "Lezard",
  "Lizard",
  "Polax",
  "Галкат",
  "Hager",
  "E.NEXT",
  "ENEXT",
  "ЗЗКМ",
  "Biom",
  "Horoz",
  "Viko",
  "Schneider",
  "IEK",
  "Delux",
  "MAGIO",
  "Стелс",
  "Electro House",
  "LIVOLTEK",
  "Q-MAX",
  "LedEX",
];

export function normalizeBrandName(value) {
  const brand = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!brand) return UNKNOWN_BRAND;

  const known = KNOWN_BRANDS.find(
    (item) => item.toLocaleLowerCase("ru") === brand.toLocaleLowerCase("ru")
  );
  return known || brand;
}

export function detectBrandFromTitle(title) {
  const text = String(title ?? "").trim();
  if (!text) return UNKNOWN_BRAND;

  const quoted = text.match(/"([^"]{2,40})"/)?.[1]?.trim();
  if (quoted) return normalizeBrandName(quoted);

  const upper = text.toLocaleUpperCase("ru");
  for (const brand of KNOWN_BRANDS) {
    if (upper.includes(brand.toLocaleUpperCase("ru"))) {
      return normalizeBrandName(brand);
    }
  }

  return UNKNOWN_BRAND;
}

export function extractBrandFromProductPage($, productLd, title) {
  const ldBrand = readBrandValue(productLd?.brand || productLd?.manufacturer);
  if (ldBrand) return normalizeBrandName(ldBrand);

  const candidates = [];
  $(".rm-product-center-info-item, .product-info li, .list-unstyled li").each(
    (_, el) => {
      const text = stripHtml($(el).text());
      if (/бренд|виробник|производитель|brand|manufacturer/i.test(text)) {
        candidates.push(text);
      }
    }
  );

  for (const text of candidates) {
    const value = text.split(":").slice(1).join(":").trim();
    if (value && value.length <= 80) return normalizeBrandName(value);
  }

  return detectBrandFromTitle(title);
}

function readBrandValue(value) {
  if (!value) return "";
  if (typeof value === "string") return stripHtml(value);
  if (Array.isArray(value)) return readBrandValue(value[0]);
  if (typeof value === "object") {
    return stripHtml(value.name || value.alternateName || value.title || "");
  }
  return "";
}
