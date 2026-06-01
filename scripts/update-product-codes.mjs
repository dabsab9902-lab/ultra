import { existsSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import {
  extractBrandCode,
  isInternalSiteArticle,
  resolveDisplayArticle,
} from "./parser/product-code.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_FILE = join(__dirname, "..", "products.json");
const NO_CODE = "Без артикула";

function readProductsFile() {
  if (!existsSync(OUT_FILE)) {
    throw new Error("products.json not found");
  }

  const parsed = JSON.parse(readFileSync(OUT_FILE, "utf-8"));
  if (!Array.isArray(parsed.products)) {
    throw new Error("products.json has no products array");
  }

  return parsed;
}

function isNoCode(value) {
  return String(value ?? "").trim() === NO_CODE;
}

function main() {
  const payload = readProductsFile();
  const products = payload.products;
  let changed = 0;
  let hiddenSiteArticles = 0;
  let noCode = 0;

  const nextProducts = products.map((product) => {
    const originalArticle = String(product.article || product.sku || "").trim();
    const siteArticle =
      String(product.siteArticle || "").trim() ||
      (isInternalSiteArticle(originalArticle) ? originalArticle : "");

    const brandCode = extractBrandCode({
      title: product.title || product.name || "",
      url: product.url || "",
      brand: product.brand || "",
      siteArticle,
    });
    const displayArticle =
      brandCode ||
      resolveDisplayArticle({
        article: isInternalSiteArticle(product.article) ? "" : product.article,
        sku: isInternalSiteArticle(product.sku) ? "" : product.sku,
        brandCode,
        title: product.title || product.name || "",
        url: product.url || "",
        brand: product.brand || "",
        siteArticle,
      }) || NO_CODE;

    const updated = {
      ...product,
      article: displayArticle,
      sku: displayArticle,
      siteArticle,
      brandCode: brandCode || (isNoCode(displayArticle) ? "" : displayArticle),
    };

    if (siteArticle) hiddenSiteArticles += 1;
    if (isNoCode(displayArticle)) noCode += 1;
    if (
      product.article !== updated.article ||
      product.sku !== updated.sku ||
      product.siteArticle !== updated.siteArticle ||
      product.brandCode !== updated.brandCode
    ) {
      changed += 1;
    }

    return updated;
  });

  const nextPayload = {
    ...payload,
    generatedAt: new Date().toISOString(),
    products: nextProducts,
  };

  writeFileSync(OUT_FILE, `${JSON.stringify(nextPayload, null, 2)}\n`, "utf-8");

  const visibleSiteArticles = nextProducts.filter((product) => {
    const article = String(product.article || "").trim();
    const sku = String(product.sku || "").trim();
    const siteArticle = String(product.siteArticle || "").trim();
    return siteArticle && (article === siteArticle || sku === siteArticle);
  }).length;

  console.log(`Products: ${products.length}`);
  console.log(`Updated rows: ${changed}`);
  console.log(`Hidden site articles: ${hiddenSiteArticles}`);
  console.log(`Rows without brand code: ${noCode}`);
  console.log(`Visible site articles: ${visibleSiteArticles}`);
}

main();
