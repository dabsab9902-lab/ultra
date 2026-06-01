import {
  BASE_URL,
  DEFAULT_CONCURRENCY,
  DEFAULT_DELAY,
  DEFAULT_LIMIT,
  DEFAULT_MAX_CATEGORY_PAGES,
  DEFAULT_RETRIES,
  SEED_PAGES,
} from "./config.mjs";
import { parseCategoryPage } from "./category-parser.mjs";
import { fetchHtml, sleep } from "./http.mjs";
import { createLogger } from "./logger.mjs";
import { parseProductFromHtml } from "./product-parser.mjs";
import { makePaginatedUrls } from "./url.mjs";

async function worker(queue, fn) {
  while (queue.length) {
    const item = queue.shift();
    await fn(item);
  }
}

function normalizeKey(value) {
  return String(value ?? "").trim().toLowerCase();
}

function withTimeout(promise, ms, message) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), ms);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

export async function parseProductPage(url, options = {}) {
  const html = await fetchHtml(url, options);
  return parseProductFromHtml(html, url);
}

export async function collectProductUrls({
  limit = DEFAULT_LIMIT,
  targetNewUrls = limit,
  delay = DEFAULT_DELAY,
  retries = DEFAULT_RETRIES,
  seedPages = SEED_PAGES,
  maxCategoryPages = DEFAULT_MAX_CATEGORY_PAGES,
  concurrency = DEFAULT_CONCURRENCY,
  skipUrls = [],
  logger = createLogger({ silent: true }),
  onProgress,
} = {}) {
  const productUrls = new Set();
  const newProductUrls = new Set();
  const knownUrls = new Set(Array.from(skipUrls, normalizeKey).filter(Boolean));
  const seenPages = new Set();
  const pageQueue = [...seedPages];
  const target = Math.max(limit * 2, limit + 50);
  const newTarget = Math.max(targetNewUrls * 2, targetNewUrls + 250);
  const queueLimit = Math.max(seedPages.length, Math.min(target * 2, newTarget * 4));

  function addProductUrl(url) {
    productUrls.add(url);
    if (!knownUrls.has(normalizeKey(url))) newProductUrls.add(url);
  }

  async function scanPage(pageUrl) {
    if (
      seenPages.has(pageUrl) ||
      productUrls.size >= target ||
      newProductUrls.size >= newTarget
    ) {
      return;
    }
    seenPages.add(pageUrl);

    try {
      const html = await fetchHtml(pageUrl, { retries, delay, logger });
      const links = parseCategoryPage(html, pageUrl);
      links.products.forEach(addProductUrl);

      for (const categoryUrl of links.categories) {
        if (!seenPages.has(categoryUrl) && pageQueue.length < queueLimit) {
          pageQueue.push(categoryUrl);
          makePaginatedUrls(categoryUrl, maxCategoryPages).forEach((url) => {
            if (!seenPages.has(url) && pageQueue.length < queueLimit) {
              pageQueue.push(url);
            }
          });
        }
      }

      onProgress?.({
        type: "scan",
        url: pageUrl,
        products: productUrls.size,
        newProducts: newProductUrls.size,
        queued: pageQueue.length,
      });
    } catch (error) {
      logger.warn("category scan failed", { url: pageUrl, message: error.message });
      onProgress?.({ type: "scan-error", url: pageUrl, message: error.message });
    }

    await sleep(delay);
  }

  await Promise.all(
    Array.from({ length: concurrency }, () => worker(pageQueue, scanPage))
  );

  return [...productUrls].slice(0, target);
}

export async function scrapeProducts({
  limit = DEFAULT_LIMIT,
  newLimit = limit,
  delay = DEFAULT_DELAY,
  retries = DEFAULT_RETRIES,
  concurrency = DEFAULT_CONCURRENCY,
  seedPages = SEED_PAGES,
  skipUrls = [],
  skipArticles = [],
  logger = createLogger({ silent: true }),
  onProgress,
} = {}) {
  const targetNewProducts = Math.max(1, Math.min(newLimit, limit));
  const knownUrls = new Set(Array.from(skipUrls, normalizeKey).filter(Boolean));
  const seenArticle = new Set(Array.from(skipArticles, normalizeKey).filter(Boolean));
  const seenUrl = new Set(knownUrls);

  logger.info("collecting product urls", {
    limit,
    newLimit: targetNewProducts,
    delay,
    concurrency,
    knownUrls: knownUrls.size,
    knownArticles: seenArticle.size,
  });
  const candidateUrls = await collectProductUrls({
    limit,
    delay,
    retries,
    concurrency,
    seedPages,
    targetNewUrls: targetNewProducts,
    skipUrls: knownUrls,
    logger,
    onProgress,
  });

  if (candidateUrls.length === 0) {
    throw new Error("No product URLs found on ultra-svet.com");
  }

  const products = [];
  let scanned = 0;
  let skippedKnownUrls = 0;
  const queue = candidateUrls.filter((url) => {
    const key = normalizeKey(url);
    if (knownUrls.has(key)) {
      skippedKnownUrls += 1;
      return false;
    }
    return true;
  });

  async function parseUrl(url) {
    if (products.length >= targetNewProducts) return;
    scanned += 1;

    try {
      const item = await withTimeout(
        parseProductPage(url, { retries, delay, logger }),
        15000,
        "product parse timeout"
      );
      if (products.length >= targetNewProducts) return;
      if (!item.title || !(item.article || item.siteArticle) || !item.price || !item.url) {
        onProgress?.({ type: "skip", url, reason: "missing required fields" });
        return;
      }
      const articleKey = normalizeKey(item.siteArticle || item.article || item.url);
      if (seenArticle.has(articleKey)) {
        onProgress?.({ type: "skip", url, reason: "duplicate article" });
        return;
      }
      const urlKey = normalizeKey(item.url || url);
      if (urlKey && seenUrl.has(urlKey)) {
        onProgress?.({ type: "skip", url, reason: "duplicate url" });
        return;
      }
      seenArticle.add(articleKey);
      if (urlKey) seenUrl.add(urlKey);
      products.push(item);
      onProgress?.({ type: "ok", item, index: products.length, limit: targetNewProducts });
    } catch (error) {
      logger.warn("product parse failed", { url, message: error.message });
      onProgress?.({ type: "error", url, message: error.message });
    }

    await sleep(delay);
  }

  await Promise.all(
    Array.from({ length: concurrency }, () => worker(queue, parseUrl))
  );

  if (products.length === 0) {
    throw new Error("No products imported from ultra-svet.com");
  }

  return {
    products: products.slice(0, targetNewProducts),
    scanned,
    candidates: candidateUrls.length,
    skippedKnownUrls,
  };
}

export { BASE_URL, SEED_PAGES } from "./config.mjs";
export { parseCategoryPage, extractLinks } from "./category-parser.mjs";
export { fetchHtml, sleep } from "./http.mjs";
export { createLogger } from "./logger.mjs";
export { parseProductFromHtml } from "./product-parser.mjs";
export { normalizeUrl, makePaginatedUrls } from "./url.mjs";
