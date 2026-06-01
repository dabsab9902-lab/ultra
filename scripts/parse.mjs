import { existsSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { scrapeProducts, BASE_URL, createLogger } from "./parser/index.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_FILE = join(__dirname, "..", "products.json");

const DEFAULT_LIMIT = 8000;
const DEFAULT_DELAY = 350;
const DEFAULT_CONCURRENCY = 4;

function readNumberArg(name, fallback) {
  const envName = `PARSE_${name.toUpperCase()}`;
  let value = Number(process.env[envName]) || fallback;
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith(`--${name}=`)) {
      value = Number(arg.split("=")[1]) || value;
    }
  }
  return value;
}

function parseArgs() {
  return {
    limit: Math.max(1, Math.min(readNumberArg("limit", DEFAULT_LIMIT), 10000)),
    delay: Math.max(100, readNumberArg("delay", DEFAULT_DELAY)),
    concurrency: Math.max(
      1,
      Math.min(readNumberArg("concurrency", DEFAULT_CONCURRENCY), 8)
    ),
  };
}

function readExistingProducts() {
  if (!existsSync(OUT_FILE)) return [];

  try {
    const parsed = JSON.parse(readFileSync(OUT_FILE, "utf-8"));
    return Array.isArray(parsed?.products) ? parsed.products : [];
  } catch {
    return [];
  }
}

function normalizeKey(value) {
  return String(value ?? "").trim().toLowerCase();
}

function hasRealBrand(value) {
  const brand = String(value ?? "").trim();
  return brand && brand !== "Без бренда";
}

function productKeys(item) {
  return {
    article: normalizeKey(item.siteArticle || item.sourceArticle || item.article || item.sku),
    url: normalizeKey(item.url),
  };
}

function productKeySets(products) {
  const articles = new Set();
  const urls = new Set();

  for (const product of products) {
    const keys = productKeys(product);
    if (keys.article) articles.add(keys.article);
    if (keys.url) urls.add(keys.url);
  }

  return { articles, urls };
}

function normalizeParsedProduct(item) {
  return {
    ...item,
    title: item.title || item.name || "",
    article: item.article || item.sku || "",
    siteArticle: String(item.siteArticle || item.sourceArticle || "").trim(),
    brandCode: String(item.brandCode || "").trim(),
    image: item.image || item.imageUrl || "",
    category: String(item.category || "").trim() || "Без категории",
    subcategory: String(item.subcategory || "").trim() || "Другое",
    categoryUrl: String(item.categoryUrl || "").trim(),
    subcategoryUrl: String(item.subcategoryUrl || "").trim(),
    categoryPath: Array.isArray(item.categoryPath) ? item.categoryPath : [],
    categoryPathUrls: Array.isArray(item.categoryPathUrls) ? item.categoryPathUrls : [],
    breadcrumbs: Array.isArray(item.breadcrumbs) ? item.breadcrumbs : [],
    brand: String(item.brand || "").trim(),
    price: Number(item.price) || 0,
    url: item.url || "",
    name: item.name || item.title || "",
    sku: item.sku || item.article || "",
    imageUrl: item.imageUrl || item.image || "",
  };
}

function mergeCategoryMetadata(existing, parsed) {
  return {
    ...existing,
    category: parsed.category || "Без категории",
    subcategory: parsed.subcategory || "Другое",
    categoryUrl: parsed.categoryUrl || existing.categoryUrl || "",
    subcategoryUrl: parsed.subcategoryUrl || existing.subcategoryUrl || "",
    categoryPath: parsed.categoryPath?.length ? parsed.categoryPath : existing.categoryPath,
    categoryPathUrls: parsed.categoryPathUrls?.length
      ? parsed.categoryPathUrls
      : existing.categoryPathUrls,
    breadcrumbs: parsed.breadcrumbs?.length ? parsed.breadcrumbs : existing.breadcrumbs,
    siteArticle: parsed.siteArticle || existing.siteArticle || "",
    brandCode: parsed.brandCode || existing.brandCode || "",
    article: parsed.article || existing.article || "",
    sku: parsed.sku || parsed.article || existing.sku || existing.article || "",
    brand: hasRealBrand(parsed.brand)
      ? parsed.brand
      : existing.brand || parsed.brand || "",
  };
}

