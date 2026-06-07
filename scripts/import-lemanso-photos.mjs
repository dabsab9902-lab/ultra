import axios from "axios";
import * as cheerio from "cheerio";
import https from "https";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";

const ROOT = process.cwd();
const PRODUCTS_FILE = join(ROOT, "products.json");
const AGENT_PRODUCTS_FILE = join(ROOT, "data", "agentplus-tree-products.json");
const SOURCES_FILE = join(ROOT, "scripts", "photo-map", "lemanso-photo-sources.json");
const PHOTO_MAP_FILE = join(ROOT, "scripts", "photo-map", "lemanso-photo-map.csv");
const REPORT_FILE = join(ROOT, "reports", "lemanso-photo-import-report.json");
const REPORT_CSV_FILE = join(ROOT, "reports", "lemanso-photo-import-report.csv");
const LIMIT_ARG = process.argv[2] || "all";
const LIMIT = LIMIT_ARG.toLocaleLowerCase("uk") === "all"
  ? Number(process.env.LEMANSO_PHOTO_LIMIT || 0) || Infinity
  : Number(process.env.LEMANSO_PHOTO_LIMIT || LIMIT_ARG || 100);
const CONCURRENCY = Math.max(
  1,
  Math.min(4, Number(process.env.LEMANSO_PHOTO_CONCURRENCY || 3) || 3)
);
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const INSECURE_HTTPS_AGENT = new https.Agent({ rejectUnauthorized: false });

for (const file of [PRODUCTS_FILE, AGENT_PRODUCTS_FILE, SOURCES_FILE]) {
  if (!existsSync(file)) throw new Error(`Missing ${file}`);
}
ensurePhotoMapFile();

const productsPayload = JSON.parse(readFileSync(PRODUCTS_FILE, "utf-8"));
const agentPayload = JSON.parse(readFileSync(AGENT_PRODUCTS_FILE, "utf-8"));
const sourceConfig = JSON.parse(readFileSync(SOURCES_FILE, "utf-8"));
const manualPhotoMap = readManualPhotoMap(PHOTO_MAP_FILE);
const pwaProducts = Array.isArray(productsPayload.products) ? productsPayload.products : [];
const pwaById = new Map(pwaProducts.map((product, index) => [String(index + 1), product]));
const pwaPhotoByArticle = buildPwaPhotoIndex(pwaProducts);
const agentRows = Object.values(agentPayload.productsByGroup || {}).flat();
const agentByGuid = new Map(
  agentRows
    .filter((row) => row.agentGuid)
    .map((row) => [String(row.agentGuid).toUpperCase(), row])
);

const analysis = analyzeLemanso(agentRows);
const allCandidates = buildLemansoCandidates(agentRows);
const candidates = Number.isFinite(LIMIT) ? allCandidates.slice(0, LIMIT) : allCandidates;
const beforeStats = getCandidatePhotoStats(candidates);

const report = {
  generatedAt: new Date().toISOString(),
  brand: "LEMANSO",
  mode: "configured_sources_strict_article",
  limit: LIMIT,
  concurrency: CONCURRENCY,
  analysis,
  candidateRows: candidates.length,
  totalEligibleRows: allCandidates.length,
  alreadyHadPhotoBefore: beforeStats.withPhoto,
  fallbackBefore: beforeStats.withoutPhoto,
  processed: 0,
  found: 0,
  notFound: 0,
  skipped: 0,
  updatedPwa: 0,
  updatedAgent: 0,
  withPhotoAfter: 0,
  remainingFallback: 0,
  sources: sourceConfig.sources.map((source) => ({
    id: source.id,
    name: source.name,
    enabled: source.enabled !== false,
    reason: source.disabledReason || "",
  })),
  sourceStats: {},
  examplesFound: [],
  examplesSkipped: [],
  items: [],
};

for (const source of sourceConfig.sources) {
  report.sourceStats[source.id] = {
    searchPages: 0,
    productPages: 0,
    articleMatches: 0,
    brandMatches: 0,
    imagesFound: 0,
    errors: 0,
  };
}

let completedCandidates = 0;
await runCandidatePool(candidates, CONCURRENCY);

