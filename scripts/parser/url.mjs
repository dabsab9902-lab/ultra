import { BASE_URL, CATEGORY_HINTS, EXCLUDED_SLUGS } from "./config.mjs";

export function normalizeUrl(href, base = BASE_URL) {
  if (!href) return null;
  const raw = String(href).trim();
  if (
    !raw ||
    raw.startsWith("#") ||
    raw.startsWith("javascript:") ||
    raw.startsWith("tel:") ||
    raw.startsWith("mailto:")
  ) {
    return null;
  }

  try {
    const url = new URL(raw, base);
    if (url.origin !== BASE_URL) return null;
    url.hash = "";
    url.searchParams.delete("tracking");
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

export function isExcludedPath(pathname) {
  const parts = pathname.split("/").filter(Boolean);
  const slug = parts[0] || "";
  if (!slug || EXCLUDED_SLUGS.has(slug) || slug.startsWith("ua-")) return true;
  if (/\.(jpg|jpeg|png|webp|svg|gif|pdf|zip)$/i.test(pathname)) return true;
  return false;
}

export function isLikelyCategoryUrl(url) {
  const { pathname, searchParams } = new URL(url);
  const parts = pathname.split("/").filter(Boolean);
  if (isExcludedPath(pathname)) return false;
  if (parts.length !== 1) return false;
  const slug = parts[0].toLowerCase();
  if (isLikelyArticleSlug(slug)) return false;
  if (isLikelyProductSlug(slug)) return false;
  if (searchParams.has("page")) return true;
  return CATEGORY_HINTS.some((hint) => slug.includes(hint));
}

export function isLikelyProductUrl(url) {
  const { pathname, searchParams } = new URL(url);
  const parts = pathname.split("/").filter(Boolean);
  if (isExcludedPath(pathname)) return false;
  if (searchParams.has("page")) return false;
  if (parts.length !== 1) return false;
  const slug = parts[0];
  if (slug.length < 8) return false;
  if (isLikelyArticleSlug(slug)) return false;
  if (isLikelyProductSlug(slug)) return true;
  return !isLikelyCategoryUrl(url);
}

function isLikelyProductSlug(slug) {
  return slug.length >= 20 && /\d/.test(slug);
}

function isLikelyArticleSlug(slug) {
  return [
    "iakyi-",
    "yakyi-",
    "yakij-",
    "kak-",
    "chto-",
    "porivniannia",
    "porivnyannya",
    "sravnenie",
    "obraty",
    "vybrat",
    "povne-",
    "povnoe-",
  ].some((hint) => slug.includes(hint));
}

export function makePaginatedUrls(categoryUrl, pages = 3) {
  const urls = [];
  for (let page = 2; page <= pages; page += 1) {
    const url = new URL(categoryUrl);
    url.searchParams.set("page", String(page));
    urls.push(url.toString().replace(/\/$/, ""));
  }
  return urls;
}
