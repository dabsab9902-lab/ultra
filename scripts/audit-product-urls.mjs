import * as cheerio from "cheerio";
import { mkdir, writeFile } from "fs/promises";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import {
  BASE_URL,
  DEFAULT_CONCURRENCY,
  DEFAULT_DELAY,
  DEFAULT_RETRIES,
  SEED_PAGES,
} from "./parser/config.mjs";
import { fetchHtml, sleep } from "./parser/http.mjs";
import { createLogger } from "./parser/logger.mjs";
import { isExcludedPath, normalizeUrl } from "./parser/url.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUT_FILE = resolve(
  __dirname,
  "..",
  "data",
  "ultra-svet-product-urls.json"
);

const PRODUCT_SELECTORS = [
  ".product-thumb a[href]",
  ".product-layout a[href]",
  ".rm-module-item a[href]",
  ".rm-product-thumb a[href]",
  ".caption a[href]",
  ".name a[href]",
  "h4 a[href]",
];

const DROPPED_QUERY_PARAMS = new Set([
  "sort",
  "order",
  "limit",
  "filter",
  "filter_name",
  "filter_sub_category",
  "filter_description",
  "tracking",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "gclid",
  "fbclid",
  "yclid",
]);

function numberArg(name, fallback, { min = 0, max = Infinity } = {}) {
  const envName = `AUDIT_${name.toUpperCase().replace(/-/g, "_")}`;
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

function stringArg(name, fallback) {
  const envName = `AUDIT_${name.toUpperCase().replace(/-/g, "_")}`;
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
    concurrency: numberArg("concurrency", DEFAULT_CONCURRENCY, { min: 1, max: 8 }),
    delay: numberArg("delay", DEFAULT_DELAY, { min: 100 }),
    retries: numberArg("retries", DEFAULT_RETRIES, { min: 0, max: 5 }),
    maxPages: numberArg("max-pages", 0, { min: 0 }),
    outFile: resolve(process.cwd(), stringArg("out", DEFAULT_OUT_FILE)),
  };
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

function isLikelyProductSlug(slug) {
  return slug.length >= 20 && /\d/.test(slug);
}

function normalizePathname(pathname) {
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed || "/";
}

function dropNoiseParams(url, { keepPage = false } = {}) {
  for (const param of [...url.searchParams.keys()]) {
    const lower = param.toLowerCase();
    if (keepPage && lower === "page") continue;
    if (DROPPED_QUERY_PARAMS.has(lower) || lower.startsWith("utm_")) {
      url.searchParams.delete(param);
      continue;
    }
    if (!keepPage || lower !== "page") url.searchParams.delete(param);
  }

  if (keepPage && url.searchParams.get("page") === "1") {
    url.searchParams.delete("page");
  }
}

function canonicalPageUrl(rawUrl, base = BASE_URL) {
  const normalized = normalizeUrl(rawUrl, base);
  if (!normalized) return null;

  const url = new URL(normalized);
  url.pathname = normalizePathname(url.pathname);
  url.hash = "";
  dropNoiseParams(url, { keepPage: true });
  return url.toString().replace(/\/$/, "");
}

function categoryBaseUrl(rawUrl) {
  const canonical = canonicalPageUrl(rawUrl);
  if (!canonical) return null;
  const url = new URL(canonical);
  url.searchParams.delete("page");
  return url.toString().replace(/\/$/, "");
}

function canonicalProductUrl(rawUrl, base = BASE_URL) {
  const normalized = normalizeUrl(rawUrl, base);
  if (!normalized) return null;

  const url = new URL(normalized);
  url.pathname = normalizePathname(url.pathname);
  url.hash = "";

  const route = url.searchParams.get("route") || "";
  const productId = url.searchParams.get("product_id");
  if (url.pathname === "/index.php" && route.includes("product/product") && productId) {
    url.search = "";
    url.searchParams.set("route", "product/product");
    url.searchParams.set("product_id", productId);
    return url.toString().replace(/\/$/, "");
  }

  dropNoiseParams(url);
  return url.toString().replace(/\/$/, "");
}

function productIdentity(rawUrl) {
  const url = new URL(rawUrl);
  const productId = url.searchParams.get("product_id");
  if (url.pathname === "/index.php" && productId) return `product_id:${productId}`;
  return rawUrl.toLowerCase();
}

function isProductUrlCandidate(rawUrl) {
  const normalized = canonicalProductUrl(rawUrl);
  if (!normalized) return false;

  const url = new URL(normalized);
  const parts = url.pathname.split("/").filter(Boolean);
  if (isExcludedPath(url.pathname) || parts.length !== 1) return false;

  const route = url.searchParams.get("route") || "";
  if (url.pathname === "/index.php") {
    return route.includes("product/product") && url.searchParams.has("product_id");
  }

  if (url.searchParams.has("page")) return false;

  const slug = parts[0].toLowerCase();
  return isLikelyProductSlug(slug) && !isLikelyArticleSlug(slug);
}

function isCategoryPageCandidate(rawUrl) {
  const canonical = canonicalPageUrl(rawUrl);
  if (!canonical) return false;

  const url = new URL(canonical);
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length !== 1 || isExcludedPath(url.pathname)) return false;
  if (url.pathname === "/index.php") return false;

  const slug = parts[0].toLowerCase();
  if (isLikelyArticleSlug(slug) || isLikelyProductSlug(slug)) return false;

  return true;
}