function mergeProducts(existingProducts, parsedProducts, targetLimit) {
  const seenArticles = new Set();
  const seenUrls = new Set();
  const articleToIndex = new Map();
  const urlToIndex = new Map();
  const merged = [];
  let skippedExistingDuplicates = 0;
  let skippedParsedDuplicates = 0;

  for (const product of existingProducts) {
    const keys = productKeys(product);
    if (
      (keys.article && seenArticles.has(keys.article)) ||
      (keys.url && seenUrls.has(keys.url))
    ) {
      skippedExistingDuplicates += 1;
      continue;
    }

    if (keys.article) seenArticles.add(keys.article);
    if (keys.url) seenUrls.add(keys.url);
    if (keys.article) articleToIndex.set(keys.article, merged.length);
    if (keys.url) urlToIndex.set(keys.url, merged.length);
    merged.push(product);
  }

  let added = 0;
  for (const rawProduct of parsedProducts) {
    const product = normalizeParsedProduct(rawProduct);
    const keys = productKeys(product);
    const existingIndex =
      (keys.article ? articleToIndex.get(keys.article) : undefined) ??
      (keys.url ? urlToIndex.get(keys.url) : undefined);

    if (existingIndex !== undefined) {
      merged[existingIndex] = mergeCategoryMetadata(
        merged[existingIndex],
        product
      );
      skippedParsedDuplicates += 1;
      continue;
    }

    if (merged.length >= targetLimit) break;

    if (keys.article) seenArticles.add(keys.article);
    if (keys.url) seenUrls.add(keys.url);
    if (keys.article) articleToIndex.set(keys.article, merged.length);
    if (keys.url) urlToIndex.set(keys.url, merged.length);
    merged.push(product);
    added += 1;
  }

  return {
    products: merged.slice(0, targetLimit),
    added,
    skippedDuplicates: skippedExistingDuplicates + skippedParsedDuplicates,
    skippedExistingDuplicates,
    skippedParsedDuplicates,
  };
}

function createPayload({
  limit,
  delay,
  concurrency,
  existingProducts,
  merged,
  scanned = 0,
  candidates = 0,
  found = 0,
  skippedKnownUrls = 0,
}) {
  return {
    source: "ultra-svet.com",
    generatedAt: new Date().toISOString(),
    limit,
    delayMs: delay,
    concurrency,
    total: merged.products.length,
    existingTotal: existingProducts.length,
    scanned,
    candidates,
    found,
    skippedKnownUrls,
    added: merged.added,
    skippedDuplicates: merged.skippedDuplicates,
    skippedExistingDuplicates: merged.skippedExistingDuplicates,
    skippedParsedDuplicates: merged.skippedParsedDuplicates,
    products: merged.products,
  };
}

function writePayload(payload) {
  writeFileSync(OUT_FILE, JSON.stringify(payload, null, 2), "utf-8");
}

function logSummary({
  existingProducts,
  merged,
  seconds,
  scanned = 0,
  candidates = 0,
  found = 0,
  skippedKnownUrls = 0,
}) {
  console.log(
    [
      `Saved ${merged.products.length} products to ${OUT_FILE} in ${seconds}s.`,
      `Scanned ${scanned}/${candidates}.`,
      `Found ${found}.`,
      `Skipped known URLs before parse ${skippedKnownUrls}.`,
      `Added ${merged.added}.`,
      `Skipped duplicates ${merged.skippedDuplicates}`,
      `(existing ${merged.skippedExistingDuplicates}, imported ${merged.skippedParsedDuplicates}).`,
    ].join(" ")
  );
  console.log(`Всего было: ${existingProducts.length}`);
  console.log(`Найдено новых: ${merged.added}`);
  console.log(`Пропущено дублей: ${merged.skippedDuplicates}`);
  console.log(`Стало всего: ${merged.products.length}`);
  console.log(`Total before: ${existingProducts.length}`);
  console.log(`Added: ${merged.added}`);
  console.log(`Skipped duplicates: ${merged.skippedDuplicates}`);
  console.log(`Skipped known URLs before parse: ${skippedKnownUrls}`);
  console.log(`Total after: ${merged.products.length}`);
}

