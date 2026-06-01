import { existsSync, readFileSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import {
  BASE_URL,
  DEFAULT_CONCURRENCY,
  DEFAULT_DELAY,
  DEFAULT_RETRIES,
} from "./parser/config.mjs";
import {
  createLogger,
  parseProductPage,
  sleep,
} from "./parser/index.mjs";
import {
  extractBrandCode,
  resolveDisplayArticle,
} from "./parser/product-code.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PRODUCTS_FILE = join(__dirname, "..", "products.json");
const URLS_FILE = join(__dirname, "..", "data", "ultra-svet-product-urls.json");
const LOG_FILE = join(__dirname, "..", "data", "import-from-audit-urls-log.json");

const DEFAULT_TARGET = 20000;
const BASE_PRICE_MULTIPLIER = 0.84;
const UNCATEGORIZED = "\u0411\u0435\u0437 \u043a\u0430\u0442\u0435\u0433\u043e\u0440\u0438\u0438";
const OTHER_SUBCATEGORY = "\u0414\u0440\u0443\u0433\u043e\u0435";

function readNumberArg(name, fallback, { min = 0, max = Infinity } = {}) {
  const envName = `IMPORT_${name.toUpperCase().replace(/-/g, "_")}`;
  let value = Number(process.env[envName]);
  if (!Number.isFinite(value)) value = fallback;

  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith(`--${name}=`)) {
      value = Number(arg.slice(name.length + 3));
    }
  }

  if (!Number.isFinite(value)) value = fallback;
  return Math.max(min, Math.min(value, max));
}

function readStringArg(name, fallback) {
  const envName = `IMPORT_${name.toUpperCase().replace(/-/g, "_")}`;
  let value = process.env[envName] || fallback;

  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith(`--${name}=`)) {
      value = arg.slice(name.length + 3);
    }
  }

  return value;
}

function parseArgs() {
  return {
    target: readNumberArg("target", DEFAULT_TARGET, { min: 1, max: 50000 }),
    delay: readNumberArg("delay", DEFAULT_DELAY, { min: 100 }),
    retries: readNumberArg("retries", DEFAULT_RETRIES, { min: 0, max: 5 }),
    concurrency: readNumberArg("concurrency", DEFAULT_CONCURRENCY, {
      min: 1,
      max: 8,
    }),
    urlsFile: resolve(process.cwd(), readStringArg("urls-file", URLS_FILE)),
    productsFile: resolve(
      process.cwd(),
      readStringArg("products-file", PRODUCTS_FILE)
    ),
    logFile: resolve(process.cwd(), readStringArg("log-file", LOG_FILE)),
  };
}

function readProductsPayload(productsFile) {
  if (!existsSync(productsFile)) {
    return {
      source: "ultra-svet.com",
      generatedAt: new Date().toISOString(),
      total: 0,
      products: [],
    };
  }

  const parsed = JSON.parse(readFileSync(productsFile, "utf-8"));
  return {
    ...parsed,
    products: Array.isArray(parsed?.products) ? parsed.products : [],
  };
}

function readAuditUrls(urlsFile) {
  const parsed = JSON.parse(readFileSync(urlsFile, "utf-8"));
  const urls = Array.isArray(parsed?.urls) ? parsed.urls : [];
  return uniqueStrings(urls.map((url) => String(url || "").trim()).filter(Boolean));
}

function normalizeKey(value) {
  return String(value ?? "").trim().toLowerCase();
}

function urlKeys(value) {
  const keys = new Set();
  const raw = String(value ?? "").trim();
  if (!raw) return keys;

  keys.add(normalizeKey(raw).replace(/\/$/, ""));
  try {
    const url = new URL(raw, BASE_URL);
    url.hash = "";
    keys.add(normalizeKey(url.toString()).replace(/\/$/, ""));
    keys.add(normalizeKey(decodeURI(url.toString())).replace(/\/$/, ""));
  } catch {
    // Keep the raw key above.
  }

  return keys;
}

function articleKey(item) {
  return normalizeKey(item.siteArticle || item.sourceArticle || item.article || item.sku);
}

function productUrlKeys(item) {
  return urlKeys(item.url || item.sourceUrl);
}

function buildKnownSets(products) {
  const articles = new Set();
  const urls = new Set();

  for (const product of products) {
    const article = articleKey(product);
    if (article) articles.add(article);
    for (const key of productUrlKeys(product)) urls.add(key);
  }

  return { articles, urls };
}