const afterStats = getCandidatePhotoStats(candidates);
report.remainingFallback = afterStats.withoutPhoto;
report.withPhotoAfter = afterStats.withPhoto;

productsPayload.lemansoPhotoImport = {
  generatedAt: report.generatedAt,
  processed: report.processed,
  found: report.found,
  source: "configured product sources + manual CSV + PWA exact article",
};
agentPayload.lemansoPhotoImport = productsPayload.lemansoPhotoImport;

writeFileSync(PRODUCTS_FILE, `${JSON.stringify(productsPayload, null, 2)}\n`, "utf-8");
writeFileSync(AGENT_PRODUCTS_FILE, `${JSON.stringify(agentPayload)}\n`, "utf-8");
mkdirSync(dirname(REPORT_FILE), { recursive: true });
writeFileSync(REPORT_FILE, `${JSON.stringify(report, null, 2)}\n`, "utf-8");
writeReportCsv(REPORT_CSV_FILE, report.items);

console.log(JSON.stringify(reportSummary(report), null, 2));

async function processCandidate(candidate) {
  const agentGuid = clean(candidate.agent_guid).toUpperCase();
  const agentRow = agentByGuid.get(agentGuid);
  const article = clean(candidate.article);
  const name = clean(candidate.name);

  if (!agentRow) {
    record("skipped", candidate, "agent_row_not_found");
    return;
  }
  if (!article) {
    record("skipped", candidate, "article_not_found");
    return;
  }

  const pwaProduct = agentRow.pwaProductId ? pwaById.get(String(agentRow.pwaProductId)) : null;
  if (hasExistingPhoto(agentRow, pwaProduct)) {
    record("skipped", candidate, "already_has_photo");
    return;
  }

  report.processed += 1;
  const result = await findPhoto({ article, name });

  if (!result) {
    report.notFound += 1;
    const item = makeReportItem(candidate, {
      status: "not_found",
      reason: "no_strict_source_match",
    });
    report.items.push(item);
    if (report.examplesSkipped.length < 20) report.examplesSkipped.push(item);
    return;
  }

  agentRow.imageUrl = result.imageUrl;
  agentRow.imageSource = result.pageUrl;
  agentRow.imageFoundAt = report.generatedAt;

  if (pwaProduct && !hasValidImage(pwaProduct.image || pwaProduct.imageUrl)) {
    pwaProduct.image = result.imageUrl;
    pwaProduct.imageUrl = result.imageUrl;
    pwaProduct.imageSource = result.pageUrl;
    report.updatedPwa += 1;
  }

  report.found += 1;
  report.updatedAgent += 1;
  const item = makeReportItem(candidate, {
    status: "found",
    imageUrl: result.imageUrl,
    imageSource: result.pageUrl,
    score: result.score,
    title: result.title,
    reason: result.sourceId,
  });
  report.items.push(item);
  if (report.examplesFound.length < 20) report.examplesFound.push(item);

  await sleep(150);
}

async function findPhoto(product) {
  const articleKey = normalizeArticle(product.article);
  const manual = manualPhotoMap.get(articleKey);
  if (manual && hasValidImage(manual.imageUrl)) {
    report.sourceStats["manual-map"].imagesFound += 1;
    return {
      imageUrl: manual.imageUrl,
      pageUrl: manual.sourceUrl || manual.imageUrl,
      title: "manual photo map",
      score: 100,
      sourceId: "manual-map",
    };
  }

  const pwaMatch = pwaPhotoByArticle.get(articleKey);
  if (pwaMatch) {
    report.sourceStats["pwa-catalog"].articleMatches += 1;
    report.sourceStats["pwa-catalog"].brandMatches += 1;
    report.sourceStats["pwa-catalog"].imagesFound += 1;
    return {
      imageUrl: pwaMatch.imageUrl,
      pageUrl: pwaMatch.sourceUrl,
      title: pwaMatch.title,
      score: 98,
      sourceId: "pwa-catalog",
    };
  }

  for (const source of sourceConfig.sources) {
    if (source.enabled === false || ["manual-map", "pwa-catalog"].includes(source.id)) continue;
    const pageUrls = await findProductUrlsInSource(source, product);
    for (const pageUrl of pageUrls.slice(0, source.maxProductPages || 4)) {
      if (!isAllowedHost(pageUrl, source)) continue;
      const page = await fetchProductPage(pageUrl, source);
      if (!page) continue;

      const scored = scorePage(product, page, source);
      if (!scored.articleMatched || !scored.brandMatched) continue;
      report.sourceStats[source.id].articleMatches += 1;
      report.sourceStats[source.id].brandMatches += 1;

      const imageUrl = chooseImage(page.images, pageUrl);
      if (!imageUrl) continue;

      report.sourceStats[source.id].imagesFound += 1;
      return {
        imageUrl,
        pageUrl,
        title: page.title,
        score: scored.score,
        sourceId: source.id,
      };
    }
    await sleep(source.delayMs || 120);
  }

  return null;
}

