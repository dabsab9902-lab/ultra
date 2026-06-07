import { existsSync, readFileSync, statSync } from "fs";
import { join } from "path";

interface AgentPlusProductMatch {
  productUrl?: string;
  productSku?: string;
  productName?: string;
  matchedBy?: string;
  agentGuid?: string;
  agentName?: string;
  agentPrice?: number;
  agentStock?: number;
  agentUnit?: string;
  agentCategoryPath?: string[];
}

interface AgentPlusProductMatchesFile {
  matches: AgentPlusProductMatch[];
}

interface ProductMatchInput {
  agentGuid?: string;
  url?: string;
  sourceUrl?: string;
  article?: string;
  sku?: string;
  brandCode?: string;
  name?: string;
  title?: string;
}

interface AgentPlusMatchIndex {
  signature: string;
  byUrl: Map<string, AgentPlusProductMatch>;
  byGuid: Map<string, AgentPlusProductMatch>;
  bySku: Map<string, AgentPlusProductMatch>;
  byName: Map<string, AgentPlusProductMatch>;
}

const MATCHES_FILE = join(process.cwd(), "data", "agentplus-product-matches.json");

let cachedIndex: AgentPlusMatchIndex | null = null;

export function getAgentPlusProductsSignature() {
  if (!existsSync(MATCHES_FILE)) return "agentplus-products:none";
  const stat = statSync(MATCHES_FILE);
  return `agentplus-products:${stat.mtimeMs}:${stat.size}`;
}

export function getAgentPlusProductMatch(
  product: ProductMatchInput
): AgentPlusProductMatch | null {
  const index = getMatchIndex();
  const guid = firstString(product.agentGuid);
  if (guid) {
    const byGuid = index.byGuid.get(guid.toUpperCase());
    if (byGuid) return byGuid;
  }

  const url = normalizeUrl(firstString(product.url, product.sourceUrl));
  if (url) {
    const byUrl = index.byUrl.get(url);
    if (byUrl) return byUrl;
  }

  for (const sku of [product.article, product.sku, product.brandCode]) {
    const key = normalizeSku(sku);
    if (!key) continue;
    const bySku = index.bySku.get(key);
    if (bySku) return bySku;
  }

  const nameKey = normalizeName(firstString(product.name, product.title));
  return nameKey ? index.byName.get(nameKey) ?? null : null;
}

function getMatchIndex(): AgentPlusMatchIndex {
  const signature = getAgentPlusProductsSignature();
  if (cachedIndex?.signature === signature) return cachedIndex;

  const matches = readMatches();
  const byUrl = new Map<string, AgentPlusProductMatch>();
  const byGuid = new Map<string, AgentPlusProductMatch>();
  const byName = new Map<string, AgentPlusProductMatch>();
  const skuBuckets = new Map<string, AgentPlusProductMatch[]>();

  for (const match of matches) {
    const url = normalizeUrl(match.productUrl);
    if (url) byUrl.set(url, match);

    const guid = firstString(match.agentGuid);
    if (guid) byGuid.set(guid.toUpperCase(), match);

    const sku = normalizeSku(match.productSku);
    if (sku) {
      const bucket = skuBuckets.get(sku) ?? [];
      bucket.push(match);
      skuBuckets.set(sku, bucket);
    }

    const name = normalizeName(match.productName);
    if (name) byName.set(name, match);
  }

  const bySku = new Map<string, AgentPlusProductMatch>();
  for (const [sku, bucket] of skuBuckets) {
    if (bucket.length === 1) bySku.set(sku, bucket[0]);
  }

  cachedIndex = {
    signature,
    byUrl,
    byGuid,
    bySku,
    byName,
  };
  return cachedIndex;
}

function readMatches() {
  try {
    if (!existsSync(MATCHES_FILE)) return [];
    const parsed = JSON.parse(
      readFileSync(MATCHES_FILE, "utf-8")
    ) as Partial<AgentPlusProductMatchesFile>;
    return Array.isArray(parsed.matches) ? parsed.matches : [];
  } catch {
    return [];
  }
}

function normalizeUrl(value: unknown) {
  const url = firstString(value);
  if (!url) return "";
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    return parsed.toString().toLocaleLowerCase("en");
  } catch {
    return url.toLocaleLowerCase("en");
  }
}

function normalizeSku(value: unknown) {
  return firstString(value)
    .toLocaleUpperCase("en")
    .replace(/[\s"'`]+/g, "")
    .replace(/[()]+/g, "")
    .trim();
}

function normalizeName(value: unknown) {
  return firstString(value)
    .toLocaleLowerCase("uk")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, "");
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return "";
}
