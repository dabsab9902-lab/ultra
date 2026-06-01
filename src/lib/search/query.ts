/** Нормализация артикула: без пробелов, точек, дефисов; нижний регистр. */
export function normalizeSku(value: string): string {
  return value.toLowerCase().replace(/[\s._\-/]/g, "");
}

export function normalizeSearchQuery(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

/** Запрос похож на артикул (без пробелов, буквы/цифры). */
export function isSkuLikeQuery(query: string): boolean {
  const t = normalizeSearchQuery(query);
  if (t.length < 2 || /\s/.test(t)) return false;
  return /^[A-Za-zА-Яа-яІіЇїЄєҐґ0-9.\-_/]+$/.test(t);
}

const TOKEN_RE = /[a-z0-9а-яіїєґ]{2,}/gi;

export function tokenizeText(text: string): string[] {
  const tokens = text.toLowerCase().match(TOKEN_RE) ?? [];
  return [...new Set(tokens)];
}

export function tokenizeQuery(query: string): string[] {
  return tokenizeText(normalizeSearchQuery(query));
}

export function searchDelayMs(query: string): number {
  return isSkuLikeQuery(query) ? 0 : 180;
}
