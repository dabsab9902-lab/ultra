import { existsSync, readFileSync, writeFileSync } from "fs";
import { join, resolve } from "path";
import {
  DEFAULT_CONCURRENCY,
  DEFAULT_DELAY,
  DEFAULT_RETRIES,
} from "./parser/config.mjs";
import { createLogger, parseProductPage, sleep } from "./parser/index.mjs";

const PRODUCTS_FILE = join(process.cwd(), "products.json");
const LOG_FILE = join(process.cwd(), "data", "repair-categories-log.json");
const UNCATEGORIZED = "Без категории";
const OTHER_SUBCATEGORY = "Другое";
const BAD_CATEGORY_VALUES = new Set([
  normalizeText(UNCATEGORIZED),
  normalizeText("Р‘РµР· РєР°С‚РµРіРѕСЂРёРё"),
  "",
]);

function readNumberArg(name, fallback, { min = 0, max = Infinity } = {}) {
  const envName = `REPAIR_${name.toUpperCase().replace(/-/g, "_")}`;
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
  const envName = `REPAIR_${name.toUpperCase().replace(/-/g, "_")}`;
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
    delay: readNumberArg("delay", DEFAULT_DELAY, { min: 100 }),
    retries: readNumberArg("retries", DEFAULT_RETRIES, { min: 0, max: 5 }),
    concurrency: readNumberArg("concurrency", DEFAULT_CONCURRENCY, {
      min: 1,
      max: 6,
    }),
    limit: readNumberArg("limit", Infinity, { min: 1 }),
    productsFile: resolve(
      process.cwd(),
      readStringArg("products-file", PRODUCTS_FILE)
    ),
    logFile: resolve(process.cwd(), readStringArg("log-file", LOG_FILE)),
  };
}

function readProductsPayload(productsFile) {
  if (!existsSync(productsFile)) {
    throw new Error(`Products file not found: ${productsFile}`);
  }

  const parsed = JSON.parse(readFileSync(productsFile, "utf-8"));
  return {
    ...parsed,
    products: Array.isArray(parsed?.products) ? parsed.products : [],
  };
}

function normalizeText(value) {
  return String(value ?? "").trim().toLocaleLowerCase("ru");
}

function normalizeUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  try {
    const url = new URL(raw, "https://ultra-svet.com");
    url.hash = "";
    return url.toString().replace(/\/$/, "").toLocaleLowerCase("ru");
  } catch {
    return raw.replace(/\/$/, "").toLocaleLowerCase("ru");
  }
}

function isBadCategory(value) {
  return BAD_CATEGORY_VALUES.has(normalizeText(value));
}

function isRealCategoryPath(path) {
  return (
    Array.isArray(path) &&
    path.length > 0 &&
    String(path[0] || "").trim() &&
    !isBadCategory(path[0])
  );
}

function isRepairCandidate(product) {
  return (
    isBadCategory(product.category) ||
    !isRealCategoryPath(product.categoryPath) ||
    (Array.isArray(product.categoryPath) &&
      product.categoryPath.some((entry) => isBadCategory(entry)))
  );
}

function categoryFromPath(path, urls = []) {
  const cleanPath = path.map((entry) => String(entry || "").trim()).filter(Boolean);
  if (!isRealCategoryPath(cleanPath)) return null;

  const cleanUrls = cleanPath.map((_, index) => String(urls[index] || "").trim());
  return {
    category: cleanPath[0],
    subcategory:
      cleanPath.length > 1 ? cleanPath[cleanPath.length - 1] : OTHER_SUBCATEGORY,
    categoryUrl: cleanUrls[0] || "",
    subcategoryUrl: cleanPath.length > 1 ? cleanUrls[cleanUrls.length - 1] || "" : "",
    categoryPath: cleanPath,
    categoryPathUrls: cleanUrls,
    breadcrumbs: cleanPath.map((title, index) => ({
      title,
      url: cleanUrls[index] || "",
    })),
  };
}