function buildLemansoCandidates(rows) {
  return rows
    .filter((row) => isActualLemanso(row) && parseStock(row.stock) > 0)
    .map((row, index) => {
      const pwa = row.pwaProductId ? pwaById.get(String(row.pwaProductId)) : null;
      const name = firstString(row.name, pwa?.name, pwa?.title);
      const article = firstString(
        row.article,
        row.sku,
        row.pwaSku,
        pwa?.article,
        pwa?.sku,
        pwa?.brandCode,
        extractArticle(name)
      );
      return {
        rank: String(index + 1),
        article,
        brand: "LEMANSO",
        name,
        agent_guid: clean(row.agentGuid),
        stock: clean(row.stock),
        price: clean(row.price),
        category_1c: Array.isArray(row.categoryPath) ? row.categoryPath.join(" / ") : "",
        has_article: article ? "yes" : "no",
        has_brand: "yes",
        has_name: name ? "yes" : "no",
      };
    })
    .filter((candidate) => {
      const row = agentByGuid.get(clean(candidate.agent_guid).toUpperCase());
      const pwa = row?.pwaProductId ? pwaById.get(String(row.pwaProductId)) : null;
      return row && !hasExistingPhoto(row, pwa);
    });
}

function analyzeLemanso(rows) {
  const pathRows = rows.filter((row) => isLemansoPathOrBrand(row));
  const actualRows = rows.filter((row) => isActualLemanso(row));
  const missing = actualRows.filter((row) => {
    const pwa = row.pwaProductId ? pwaById.get(String(row.pwaProductId)) : null;
    return !hasExistingPhoto(row, pwa);
  });
  const missingInStock = missing.filter((row) => parseStock(row.stock) > 0);
  const withCode = actualRows.filter((row) => {
    const pwa = row.pwaProductId ? pwaById.get(String(row.pwaProductId)) : null;
    return Boolean(
      firstString(row.article, row.sku, row.pwaSku, pwa?.article, pwa?.sku, extractArticle(row.name))
    );
  });
  const strongCandidates = missingInStock.filter((row) => {
    const pwa = row.pwaProductId ? pwaById.get(String(row.pwaProductId)) : null;
    return isStrongArticle(
      firstString(row.article, row.sku, row.pwaSku, pwa?.article, pwa?.sku, extractArticle(row.name))
    );
  });
  return {
    agentRowsInLemansoPathOrBrand: pathRows.length,
    actualLemansoAgentRows: actualRows.length,
    excludedOtherBrandRowsInLemansoFolder: Math.max(0, pathRows.length - actualRows.length),
    missingPhoto: missing.length,
    missingPhotoInStock: missingInStock.length,
    withArticleOrCode: withCode.length,
    strongArticleCandidates: strongCandidates.length,
  };
}

function isLemansoPathOrBrand(row) {
  const pwa = row.pwaProductId ? pwaById.get(String(row.pwaProductId)) : null;
  if (normalizeKey(row.brand || pwa?.brand) === "LEMANSO") return true;
  if (normalizeKey(row.name).includes("LEMANSO")) return true;
  return (row.categoryPath || []).some((part) => normalizeKey(part) === "LEMANSO");
}

