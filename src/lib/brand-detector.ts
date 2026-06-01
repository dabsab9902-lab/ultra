const KNOWN_BRANDS = [
  "Lemanso",
  "Lezard",
  "Lizard",
  "Polax",
  "Галкат",
  "Hager",
  "E.NEXT",
  "ЗЗКМ",
  "Biom",
  "Horoz",
  "Viko",
  "Schneider",
  "IEK",
  "Delux",
];

export function detectProductBrand(input: string) {
  const text = input.trim();
  if (!text) return "Без бренда";

  const quoted = text.match(/"([^"]{2,40})"/)?.[1]?.trim();
  if (quoted) return normalizeBrandName(quoted);

  const upper = text.toLocaleUpperCase("ru");
  for (const brand of KNOWN_BRANDS) {
    if (upper.includes(brand.toLocaleUpperCase("ru"))) {
      return normalizeBrandName(brand);
    }
  }

  return "Без бренда";
}

export function normalizeBrandName(value: string) {
  const brand = value.trim().replace(/\s+/g, " ");
  const known = KNOWN_BRANDS.find(
    (item) => item.toLocaleLowerCase("ru") === brand.toLocaleLowerCase("ru")
  );
  if (known) return known;
  return brand || "Без бренда";
}

export function normalizeBrandKey(value: string) {
  return normalizeBrandName(value).toLocaleLowerCase("ru");
}
