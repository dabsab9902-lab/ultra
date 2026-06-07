import { normalizeSearchQuery } from "@/lib/search/query";

const SEARCH_SYNONYM_GROUPS = [
  ["топор", "сокира"],
  ["выключатель", "вимикач"],
  ["удлинитель", "подовжувач"],
  ["розетка"],
  ["изолента", "ізолента"],
  ["отвертка", "викрутка"],
  ["плоскогубцы", "плоскогубці"],
  ["кусачки"],
  ["лампа"],
  ["светильник", "світильник"],
  ["прожектор"],
  ["щиток"],
  ["кабель канал", "кабель-канал"],
  ["гофра"],
  ["автомат"],
  ["узо", "пзв"],
] as const;

const MAX_QUERY_VARIANTS = 24;
const SYNONYM_MAP = buildSynonymMap();

export function expandSearchQuery(query: string): string[] {
  const raw = normalizeQueryVariant(query);
  if (!raw) return [];

  const canonical = normalizeSynonymText(raw);
  const variants = new Set<string>();
  addVariant(variants, raw);
  addVariant(variants, canonical);

  const inputs = new Set([raw, canonical]);

  for (const input of inputs) {
    for (const synonym of SYNONYM_MAP.get(input) ?? []) {
      addVariant(variants, synonym);
    }
  }

  // Prefix support keeps partial searches useful: "выкл" can still find "вимикач".
  if (canonical.length >= 3) {
    for (const [term, synonyms] of SYNONYM_MAP) {
      if (!term.startsWith(canonical)) continue;
      addVariant(variants, term);
      for (const synonym of synonyms) addVariant(variants, synonym);
    }
  }

  for (const input of inputs) {
    for (const [term, synonyms] of SYNONYM_MAP) {
      if (!containsTerm(input, term)) continue;
      for (const synonym of synonyms) {
        addVariant(variants, replaceTerm(input, term, synonym));
      }
    }
  }

  return Array.from(variants).slice(0, MAX_QUERY_VARIANTS);
}

export function normalizeSynonymText(value: string): string {
  return normalizeQueryVariant(
    value
      .replace(/[‐‑‒–—−-]+/g, " ")
      .replace(/[._/]+/g, " ")
  );
}

function buildSynonymMap() {
  const map = new Map<string, Set<string>>();

  for (const group of SEARCH_SYNONYM_GROUPS) {
    const forms = unique(group.flatMap(getTermForms));

    for (const form of forms) {
      const synonyms = map.get(form) ?? new Set<string>();
      for (const other of forms) {
        if (other !== form) synonyms.add(other);
      }
      map.set(form, synonyms);
    }
  }

  return new Map(
    Array.from(map.entries()).map(([term, synonyms]) => [
      term,
      Array.from(synonyms),
    ])
  );
}

function getTermForms(term: string) {
  return unique([normalizeQueryVariant(term), normalizeSynonymText(term)]).filter(
    Boolean
  );
}

function normalizeQueryVariant(value: string): string {
  return normalizeSearchQuery(value).toLocaleLowerCase("ru");
}

function addVariant(variants: Set<string>, value: string) {
  const normalized = normalizeQueryVariant(value);
  if (normalized) variants.add(normalized);
}

function containsTerm(value: string, term: string) {
  return ` ${value} `.includes(` ${term} `);
}

function replaceTerm(value: string, term: string, synonym: string) {
  const pattern = new RegExp(`(^|\\s)${escapeRegExp(term)}(?=\\s|$)`, "g");
  return value.replace(pattern, `$1${synonym}`);
}

function unique(values: readonly string[]) {
  return Array.from(new Set(values));
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