function categoryFromParsed(parsed) {
  if (!parsed) return null;

  const fromPath = categoryFromPath(
    Array.isArray(parsed.categoryPath) ? parsed.categoryPath : [],
    Array.isArray(parsed.categoryPathUrls) ? parsed.categoryPathUrls : []
  );
  if (fromPath) {
    return {
      ...fromPath,
      breadcrumbs: Array.isArray(parsed.breadcrumbs) && parsed.breadcrumbs.length
        ? parsed.breadcrumbs
        : fromPath.breadcrumbs,
    };
  }

  const category = String(parsed.category || "").trim();
  const subcategory = String(parsed.subcategory || "").trim();
  if (category && !isBadCategory(category)) {
    return categoryFromPath(
      subcategory && subcategory !== OTHER_SUBCATEGORY
        ? [category, subcategory]
        : [category],
      [parsed.categoryUrl, parsed.subcategoryUrl]
    );
  }

  return null;
}

function buildCategoryUrlIndex(products) {
  const map = new Map();

  for (const product of products) {
    const path = Array.isArray(product.categoryPath) ? product.categoryPath : [];
    const urls = Array.isArray(product.categoryPathUrls) ? product.categoryPathUrls : [];
    if (!isRealCategoryPath(path)) continue;

    for (let index = 0; index < urls.length; index += 1) {
      const key = normalizeUrl(urls[index]);
      if (!key || map.has(key)) continue;
      map.set(key, categoryFromPath(path.slice(0, index + 1), urls.slice(0, index + 1)));
    }

    for (const key of [product.categoryUrl, product.subcategoryUrl]) {
      const normalized = normalizeUrl(key);
      if (normalized && !map.has(normalized)) {
        map.set(normalized, categoryFromPath(path, urls));
      }
    }
  }

  return map;
}

function imagePathKey(product) {
  const image = String(product.image || product.imageUrl || "").trim();
  if (!image) return "";

  let pathname = image;
  try {
    pathname = new URL(image, "https://ultra-svet.com").pathname;
  } catch {
    // Keep the raw image path.
  }

  const marker = "/image/catalog/tovari/";
  const markerIndex = pathname.toLocaleLowerCase("ru").indexOf(marker);
  const relative =
    markerIndex >= 0 ? pathname.slice(markerIndex + marker.length) : pathname;
  const parts = relative
    .split("/")
    .map((entry) => decodeURIComponent(entry).trim().toLocaleLowerCase("ru"))
    .filter(Boolean);
  if (parts.length <= 1) return "";
  parts.pop();
  return parts.join("/");
}

function buildImagePathIndex(products) {
  const buckets = new Map();

  for (const product of products) {
    const path = Array.isArray(product.categoryPath) ? product.categoryPath : [];
    const urls = Array.isArray(product.categoryPathUrls) ? product.categoryPathUrls : [];
    if (!isRealCategoryPath(path)) continue;

    const key = imagePathKey(product);
    if (!key) continue;
    const parts = key.split("/");

    for (let start = 0; start < parts.length; start += 1) {
      const suffix = parts.slice(start).join("/");
      if (!suffix || suffix.length < 6) continue;
      const bucket = buckets.get(suffix) ?? new Map();
      const categoryInfo = categoryFromPath(path, urls);
      const categoryKey = categoryInfo.categoryPath.join("\u0000");
      const row = bucket.get(categoryKey) ?? { categoryInfo, count: 0 };
      row.count += 1;
      bucket.set(categoryKey, row);
      buckets.set(suffix, bucket);
    }
  }

  return buckets;
}

function fallbackFromImagePath(product, imagePathIndex) {
  const key = imagePathKey(product);
  if (!key) return null;
  const parts = key.split("/");

  for (let start = 0; start < parts.length; start += 1) {
    const suffix = parts.slice(start).join("/");
    const bucket = imagePathIndex.get(suffix);
    if (!bucket) continue;

    const best = Array.from(bucket.values()).sort((a, b) => b.count - a.count)[0];
    if (best?.categoryInfo) return best.categoryInfo;
  }

  return null;
}

