export function stripHtml(text) {
  return (text || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function parsePrice(text) {
  if (!text) return 0;
  const normalized = String(text)
    .replace(/\s/g, "")
    .replace(/[^\d,.]/g, "")
    .replace(",", ".");
  const match = normalized.match(/\d+(?:\.\d+)?/);
  return match ? Math.round(Number(match[0]) * 100) / 100 : 0;
}
