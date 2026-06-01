const IMAGE_BASE = "https://ultra-svet.com";

/** Путь к локальной заглушке (public/). */
export const PRODUCT_IMAGE_FALLBACK = "/product-fallback.svg";

export function resolveProductImageUrl(
  source: { image?: string; imageUrl?: string } | null | undefined
): string {
  const raw = (source?.image ?? source?.imageUrl ?? "").trim();
  if (!raw) return "";

  let url = raw;
  if (url.startsWith("//")) url = `https:${url}`;
  else if (url.startsWith("/")) url = `${IMAGE_BASE}${url}`;

  if (!isValidProductImageUrl(url)) return "";
  return url;
}

/** Проверка URL изображения (http/https, без javascript/data). */
export function isValidProductImageUrl(url: string): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    return u.hostname.length > 0;
  } catch {
    return false;
  }
}

export function isUltraSvetImage(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "ultra-svet.com" || host.endsWith(".ultra-svet.com");
  } catch {
    return false;
  }
}

export function getProductImageVariant(url: string, size: "list" | "card" | "detail" | "thumb") {
  if (!url || !isUltraSvetImage(url) || size === "detail") return url;

  const targetSize = size === "list" ? "80x80" : "228x228";
  return url.replace(/-\d{2,4}x\d{2,4}(?=\.[a-z0-9]+(?:\?|#|$))/i, `-${targetSize}`);
}