let scanLogCounter = 0;

function logProgress(event) {
  if (event.type === "scan") {
    scanLogCounter += 1;
    const newProducts = Number(event.newProducts) || 0;
    if (
      scanLogCounter % 25 !== 0 &&
      !(newProducts > 0 && newProducts % 250 === 0)
    ) {
      return;
    }
    console.log(
      `scan ${event.products} products (${newProducts} new), queue ${event.queued}: ${event.url.replace(
        BASE_URL,
        ""
      )}`
    );
    return;
  }
  if (event.type === "ok") {
    if (event.index % 10 !== 0 && event.index !== event.limit) return;
    console.log(
      `[${event.index}/${event.limit}] ${event.item.article} | ${event.item.price} | ${event.item.url.replace(
        BASE_URL,
        ""
      )}`
    );
    return;
  }
  if (event.type === "skip") {
    console.log(`skip: ${event.reason} | ${event.url.replace(BASE_URL, "")}`);
    return;
  }
  if (event.type === "error" || event.type === "scan-error") {
    console.log(`error: ${event.message} | ${event.url.replace(BASE_URL, "")}`);
  }
}

async function main() {
  const { limit, delay, concurrency } = parseArgs();
  const existingProducts = readExistingProducts();
  const targetLimit = Math.max(limit, existingProducts.length);

  console.log(`Importing products from ${BASE_URL}`);
  console.log(
    `limit=${targetLimit}, delay=${delay}ms, concurrency=${concurrency}, output=products.json`
  );
  if (targetLimit !== limit) {
    console.log(
      `requested=${limit}; keeping target=${targetLimit} to avoid shrinking existing products.json`
    );
  }
  console.log(`existing=${existingProducts.length}, target=${targetLimit}`);

  const startedAt = Date.now();
  const existingOnly = mergeProducts(existingProducts, [], targetLimit);
  if (existingOnly.products.length >= targetLimit) {
    writePayload(
      createPayload({
        limit: targetLimit,
        delay,
        concurrency,
        existingProducts,
        merged: existingOnly,
      })
    );

    const seconds = Math.round((Date.now() - startedAt) / 1000);
    console.log(
      `Target already reached with ${existingOnly.products.length} unique products. Skipping network import.`
    );
    logSummary({
      existingProducts,
      merged: existingOnly,
      seconds,
    });
    return;
  }

  const needed = Math.max(1, targetLimit - existingOnly.products.length);
  const known = productKeySets(existingOnly.products);

  console.log(`need=${needed}, knownUrls=${known.urls.size}, knownArticles=${known.articles.size}`);

  const { products, scanned, candidates, skippedKnownUrls } = await scrapeProducts({
    limit: targetLimit,
    newLimit: needed,
    delay,
    concurrency,
    skipUrls: known.urls,
    skipArticles: known.articles,
    logger: createLogger(),
    onProgress: logProgress,
  });

  const merged = mergeProducts(existingProducts, products, targetLimit);
  const payload = createPayload({
    limit: targetLimit,
    delay,
    concurrency,
    existingProducts,
    merged,
    scanned,
    candidates,
    found: products.length,
    skippedKnownUrls,
  });

  writePayload(payload);

  const seconds = Math.round((Date.now() - startedAt) / 1000);
  logSummary({
    existingProducts,
    merged,
    seconds,
    scanned,
    candidates,
    found: products.length,
    skippedKnownUrls,
  });
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