function isActualLemanso(row) {
  const pwa = row.pwaProductId ? pwaById.get(String(row.pwaProductId)) : null;
  return normalizeKey(row.brand || pwa?.brand) === "LEMANSO" || normalizeKey(row.name).includes("LEMANSO");
}

function buildPwaPhotoIndex(products) {
  const index = new Map();
  for (const product of products) {
    const name = firstString(product.name, product.title);
    if (normalizeKey(product.brand) !== "LEMANSO" && !normalizeKey(name).includes("LEMANSO")) continue;
    const article = normalizeArticle(firstString(product.article, product.sku, product.brandCode, extractArticle(name)));
    const imageUrl = firstString(product.image, product.imageUrl);
    if (!article || !hasValidImage(imageUrl) || index.has(article)) continue;
    index.set(article, {
      imageUrl,
      sourceUrl: firstString(product.url, product.sourceUrl, "pwa-catalog"),
      title: name,
    });
  }
  return index;
}

async function findProductUrlsInSource(source, product) {
  const urls = [];
  for (const searchUrl of source.searchUrls || []) {
    const url = searchUrl.replace("{article}", encodeURIComponent(product.article));
    const page = await fetchSearchPage(url, source);
    if (!page) continue;
    for (const link of extractArticleLinks(page.html, page.url, product, source)) urls.push(link);
  }

  for (const indexFile of source.urlIndexFiles || []) {
    const fullPath = join(ROOT, indexFile);
    if (!existsSync(fullPath)) continue;
    const payload = JSON.parse(readFileSync(fullPath, "utf-8"));
    const indexUrls = Array.isArray(payload) ? payload : payload.urls || [];
    for (const url of indexUrls) {
      if (articleAppears(`${url}`, product.article) && isAllowedHost(url, source)) urls.push(url);
    }
  }

  return dedupeUrls(urls);
}

async function fetchSearchPage(url, source) {
  try {
    const { data, request } = await axios.get(url, {
      headers: requestHeaders(),
      httpsAgent: source.allowInvalidCert ? INSECURE_HTTPS_AGENT : undefined,
      maxRedirects: source.maxRedirects ?? 4,
      timeout: source.timeoutMs || 10000,
      validateStatus: (status) => status >= 200 && status < 400,
    });
    report.sourceStats[source.id].searchPages += 1;
    return { url: request?.res?.responseUrl || url, html: String(data) };
  } catch {
    report.sourceStats[source.id].errors += 1;
    return null;
  }
}

async function fetchProductPage(url, source) {
  try {
    const { data, request } = await axios.get(url, {
      headers: requestHeaders(),
      httpsAgent: source.allowInvalidCert ? INSECURE_HTTPS_AGENT : undefined,
      maxRedirects: source.maxRedirects ?? 4,
      timeout: source.timeoutMs || 10000,
      validateStatus: (status) => status >= 200 && status < 400,
    });
    report.sourceStats[source.id].productPages += 1;
    const finalUrl = request?.res?.responseUrl || url;
    const $ = cheerio.load(data);
    const images = [];
    addImage(images, $('meta[property="og:image"]').attr("content"));
    addImage(images, $('meta[name="twitter:image"]').attr("content"));
    addImage(images, $('link[rel="image_src"]').attr("href"));
    $('script[type="application/ld+json"]').each((_, element) => {
      try {
        const parsed = JSON.parse($(element).text());
        for (const item of Array.isArray(parsed) ? parsed : [parsed]) {
          const image = item?.image;
          if (Array.isArray(image)) image.forEach((entry) => addImage(images, entry));
          else addImage(images, image);
        }
      } catch {
        // Ignore invalid JSON-LD.
      }
    });
    $("img").each((_, image) => {
      addImage(
        images,
        $(image).attr("data-src") ||
          $(image).attr("data-original") ||
          $(image).attr("data-lazy-src") ||
          $(image).attr("data-srcset")?.split(/\s+/)[0] ||
          $(image).attr("src")
      );
    });
    return {
      url: finalUrl,
      title: $("title").text().replace(/\s+/g, " ").trim(),
      text: $("body").text().replace(/\s+/g, " ").slice(0, 14000),
      images: images.map((image) => resolveUrl(image, finalUrl)).filter(Boolean),
    };
  } catch {
    report.sourceStats[source.id].errors += 1;
    return null;
  }
}