function normalizeParsedProduct(item) {
  const price = Number(item.price) || 0;
  const priceAfterDiscount = roundMoney(price * BASE_PRICE_MULTIPLIER);
  const title = item.title || item.name || "";
  const url = item.url || "";
  const brand = String(item.brand || "").trim();
  const siteArticle = String(item.siteArticle || item.sourceArticle || "").trim();
  const recalculatedBrandCode =
    extractBrandCode({
      title,
      url,
      brand,
      siteArticle,
    }) || String(item.brandCode || "").trim();
  const article =
    resolveDisplayArticle({
      article: recalculatedBrandCode,
      sku: recalculatedBrandCode,
      brandCode: recalculatedBrandCode,
      title,
      url,
      brand,
      siteArticle,
    }) ||
    String(item.article || item.sku || "").trim() ||
    "\u0411\u0435\u0437 \u0430\u0440\u0442\u0438\u043a\u0443\u043b\u0430";
  const availability = String(item.availability || item.stockStatus || "Не указано").trim() || "Не указано";
  const { categoryPath, categoryPathUrls } = normalizeCategoryPath(item);
  const hasRealPath = isRealCategoryPath(categoryPath);
  const category = hasRealPath ? categoryPath[0] : UNCATEGORIZED;
  const subcategory =
    hasRealPath && categoryPath.length > 1
      ? categoryPath[categoryPath.length - 1]
      : OTHER_SUBCATEGORY;

  return {
    ...item,
    title,
    article,
    siteArticle,
    brandCode: recalculatedBrandCode,
    image: item.image || item.imageUrl || "",
    category,
    subcategory,
    categoryUrl: hasRealPath ? categoryPathUrls[0] || "" : "",
    subcategoryUrl:
      hasRealPath && categoryPath.length > 1
        ? categoryPathUrls[categoryPathUrls.length - 1] || ""
        : "",
    categoryPath,
    categoryPathUrls,
    breadcrumbs: Array.isArray(item.breadcrumbs) ? item.breadcrumbs : [],
    brand,
    price,
    basePrice: priceAfterDiscount,
    priceAfterDiscount,
    availability,
    stockStatus: availability,
    url,
    name: item.name || item.title || "",
    sku: article,
    imageUrl: item.imageUrl || item.image || "",
  };
}

function normalizeStoredProduct(item) {
  const product = normalizeParsedProduct(item);
  return {
    ...item,
    category: product.category,
    subcategory: product.subcategory,
    categoryUrl: product.categoryUrl,
    subcategoryUrl: product.subcategoryUrl,
    categoryPath: product.categoryPath,
    categoryPathUrls: product.categoryPathUrls,
    article: product.article,
    sku: product.sku,
    brandCode: product.brandCode,
    basePrice: product.basePrice,
    priceAfterDiscount: product.priceAfterDiscount,
    availability: product.availability,
    stockStatus: product.stockStatus,
  };
}

function isRealCategoryPath(path) {
  return (
    Array.isArray(path) &&
    path.length > 0 &&
    String(path[0] || "").trim() &&
    String(path[0] || "").trim() !== UNCATEGORIZED
  );
}

function normalizeCategoryPath(item) {
  const breadcrumbs = Array.isArray(item.breadcrumbs) ? item.breadcrumbs : [];
  const crumbPath = breadcrumbs
    .map((crumb) => String(crumb?.title || "").trim())
    .filter(Boolean);
  const crumbUrls = breadcrumbs.map((crumb) => String(crumb?.url || "").trim());

  if (crumbPath.length > 0) {
    return {
      categoryPath: crumbPath,
      categoryPathUrls: alignPathUrls(crumbPath, crumbUrls),
    };
  }

  const storedPath = Array.isArray(item.categoryPath)
    ? item.categoryPath.map((entry) => String(entry || "").trim()).filter(Boolean)
    : [];
  const storedUrls = Array.isArray(item.categoryPathUrls)
    ? item.categoryPathUrls.map((entry) => String(entry || "").trim())
    : [];

  if (isRealCategoryPath(storedPath)) {
    return {
      categoryPath: storedPath,
      categoryPathUrls: alignPathUrls(storedPath, storedUrls),
    };
  }

  const category = String(item.category || "").trim();
  const subcategory = String(item.subcategory || "").trim();
  if (category && category !== UNCATEGORIZED) {
    const path =
      subcategory && subcategory !== OTHER_SUBCATEGORY
        ? [category, subcategory]
        : [category];
    return {
      categoryPath: path,
      categoryPathUrls: alignPathUrls(path, [
        String(item.categoryUrl || "").trim(),
        String(item.subcategoryUrl || "").trim(),
      ]),
    };
  }

  return {
    categoryPath: [UNCATEGORIZED],
    categoryPathUrls: [""],
  };
}

function alignPathUrls(path, urls) {
  return path.map((_, index) => urls[index] || "");
}

function hasDuplicateUrl(url, knownUrls) {
  for (const key of urlKeys(url)) {
    if (knownUrls.has(key)) return true;
  }
  return false;
}

function rememberProduct(product, known) {
  const article = articleKey(product);
  if (article) known.articles.add(article);
  for (const key of productUrlKeys(product)) known.urls.add(key);
}

