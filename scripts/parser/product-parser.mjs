import * as cheerio from "cheerio";
import { extractBrandFromProductPage } from "./brand.mjs";
import { extractBrandCode, resolveDisplayArticle } from "./product-code.mjs";
import { normalizeUrl } from "./url.mjs";
import { parsePrice, stripHtml } from "./text.mjs";

function readJsonLdItems(html) {
  const $ = cheerio.load(html);
  const chunks = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const text = $(el).contents().text().trim();
    if (!text) return;
    try {
      chunks.push(JSON.parse(text));
    } catch {
      // Some pages contain invalid JSON-LD. DOM selectors below are the fallback.
    }
  });

  const flat = [];
  const visit = (value) => {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value === "object") {
      flat.push(value);
      if (value["@graph"]) visit(value["@graph"]);
    }
  };
  chunks.forEach(visit);

  return flat;
}

function hasSchemaType(item, typeName) {
  const type = item?.["@type"];
  return Array.isArray(type) ? type.includes(typeName) : type === typeName;
}

function readJsonLd(html) {
  return readJsonLdItems(html).find((item) => hasSchemaType(item, "Product")) || {};
}

function extractSiteArticle($, productLd, url) {
  const ldArticle = productLd.sku || productLd.mpn || productLd.model;
  if (ldArticle) return stripHtml(String(ldArticle)).replace(/\s+/g, "");

  const candidates = [];
  $(".rm-product-center-info-item, .product-info li, .list-unstyled li").each(
    (_, el) => {
      const text = stripHtml($(el).text());
      if (/код|артикул|модель|sku|model/i.test(text)) candidates.push(text);
    }
  );

  for (const text of candidates) {
    const value =
      text.split(":").pop()?.trim() ||
      text.match(/(?:код|артикул|модель|sku|model)\s*([A-ZА-ЯІЇЄ0-9._/-]+)/i)?.[1];
    if (value && value.length <= 64) return value.replace(/\s+/g, "");
  }

  const slug = new URL(url).pathname.split("/").filter(Boolean)[0] || "item";
  return `US-${slug.slice(0, 24)}`;
}

function extractBreadcrumbsFromJsonLd($, productTitle = "", pageUrl = "") {
  const normalizedTitle = stripHtml(productTitle).toLowerCase();
  const crumbs = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    const text = $(el).contents().text().trim();
    if (!text) return;

    try {
      const chunks = [];
      const visit = (value) => {
        if (!value) return;
        if (Array.isArray(value)) {
          value.forEach(visit);
          return;
        }
        if (typeof value === "object") {
          chunks.push(value);
          if (value["@graph"]) visit(value["@graph"]);
        }
      };
      visit(JSON.parse(text));

      for (const item of chunks) {
        if (!hasSchemaType(item, "BreadcrumbList")) continue;
        const elements = Array.isArray(item.itemListElement)
          ? item.itemListElement
          : [];
        for (const element of elements) {
          const crumbItem = element.item || {};
          const title = stripHtml(
            element.name || crumbItem.name || crumbItem.title || ""
          );
          const urlValue =
            typeof crumbItem === "string"
              ? crumbItem
              : crumbItem["@id"] || crumbItem.url || "";
          const crumbUrl = normalizeUrl(urlValue, pageUrl) || "";
          if (
            title &&
            !/^(головна|главная|home)$/i.test(title) &&
            title.toLowerCase() !== normalizedTitle
          ) {
            crumbs.push({ title, url: crumbUrl });
          }
        }
      }
    } catch {
      // DOM breadcrumbs below are the fallback.
    }
  });

  return crumbs;
}