function extractArticleLinks(html, baseUrl, product, source) {
  const $ = cheerio.load(html);
  const links = [];
  $("a").each((_, element) => {
    const href = resolveUrl($(element).attr("href") || "", baseUrl);
    if (!href || !isAllowedHost(href, source)) return;
    const text = $(element).text().replace(/\s+/g, " ").trim();
    const haystack = `${href} ${text}`;
    if (!articleAppears(haystack, product.article)) return;
    if (isSearchPage(href)) return;
    if (source.productPathHints?.length) {
      const path = safePath(href).toLowerCase();
      const hinted = source.productPathHints.some((hint) => path.includes(String(hint).toLowerCase()));
      if (!hinted && !articleAppears(path, product.article)) return;
    }
    links.push(href);
  });
  return dedupeUrls(links);
}

function scorePage(product, page, source) {
  const article = normalizeArticle(product.article);
  const pageTitle = normalizeArticle(page.title);
  const pageText = normalizeArticle(page.text);
  const pageUrl = normalizeArticle(page.url);
  const brandText = normalizeKey(`${page.title} ${page.text} ${page.url}`);
  const articleMatched = pageTitle.includes(article) || pageText.includes(article) || pageUrl.includes(article);
  const brandMatched = brandText.includes("LEMANSO");
  let score = 0;
  if (articleMatched) score += 48;
  if (pageTitle.includes(article)) score += 18;
  if (pageUrl.includes(article)) score += 12;
  if (brandMatched) score += 18;
  if (source.priority) score += Number(source.priority);
  if (page.images.length > 0) score += 6;
  return { score, articleMatched, brandMatched };
}

function chooseImage(images, pageUrl) {
  const unique = [...new Set(images.map((image) => clean(image)).filter(Boolean))];
  const valid = unique.filter((image) => isGoodImageUrl(image));
  valid.sort((a, b) => imageScore(b, pageUrl) - imageScore(a, pageUrl));
  return valid[0] || "";
}