function extractProductUrls($, pageUrl) {
  const products = new Set();

  for (const selector of PRODUCT_SELECTORS) {
    $(selector).each((_, element) => {
      const url = canonicalProductUrl($(element).attr("href"), pageUrl);
      if (url && isProductUrlCandidate(url)) products.add(url);
    });
  }

  return products;
}

function extractCategoryUrls($, pageUrl, productUrls) {
  const categories = new Set();

  $("a[href]").each((_, element) => {
    const url = canonicalPageUrl($(element).attr("href"), pageUrl);
    if (!url || url === pageUrl || productUrls.has(canonicalProductUrl(url))) return;
    if (isCategoryPageCandidate(url)) categories.add(url);
  });

  return categories;
}

function extractPageLinks($, pageUrl) {
  const pages = new Set();

  $('a[href*="page="], .pagination a[href], ul.pagination a[href]').each(
    (_, element) => {
      const url = canonicalPageUrl($(element).attr("href"), pageUrl);
      if (url && isCategoryPageCandidate(url)) pages.add(url);
    }
  );

  return pages;
}

function createCrawler({
  delay,
  retries,
  concurrency,
  maxPages,
  logger,
}) {
  const pageQueue = [];
  const queuedPages = new Set();
  const seenPages = new Set();
  const failedPages = [];
  const categoryUrls = new Set();
  const productUrls = [];
  const productKeys = new Set();
  let totalFoundUrls = 0;
  let duplicateUrls = 0;

  function canQueueMore() {
    return !maxPages || queuedPages.size < maxPages;
  }

  function enqueuePage(rawUrl, { countCategory = true } = {}) {
    const url = canonicalPageUrl(rawUrl);
    if (!url || queuedPages.has(url) || seenPages.has(url) || !canQueueMore()) return;

    if (countCategory) {
      const base = categoryBaseUrl(url);
      if (base && isCategoryPageCandidate(base)) categoryUrls.add(base);
    }

    queuedPages.add(url);
    pageQueue.push(url);
  }

  function addProductUrl(rawUrl) {
    const url = canonicalProductUrl(rawUrl);
    if (!url || !isProductUrlCandidate(url)) return;

    totalFoundUrls += 1;
    const key = productIdentity(url);
    if (productKeys.has(key)) {
      duplicateUrls += 1;
      return;
    }

    productKeys.add(key);
    productUrls.push(url);
  }

  async function scanPage(pageUrl) {
    if (seenPages.has(pageUrl)) return;
    seenPages.add(pageUrl);

    try {
      const html = await fetchHtml(pageUrl, { retries, delay, logger });
      const $ = cheerio.load(html);
      const productsOnPage = extractProductUrls($, pageUrl);

      productsOnPage.forEach(addProductUrl);
      extractCategoryUrls($, pageUrl, productsOnPage).forEach((url) =>
        enqueuePage(url)
      );
      extractPageLinks($, pageUrl).forEach((url) => enqueuePage(url));

      if (seenPages.size % 25 === 0 || seenPages.size === 1) {
        console.log(
          `scan pages=${seenPages.size}, categories=${categoryUrls.size}, found=${totalFoundUrls}, unique=${productUrls.length}, queue=${pageQueue.length}`
        );
      }
    } catch (error) {
      failedPages.push({ url: pageUrl, message: error.message });
      logger.warn("audit page failed", { url: pageUrl, message: error.message });
    }

    await sleep(delay);
  }

  function runQueue() {
    return new Promise((resolve) => {
      let active = 0;

      const pump = () => {
        if (pageQueue.length === 0 && active === 0) {
          resolve();
          return;
        }

        while (active < concurrency && pageQueue.length > 0) {
          const pageUrl = pageQueue.shift();
          active += 1;
          scanPage(pageUrl).finally(() => {
            active -= 1;
            pump();
          });
        }
      };

      pump();
    });
  }

  return {
    enqueuePage,
    runQueue,
    summary() {
      return {
        totalFoundUrls,
        duplicateUrls,
        uniqueProducts: productUrls.length,
        categories: categoryUrls.size,
        categoryPages: seenPages.size,
        failedPages,
        productUrls: [...productUrls].sort(),
      };
    },
  };
}

