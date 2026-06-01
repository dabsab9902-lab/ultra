interface CategoryCorrection {
  categoryPath: string[];
  categoryPathUrls: string[];
}

const CATEGORY_CORRECTIONS_BY_URL = new Map<string, CategoryCorrection>([
  [
    "https://ultra-svet.com/zvonok-eringerdin220-enext-p0600001",
    {
      categoryPath: [
        "\u041a\u043e\u043c\u0443\u0442\u0430\u0446\u0456\u0439\u043d\u0435 \u043e\u0431\u043b\u0430\u0434\u043d\u0430\u043d\u043d\u044f",
        "\u0414\u0437\u0432\u0456\u043d\u043a\u0438 \u0435\u043b\u0435\u043a\u0442\u0440\u0438\u0447\u043d\u0456",
      ],
      categoryPathUrls: [
        "https://ultra-svet.com/kommutacionnoe-oborudovanie",
        "https://ultra-svet.com/kommutacionnoe-oborudovanie/zvonki-elektricheskie",
      ],
    },
  ],
]);

export function getCategoryCorrection(url?: string): CategoryCorrection | null {
  const normalizedUrl = String(url ?? "").trim();
  if (!normalizedUrl) return null;
  return CATEGORY_CORRECTIONS_BY_URL.get(normalizedUrl) ?? null;
}