function extractBreadcrumbs($, productTitle = "", pageUrl = "") {
  const normalizedTitle = stripHtml(productTitle).toLowerCase();
  const crumbs = extractBreadcrumbsFromJsonLd($, productTitle, pageUrl);
  $(".breadcrumb a, .breadcrumbs a, .rm-breadcrumb a, .rm-breadcrumb-item a, [class*=breadcrumb] a, [class*=Breadcrumb] a").each(
    (_, el) => {
      const text = stripHtml($(el).text());
      const crumbUrl = normalizeUrl($(el).attr("href"), pageUrl) || "";
      if (
        text &&
        !/^(головна|главная|home)$/i.test(text) &&
        text.toLowerCase() !== normalizedTitle
      ) {
        crumbs.push({ title: text, url: crumbUrl });
      }
    }
  );

  if (crumbs.length === 0) {
    $(".breadcrumb li, .breadcrumbs li, .rm-breadcrumb-item, [class*=breadcrumb] li, [class*=Breadcrumb] li").each((_, el) => {
      const text = stripHtml($(el).clone().children().remove().end().text());
      if (
        text &&
        !/^(головна|главная|home)$/i.test(text) &&
        text.toLowerCase() !== normalizedTitle
      ) {
        crumbs.push({ title: text, url: "" });
      }
    });
  }

  const seen = new Set();
  return crumbs.filter((crumb) => {
    const key = `${crumb.title.toLowerCase()}\u0000${crumb.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractCategoryParts($, productTitle = "", pageUrl = "") {
  const crumbs = extractBreadcrumbs($, productTitle, pageUrl);
  const categoryCrumb = crumbs.at(0);
  const subcategoryCrumb = crumbs.length > 1 ? crumbs.at(-1) : undefined;
  const categoryPath = crumbs.map((crumb) => crumb.title).filter(Boolean);
  const categoryPathUrls = crumbs.map((crumb) => crumb.url || "");

  return {
    category: categoryCrumb?.title || "Без категории",
    subcategory: subcategoryCrumb?.title || "Другое",
    categoryUrl: categoryCrumb?.url || "",
    subcategoryUrl: subcategoryCrumb?.url || "",
    categoryPath: categoryPath.length > 0 ? categoryPath : ["Без категории"],
    categoryPathUrls:
      categoryPath.length > 0 ? categoryPathUrls : [""],
    breadcrumbs: crumbs,
  };
}

function extractImage($, productLd, url) {
  const ldImage = Array.isArray(productLd.image)
    ? productLd.image[0]
    : productLd.image;
  const image =
    ldImage ||
    $('meta[property="og:image"]').attr("content") ||
    $(".thumbnails a img, .rm-product-image img, #content .thumbnail img")
      .first()
      .attr("src") ||
    $(".product-thumb img, img.img-responsive").first().attr("src") ||
    "";
  return normalizeUrl(image, url) || image || "";
}

function extractAvailability($, offer = {}) {
  const schemaAvailability = String(offer.availability || "");
  if (/OutOfStock|SoldOut|нет\s*в\s*налич/i.test(schemaAvailability)) {
    return "Нет в наличии";
  }
  if (/PreOrder|BackOrder|под\s*заказ/i.test(schemaAvailability)) {
    return "Под заказ";
  }
  if (/InStock|LimitedAvailability|в\s*налич/i.test(schemaAvailability)) {
    return "В наличии";
  }

  const text = stripHtml(
    [
      $(".stock, .availability, .product-stock").first().text(),
      $(".rm-product-center-info-item").text(),
      $(".list-unstyled").text(),
    ].join(" ")
  ).toLowerCase();

  if (/нет\s+в\s+налич|немає\s+в\s+наявност|out\s+of\s+stock|законч/i.test(text)) {
    return "Нет в наличии";
  }
  if (/под\s+заказ|під\s+замовлення|pre-?order/i.test(text)) {
    return "Под заказ";
  }
  if (/в\s+налич|є\s+в\s+наявност|на\s+склад|in\s+stock/i.test(text)) {
    return "В наличии";
  }

  return "Не указано";
}

export function parseProductFromHtml(html, url) {
  const $ = cheerio.load(html);
  const productLd = readJsonLd(html);

  const title = stripHtml(
    productLd.name ||
      $("h1").first().text() ||
      $('meta[property="og:title"]').attr("content") ||
      $("title").text().replace(/^Купить\s+/i, "").split(" за ")[0]
  );

  const siteArticle = extractSiteArticle($, productLd, url);
  const offer = Array.isArray(productLd.offers)
    ? productLd.offers[0]
    : productLd.offers || {};
  const price =
    parsePrice(offer.price) ||
    parsePrice($(".rm-product-center-price > span").first().text()) ||
    parsePrice($(".rm-product-mobile-fixed-price-new").first().text()) ||
    parsePrice($(".price, .product-price").first().text());
  const availability = extractAvailability($, offer);
  const image = extractImage($, productLd, url);
  const brand = extractBrandFromProductPage($, productLd, title);
  const brandCode = extractBrandCode({ title, url, brand, siteArticle });
  const article = resolveDisplayArticle({
    article: brandCode,
    sku: brandCode,
    brandCode,
    title,
    url,
    brand,
    siteArticle,
  });
  const {
    category,
    subcategory,
    categoryUrl,
    subcategoryUrl,
    categoryPath,
    categoryPathUrls,
    breadcrumbs,
  } = extractCategoryParts($, title, url);

  return {
    title,
    article,
    siteArticle,
    brandCode,
    image,
    category,
    subcategory,
    categoryUrl,
    subcategoryUrl,
    categoryPath,
    categoryPathUrls,
    breadcrumbs,
    brand,
    price,
    availability,
    stockStatus: availability,
    url,
    name: title,
    sku: article,
    imageUrl: image,
  };
}