const SITE_IMAGE_PATH_FALLBACKS = [
  {
    imagePath: "istochnikipitanija/ibp",
    path: ["Джерела живлення", "Джерела безперебійного живлення (ДБЖ)"],
    urls: [
      "https://ultra-svet.com/dzherela-zhyvlennya",
      "https://ultra-svet.com/dzherela-zhyvlennya/dzherela-bezperebijnogo-zhyvlennya-dbzh",
    ],
  },
  {
    imagePath: "elektromontazh/krepezhi-dlya-gofri-i-kabelya/krepezhremeshkovyj",
    path: [
      "Все для електромонтажу",
      "Кріплення для гофри та кабелю",
      "Кріплення ремінцеве",
    ],
    urls: [
      "https://ultra-svet.com/vse-dlya-elektromontazha",
      "https://ultra-svet.com/vse-dlya-elektromontazha/krepezhi-dlya-gofri-i-kabelya",
      "https://ultra-svet.com/vse-dlya-elektromontazha/krepezhi-dlya-gofri-i-kabelya/krepyozh-remeshkovyj",
    ],
  },
];

function fallbackFromKnownSiteImagePath(product) {
  const key = imagePathKey(product);
  if (!key) return null;

  const fallback = SITE_IMAGE_PATH_FALLBACKS.find(
    (entry) => key === entry.imagePath || key.endsWith(`/${entry.imagePath}`)
  );

  return fallback ? categoryFromPath(fallback.path, fallback.urls) : null;
}

function fallbackFromStored(product, categoryUrlIndex, imagePathIndex) {
  const indexed =
    categoryUrlIndex.get(normalizeUrl(product.subcategoryUrl)) ||
    categoryUrlIndex.get(normalizeUrl(product.categoryUrl)) ||
    categoryUrlIndex.get(normalizeUrl(product.sourceCategoryUrl));
  if (indexed) return indexed;

  const fromPath = categoryFromPath(
    Array.isArray(product.categoryPath) ? product.categoryPath : [],
    Array.isArray(product.categoryPathUrls) ? product.categoryPathUrls : []
  );
  if (fromPath) return fromPath;

  const category = String(
    product.category || product.sourceCategory || product.parsedCategory || ""
  ).trim();
  const subcategory = String(
    product.subcategory || product.sourceSubcategory || product.parsedSubcategory || ""
  ).trim();

  if (category && !isBadCategory(category)) {
    return categoryFromPath(
      subcategory && subcategory !== OTHER_SUBCATEGORY
        ? [category, subcategory]
        : [category],
      [product.categoryUrl || product.sourceCategoryUrl, product.subcategoryUrl]
    );
  }

  const fromKnownSiteImagePath = fallbackFromKnownSiteImagePath(product);
  if (fromKnownSiteImagePath) return fromKnownSiteImagePath;

  const fromImagePath = fallbackFromImagePath(product, imagePathIndex);
  if (fromImagePath) return fromImagePath;

  return null;
}

function applyCategory(product, categoryInfo) {
  product.category = categoryInfo.category;
  product.subcategory = categoryInfo.subcategory;
  product.categoryUrl = categoryInfo.categoryUrl;
  product.subcategoryUrl = categoryInfo.subcategoryUrl;
  product.categoryPath = categoryInfo.categoryPath;
  product.categoryPathUrls = categoryInfo.categoryPathUrls;
  product.breadcrumbs = categoryInfo.breadcrumbs;
}

async function worker(queue, fn) {
  while (queue.length) {
    const item = queue.shift();
    await fn(item);
  }
}

function withTimeout(promise, ms, message) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), ms);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