function isGoodImageUrl(url) {
  const lower = url.toLowerCase();
  if (!/^https?:\/\//.test(lower)) return false;
  if (/\.(svg|gif)(\?|#|$)/.test(lower)) return false;
  if (/(logo|sprite|icon|placeholder|no[-_]image|noimage|delivery|payment|youtube|favicon|banner|avatar|wishlist|compare|cart|flag)/i.test(lower)) return false;
  if (/(\/design\/|\/brands?\/|\/categories?\/|\/publications?\/|\/media\/img\/)/i.test(lower)) return false;
  return /\.(jpe?g|png|webp)(\?|#|$)/i.test(lower) || /cdn\.27\.ua/i.test(lower);
}

function imageScore(imageUrl, pageUrl) {
  let score = 0;
  const lower = imageUrl.toLowerCase();
  if (/\/(product|products|catalog|shop|image|tovari|files)\//i.test(lower)) score += 10;
  if (/cdn\.27\.ua|\/sc--media--prod\//i.test(lower)) score += 8;
  if (/w\d{3,4}_h\d{3,4}|[._-](500|600|700|800)x(500|600|700|800)/i.test(lower)) score += 6;
  if (safeHost(imageUrl) === safeHost(pageUrl)) score += 4;
  if (/\.(jpe?g|webp)(\?|#|$)/i.test(lower)) score += 3;
  if (/thumb|small|120x60|80x80|64x64/i.test(lower)) score -= 8;
  return score;
}

async function runCandidatePool(list, concurrency) {
  console.error(`[lemanso] start candidates=${list.length} concurrency=${concurrency}`);
  let nextIndex = 0;
  const workerCount = Math.min(concurrency, Math.max(1, list.length));
  const workers = Array.from({ length: workerCount }, async () => {
    while (nextIndex < list.length) {
      const candidate = list[nextIndex];
      nextIndex += 1;
      try {
        await processCandidate(candidate);
      } catch (error) {
        record("skipped", candidate, `unexpected_error:${clean(error?.message || error)}`);
      } finally {
        completedCandidates += 1;
        if (completedCandidates % 25 === 0 || completedCandidates === list.length) {
          console.error(
            `[lemanso] ${completedCandidates}/${list.length} done; found=${report.found}; skipped=${report.skipped}; notFound=${report.notFound}`
          );
        }
      }
    }
  });
  await Promise.all(workers);
}

function getCandidatePhotoStats(rows) {
  let withPhoto = 0;
  let withoutPhoto = 0;
  for (const candidate of rows) {
    const row = agentByGuid.get(clean(candidate.agent_guid).toUpperCase());
    const pwaProduct = row?.pwaProductId ? pwaById.get(String(row.pwaProductId)) : null;
    if (row && hasExistingPhoto(row, pwaProduct)) withPhoto += 1;
    else withoutPhoto += 1;
  }
  return { withPhoto, withoutPhoto };
}

function hasExistingPhoto(agentRow, pwaProduct) {
  return (
    hasValidImage(agentRow.imageUrl) ||
    hasValidImage(agentRow.image) ||
    hasValidImage(pwaProduct?.image) ||
    hasValidImage(pwaProduct?.imageUrl)
  );
}

function hasValidImage(value) {
  const raw = clean(value);
  return Boolean(raw && /^https?:\/\//i.test(raw) && !raw.includes("product-fallback.svg"));
}

function isStrongArticle(value) {
  const key = normalizeArticle(value);
  if (!key || key.length < 4) return false;
  if (/^(set|new|pro|led)$/i.test(clean(value))) return false;
  return /\d/.test(key) || key.length >= 6;
}

function extractArticle(name) {
  const text = clean(name);
  const taggedCode = text.match(/(?:article|art|code|sku)[:\s]+([\p{L}0-9][\p{L}0-9./-]{2,})/iu);
  if (taggedCode) return taggedCode[1];
  const afterLemanso = text.match(/LEMANSO["\s]*([A-Z0-9][A-Z0-9./-]{2,})\b/i);
  if (afterLemanso) return afterLemanso[1];
  const alphaAtEnd = text.match(/(\b[\p{L}]{1,10}[- ]?\d{2,8}[\p{L}0-9-]*\b)\s*$/iu);
  if (alphaAtEnd) return alphaAtEnd[1].replace(/\s+/g, "");
  const numericAtEnd = text.match(/(\b\d{3,8}\b)\s*$/iu);
  if (numericAtEnd) return numericAtEnd[1];
  const numericComplex = text.match(/(\b\d{1,4}(?:[-/]\d{2,6}){1,4}[\p{L}0-9-]*\b)\s*$/iu);
  if (numericComplex) return numericComplex[1];
  const allCodes = Array.from(text.matchAll(/\b[\p{L}]{1,10}[- ]?\d{2,8}[\p{L}0-9-]*\b/giu)).map((match) => match[0].replace(/\s+/g, ""));
  if (allCodes.length) return allCodes.at(-1) || "";
  const numericCodes = Array.from(text.matchAll(/\b\d{3,8}\b/g)).map((match) => match[0]);
  return numericCodes.at(-1) || "";
}

function readManualPhotoMap(file) {
  const map = new Map();
  if (!existsSync(file)) return map;
  for (const row of readCsv(file)) {
    const article = normalizeArticle(row.article);
    const imageUrl = clean(row.imageUrl);
    const sourceUrl = clean(row.sourceUrl);
    if (!article || !imageUrl) continue;
    map.set(article, { imageUrl, sourceUrl });
  }
  return map;
}

function ensurePhotoMapFile() {
  mkdirSync(dirname(PHOTO_MAP_FILE), { recursive: true });
  if (!existsSync(PHOTO_MAP_FILE)) writeFileSync(PHOTO_MAP_FILE, "article,imageUrl,sourceUrl\n", "utf-8");
}

function requestHeaders() {
  return {
    "User-Agent": USER_AGENT,
    "Accept-Language": "uk-UA,uk;q=0.9,ru;q=0.8,en;q=0.6",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  };
}

function isAllowedHost(url, source) {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return (source.hostnames || []).some((allowed) => {
      const normalized = String(allowed).toLowerCase().replace(/^www\./, "");
      return host === normalized || host.endsWith(`.${normalized}`);
    });
  } catch {
    return false;
  }
}

function isSearchPage(url) {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.toLowerCase();
    return path.includes("search") || path.includes("ua-search") || parsed.searchParams.has("search") || parsed.searchParams.has("q");
  } catch {
    return false;
  }
}

function dedupeUrls(urls) {
  const seen = new Set();
  const result = [];
  for (const url of urls) {
    const normalized = normalizeUrl(url);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    return parsed.href;
  } catch {
    return "";
  }
}

function isAllowedArticleUrl(url, article) {
  return articleAppears(url, article);
}

function articleAppears(value, article) {
  const normalizedArticle = normalizeArticle(article);
  if (!normalizedArticle) return false;
  return normalizeArticle(value).includes(normalizedArticle);
}

function normalizeArticle(value) {
  return clean(value).toLocaleLowerCase("uk").replace(/[^\p{L}\p{N}]+/gu, "");
}

function normalizeKey(value) {
  return clean(value).toLocaleUpperCase("uk").replace(/[^\p{L}\p{N}]+/gu, "");
}

function safeHost(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function safePath(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return "";
  }
}

function addImage(list, value) {
  if (typeof value === "string" && value.trim()) list.push(value.trim());
}

function resolveUrl(value, base) {
  try {
    return new URL(value, base).href;
  } catch {
    return "";
  }
}

function readCsv(file) {
  const raw = readFileSync(file, "utf-8").trim();
  if (!raw) return [];
  const lines = raw.split(/\r?\n/);
  const headers = parseCsvLine(lines[0]);
  return lines
    .slice(1)
    .filter((line) => line.trim())
    .map((line) => Object.fromEntries(parseCsvLine(line).map((value, index) => [headers[index], value])));
}

function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && quoted && line[index + 1] === '"') {
      current += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === "," && !quoted) {
      cells.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current);
  return cells;
}

function writeReportCsv(file, items) {
  const columns = ["status", "article", "brand", "name", "agentGuid", "stock", "imageUrl", "imageSource", "score", "reason"];
  const lines = [columns.map(csvCell).join(",")];
  for (const item of items) lines.push(columns.map((column) => csvCell(item[column] ?? "")).join(","));
  writeFileSync(file, `${lines.join("\n")}\n`, "utf-8");
}

function makeReportItem(candidate, extra) {
  return {
    status: extra.status,
    article: clean(candidate.article),
    brand: clean(candidate.brand),
    name: clean(candidate.name),
    agentGuid: clean(candidate.agent_guid),
    stock: clean(candidate.stock),
    imageUrl: extra.imageUrl || "",
    imageSource: extra.imageSource || "",
    score: extra.score || "",
    title: extra.title || "",
    reason: extra.reason || "",
  };
}

function record(status, candidate, reason) {
  report[status] += 1;
  const item = makeReportItem(candidate, { status, reason });
  report.items.push(item);
  if (status === "skipped" && report.examplesSkipped.length < 20) report.examplesSkipped.push(item);
}

function reportSummary(input) {
  return {
    generatedAt: input.generatedAt,
    brand: input.brand,
    mode: input.mode,
    candidateRows: input.candidateRows,
    totalEligibleRows: input.totalEligibleRows,
    analysis: input.analysis,
    processed: input.processed,
    found: input.found,
    notFound: input.notFound,
    skipped: input.skipped,
    withPhotoAfter: input.withPhotoAfter,
    remainingFallback: input.remainingFallback,
    updatedPwa: input.updatedPwa,
    updatedAgent: input.updatedAgent,
    sourceStats: input.sourceStats,
    examplesFound: input.examplesFound.slice(0, 5),
    examplesSkipped: input.examplesSkipped.slice(0, 5),
    report: REPORT_FILE,
    csv: REPORT_CSV_FILE,
  };
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return "";
}

function parseStock(value) {
  const number = Number(String(value ?? 0).replace(",", "."));
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