function isDuplicateProduct(product, known) {
  const article = articleKey(product);
  if (article && known.articles.has(article)) return true;

  for (const key of productUrlKeys(product)) {
    if (known.urls.has(key)) return true;
  }

  return false;
}

function writeProductsPayload(productsFile, previousPayload, products, stats) {
  const payload = {
    ...previousPayload,
    source: previousPayload.source || "ultra-svet.com",
    generatedAt: new Date().toISOString(),
    limit: stats.target,
    total: products.length,
    existingTotal: stats.before,
    processedUrls: stats.processedUrls,
    added: stats.added,
    skippedDuplicates: stats.skippedDuplicates,
    errors: stats.errors,
    products,
  };

  writeFileSync(productsFile, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
}

function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function writeLog(logFile, stats, errorItems) {
  const payload = {
    generatedAt: new Date().toISOString(),
    ...stats,
    errorItems,
  };
  writeFileSync(logFile, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
}

function withTimeout(promise, ms, message) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), ms);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

function logProgress(stats, queueLength) {
  console.log(
    [
      `processed=${stats.processedUrls}`,
      `added=${stats.added}`,
      `duplicates=${stats.skippedDuplicates}`,
      `errors=${stats.errors}`,
      `total=${stats.after}`,
      `queue=${queueLength}`,
    ].join(" ")
  );
}

async function importFromUrls({
  target,
  delay,
  retries,
  concurrency,
  urlsFile,
  productsFile,
  logFile,
}) {
  const payload = readProductsPayload(productsFile);
  const products = payload.products.map(normalizeStoredProduct);
  const before = products.length;
  target = Math.max(target, before);
  const known = buildKnownSets(products);
  const auditUrls = readAuditUrls(urlsFile);
  const logger = createLogger();
  const queue = [...auditUrls];
  const errorItems = [];
  const stats = {
    before,
    target,
    processedUrls: 0,
    added: 0,
    skippedDuplicates: 0,
    errors: 0,
    after: products.length,
  };

  async function parseUrl(url) {
    if (products.length >= target) return;
    stats.processedUrls += 1;

    if (hasDuplicateUrl(url, known.urls)) {
      stats.skippedDuplicates += 1;
      return;
    }

    try {
      const parsed = await withTimeout(
        parseProductPage(url, { retries, delay, logger }),
        20000,
        "product parse timeout"
      );
      const product = normalizeParsedProduct(parsed);

      if (!product.title || !(product.article || product.siteArticle) || !product.price || !product.url) {
        throw new Error("missing required product fields");
      }

      if (isDuplicateProduct(product, known)) {
        stats.skippedDuplicates += 1;
        rememberProduct(product, known);
        return;
      }

      if (products.length >= target) return;

      products.push(product);
      rememberProduct(product, known);
      stats.added += 1;
      stats.after = products.length;

      if (stats.added % 25 === 0 || products.length >= target) {
        logProgress(stats, queue.length);
      }
    } catch (error) {
      stats.errors += 1;
      errorItems.push({
        url,
        message: error instanceof Error ? error.message : String(error),
      });
      console.log(
        `error: ${error instanceof Error ? error.message : String(error)} | ${url.replace(BASE_URL, "")}`
      );
    }

    await sleep(delay);
  }

  async function worker() {
    while (queue.length > 0 && products.length < target) {
      const url = queue.shift();
      if (!url) continue;
      await parseUrl(url);
    }
  }

  console.log(`Importing products from audit URL list`);
  console.log(`urlFile=${urlsFile}`);
  console.log(`productsFile=${productsFile}`);
  console.log(`target=${target}, before=${before}, auditUrls=${auditUrls.length}`);
  console.log(`delay=${delay}ms, concurrency=${concurrency}, retries=${retries}`);

  if (before >= target) {
    stats.after = before;
    console.log(`Target already reached. Network import skipped.`);
  } else {
    await Promise.all(Array.from({ length: concurrency }, () => worker()));
  }

  stats.after = products.length;
  writeProductsPayload(productsFile, payload, products.slice(0, target), stats);
  writeLog(logFile, { ...stats, after: Math.min(products.length, target) }, errorItems);

  console.log(`Сколько было товаров: ${stats.before}`);
  console.log(`Сколько обработано URL: ${stats.processedUrls}`);
  console.log(`Сколько добавлено: ${stats.added}`);
  console.log(`Сколько дублей пропущено: ${stats.skippedDuplicates}`);
  console.log(`Сколько ошибок: ${stats.errors}`);
  console.log(`Сколько стало всего: ${Math.min(products.length, target)}`);
  console.log(`Лог: ${logFile}`);
}

function uniqueStrings(values) {
  return Array.from(new Set(values));
}

const args = parseArgs();

importFromUrls(args).catch((error) => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