async function main() {
  const args = parseArgs();
  const payload = readProductsPayload(args.productsFile);
  const categoryUrlIndex = buildCategoryUrlIndex(payload.products);
  const imagePathIndex = buildImagePathIndex(payload.products);
  const allCandidates = payload.products.filter(isRepairCandidate);
  const candidates = allCandidates.slice(0, args.limit);
  const processedTarget = candidates.length;
  const logger = createLogger({ silent: true });
  const unresolved = [];
  const repaired = [];
  let parsedFromPage = 0;
  let repairedFromFallback = 0;
  let errors = 0;

  async function repair(product) {
    const url = String(product.url || product.sourceUrl || "").trim();
    if (!url) {
      const fallback = fallbackFromStored(product, categoryUrlIndex, imagePathIndex);
      if (fallback) {
        applyCategory(product, fallback);
        repaired.push(product);
        repairedFromFallback += 1;
        return;
      }
      unresolved.push(toUnresolved(product, "missing_url"));
      return;
    }

    try {
      const parsed = await withTimeout(
        parseProductPage(url, {
          retries: args.retries,
          delay: args.delay,
          logger,
        }),
        20000,
        "repair parse timeout"
      );
      const categoryInfo =
        categoryFromParsed(parsed) ||
        fallbackFromStored(product, categoryUrlIndex, imagePathIndex);

      if (!categoryInfo) {
        unresolved.push(toUnresolved(product, "category_not_found"));
        return;
      }

      applyCategory(product, categoryInfo);
      repaired.push(product);
      if (categoryFromParsed(parsed)) parsedFromPage += 1;
      else repairedFromFallback += 1;
    } catch (error) {
      errors += 1;
      const fallback = fallbackFromStored(product, categoryUrlIndex, imagePathIndex);
      if (fallback) {
        applyCategory(product, fallback);
        repaired.push(product);
        repairedFromFallback += 1;
      } else {
        unresolved.push(toUnresolved(product, error.message));
      }
    }

    await sleep(args.delay);
  }

  await Promise.all(
    Array.from({ length: Math.min(args.concurrency, candidates.length || 1) }, () =>
      worker(candidates, repair)
    )
  );

  const remaining = payload.products.filter(isRepairCandidate);
  const stats = {
    generatedAt: new Date().toISOString(),
    beforeUncategorized: allCandidates.length,
    processed: processedTarget,
    repaired: repaired.length,
    parsedFromPage,
    repairedFromFallback,
    errors,
    remainingUncategorized: remaining.length,
    unresolved,
  };

  if (repaired.length > 0) {
    payload.generatedAt = new Date().toISOString();
    payload.total = payload.products.length;
    writeFileSync(args.productsFile, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
  }

  writeFileSync(args.logFile, `${JSON.stringify(stats, null, 2)}\n`, "utf-8");

  console.log(`Было "Без категории": ${stats.beforeUncategorized}`);
  console.log(`Исправлено: ${stats.repaired}`);
  console.log(`Осталось: ${stats.remainingUncategorized}`);
  console.log(`Из breadcrumbs карточки: ${stats.parsedFromPage}`);
  console.log(`Из categoryUrl/исходной категории: ${stats.repairedFromFallback}`);
  console.log(`Ошибок загрузки: ${stats.errors}`);
  if (stats.unresolved.length > 0) {
    console.log("Не удалось исправить:");
    for (const item of stats.unresolved.slice(0, 30)) {
      console.log(`- ${item.article || "без артикула"} | ${item.title} | ${item.reason}`);
    }
  }
  console.log(`Лог: ${args.logFile}`);
}

function toUnresolved(product, reason) {
  return {
    title: product.title || product.name || "",
    article: product.article || product.sku || "",
    category: product.category || "",
    subcategory: product.subcategory || "",
    categoryPath: product.categoryPath || [],
    categoryUrl: product.categoryUrl || "",
    url: product.url || product.sourceUrl || "",
    reason,
  };
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
