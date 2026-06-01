import * as cheerio from "cheerio";
import { normalizeUrl, isLikelyCategoryUrl, isLikelyProductUrl } from "./url.mjs";

const PRODUCT_SELECTORS = [
  ".product-thumb a[href]",
  ".product-layout a[href]",
  ".rm-module-item a[href]",
  ".rm-product-thumb a[href]",
  ".caption a[href]",
  ".name a[href]",
  "h4 a[href]",
];

export function parseCategoryPage(html, pageUrl) {
  const $ = cheerio.load(html);
  const products = new Set();
  const categories = new Set();

  for (const selector of PRODUCT_SELECTORS) {
    $(selector).each((_, el) => {
      const url = normalizeUrl($(el).attr("href"), pageUrl);
      if (url && isLikelyProductUrl(url)) products.add(url);
    });
  }

  $("a[href]").each((_, el) => {
    const url = normalizeUrl($(el).attr("href"), pageUrl);
    if (!url || url === pageUrl) return;
    if (isLikelyProductUrl(url)) products.add(url);
    else if (isLikelyCategoryUrl(url)) categories.add(url);
  });

  return {
    products: [...products],
    categories: [...categories],
  };
}

export const extractLinks = parseCategoryPage;