async function writeAuditFile(outFile, payload) {
  await mkdir(dirname(outFile), { recursive: true });
  await writeFile(outFile, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
}

async function main() {
  const { concurrency, delay, retries, maxPages, outFile } = parseArgs();
  const logger = createLogger();
  const crawler = createCrawler({ delay, retries, concurrency, maxPages, logger });
  const startedAt = Date.now();

  for (const seed of SEED_PAGES) {
    crawler.enqueuePage(seed, { countCategory: seed !== `${BASE_URL}/` });
  }

  console.log("Audit count for ultra-svet.com product URLs");
  console.log(
    `delay=${delay}ms, concurrency=${concurrency}, retries=${retries}, out=${outFile}`
  );
  if (maxPages) console.log(`limited mode: max-pages=${maxPages}`);

  await crawler.runQueue();

  const summary = crawler.summary();
  const payload = {
    source: "ultra-svet.com",
    generatedAt: new Date().toISOString(),
    limited: Boolean(maxPages),
    maxPages: maxPages || null,
    totalFoundUrls: summary.totalFoundUrls,
    duplicates: summary.duplicateUrls,
    uniqueProducts: summary.uniqueProducts,
    categories: summary.categories,
    categoryPages: summary.categoryPages,
    failedPages: summary.failedPages,
    urls: summary.productUrls,
  };

  await writeAuditFile(outFile, payload);

  const seconds = Math.round((Date.now() - startedAt) / 1000);
  console.log(`Всего найдено URL: ${payload.totalFoundUrls}`);
  console.log(`Дублей: ${payload.duplicates}`);
  console.log(`Итоговое количество уникальных товаров: ${payload.uniqueProducts}`);
  console.log(`Количество категорий: ${payload.categories}`);
  console.log(`Просканировано страниц категорий: ${payload.categoryPages}`);
  console.log(`Ошибок страниц: ${payload.failedPages.length}`);
  console.log(`Файл URL: ${outFile}`);
  console.log(`Готово за ${seconds}с`);
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
