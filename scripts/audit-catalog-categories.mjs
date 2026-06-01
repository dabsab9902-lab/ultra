import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const PRODUCTS_FILE = join(process.cwd(), "products.json");
const REPORT_FILE = join(process.cwd(), "data", "catalog-category-audit.json");
const UNCATEGORIZED = "Без категории";
const OTHER_SUBCATEGORY = "Другое";

function readProducts() {
  const payload = JSON.parse(readFileSync(PRODUCTS_FILE, "utf-8"));
  return Array.isArray(payload.products) ? payload.products : [];
}

function normalizeKey(value) {
  return String(value ?? "").trim().toLocaleLowerCase("ru");
}

function hasAny(text, words) {
  const normalized = normalizeKey(text);
  return words.some((word) => normalized.includes(normalizeKey(word)));
}

function getBreadcrumbPath(product) {
  return Array.isArray(product.breadcrumbs)
    ? product.breadcrumbs
        .map((crumb) => String(crumb?.title || "").trim())
        .filter(Boolean)
    : [];
}

function getCategoryPath(product) {
  if (Array.isArray(product.categoryPath) && product.categoryPath.length > 0) {
    return product.categoryPath.map((entry) => String(entry).trim()).filter(Boolean);
  }
  const breadcrumbs = getBreadcrumbPath(product);
  if (breadcrumbs.length > 0) return breadcrumbs;
  return [UNCATEGORIZED];
}

function buildDuplicateReport(products, field) {
  const map = new Map();
  for (const product of products) {
    const key = normalizeKey(product[field]);
    if (!key) continue;
    const list = map.get(key) ?? [];
    list.push({
      title: product.title || product.name || "",
      article: product.article || product.sku || "",
      url: product.url || "",
    });
    map.set(key, list);
  }

  const duplicates = Array.from(map.entries())
    .filter(([, items]) => items.length > 1)
    .map(([value, items]) => ({
      value,
      count: items.length,
      items: items.slice(0, 10),
    }))
    .sort((a, b) => b.count - a.count);

  return {
    duplicateKeys: duplicates.length,
    duplicateItems: duplicates.reduce((sum, item) => sum + item.count, 0),
    examples: duplicates.slice(0, 50),
  };
}

function findSuspiciousPlacement(product, categoryPath) {
  const title = product.title || product.name || "";
  const pathText = categoryPath.join(" / ");

  if (
    hasAny(title, ["звонок", "дзвінок", "дзвонок"]) &&
    hasAny(pathText, ["автомат", "вимикач"])
  ) {
    return "bell_inside_breakers";
  }

  if (hasAny(title, ["вилка", "вилки"]) && hasAny(pathText, ["розет"])) {
    return "plug_inside_sockets";
  }

  if (
    hasAny(title, ["пылесос", "пилосос", "vacuum"]) &&
    hasAny(pathText, ["кабель", "провод"])
  ) {
    return "vacuum_inside_cable";
  }

  if (
    hasAny(title, ["пылесос", "пилосос", "вентилятор", "обогрев", "обігрівач"]) &&
    hasAny(pathText, ["кабель", "провод", "автомат", "низьковольт", "високовольт"])
  ) {
    return "household_inside_electrical_core";
  }

  return null;
}

function audit() {
  const products = readProducts();
  const suspicious = [];
  const suspiciousPlacements = [];
  let withFullCategoryPath = 0;
  let withoutCategory = 0;
  let withoutBreadcrumbs = 0;
  let withoutPhoto = 0;
  let withoutPrice = 0;
  let withoutArticle = 0;

  for (const product of products) {
    const breadcrumbPath = getBreadcrumbPath(product);
    const categoryPath = getCategoryPath(product);
    const category = String(product.category || "").trim();
    const subcategory = String(product.subcategory || "").trim();
    const expectedCategory = breadcrumbPath[0] || UNCATEGORIZED;
    const expectedSubcategory =
      breadcrumbPath.length > 1
        ? breadcrumbPath[breadcrumbPath.length - 1]
        : OTHER_SUBCATEGORY;

    if (breadcrumbPath.length > 0) withFullCategoryPath += 1;
    else withoutBreadcrumbs += 1;
    if (categoryPath[0] === UNCATEGORIZED) {
      withoutCategory += 1;
    }
    if (!String(product.image || product.imageUrl || "").trim()) withoutPhoto += 1;
    if (!Number(product.price)) withoutPrice += 1;
    if (!String(product.article || product.sku || "").trim()) withoutArticle += 1;

    const suspiciousPlacement = findSuspiciousPlacement(product, categoryPath);
    if (suspiciousPlacement) {
      suspiciousPlacements.push({
        reason: suspiciousPlacement,
        title: product.title || product.name || "",
        article: product.article || product.sku || "",
        categoryPath,
        url: product.url || "",
      });
    }

    if (breadcrumbPath.length === 0 && category && category !== UNCATEGORIZED) {
      suspicious.push({
        reason: "category_without_breadcrumbs",
        title: product.title || product.name || "",
        category,
        subcategory,
        url: product.url || "",
      });
      continue;
    }

    if (breadcrumbPath.length > 0 && category !== expectedCategory) {
      suspicious.push({
        reason: "category_mismatch",
        title: product.title || product.name || "",
        category,
        expectedCategory,
        path: breadcrumbPath,
        url: product.url || "",
      });
      continue;
    }

    if (breadcrumbPath.length > 0 && subcategory !== expectedSubcategory) {
      suspicious.push({
        reason: "subcategory_mismatch",
        title: product.title || product.name || "",
        subcategory,
        expectedSubcategory,
        path: breadcrumbPath,
        url: product.url || "",
      });
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    total: products.length,
    withFullCategoryPath,
    withoutCategory,
    withoutBreadcrumbs,
    suspiciousCategories: {
      count: suspicious.length,
      examples: suspicious.slice(0, 100),
    },
    suspiciousPlacements: {
      count: suspiciousPlacements.length,
      byReason: countByReason(suspiciousPlacements),
      examples: suspiciousPlacements.slice(0, 100),
    },
    duplicates: {
      url: buildDuplicateReport(products, "url"),
      siteArticle: buildDuplicateReport(products, "siteArticle"),
      article: buildDuplicateReport(products, "article"),
    },
    withoutPhoto,
    withoutPrice,
    withoutArticle,
  };

  writeFileSync(REPORT_FILE, `${JSON.stringify(report, null, 2)}\n`, "utf-8");
  console.log(`Всего товаров: ${report.total}`);
  console.log(`С полным categoryPath: ${report.withFullCategoryPath}`);
  console.log(`Без категории: ${report.withoutCategory}`);
  console.log(`Без breadcrumbs: ${report.withoutBreadcrumbs}`);
  console.log(`Подозрительные категории: ${report.suspiciousCategories.count}`);
  console.log(`Подозрительные товары: ${report.suspiciousPlacements.count}`);
  console.log(`Дубли URL: ${report.duplicates.url.duplicateKeys}`);
  console.log(`Дубли siteArticle: ${report.duplicates.siteArticle.duplicateKeys}`);
  console.log(`Дубли article: ${report.duplicates.article.duplicateKeys}`);
  console.log(`Без фото: ${report.withoutPhoto}`);
  console.log(`Без цены: ${report.withoutPrice}`);
  console.log(`Без артикула: ${report.withoutArticle}`);
  console.log(`Отчет: ${REPORT_FILE}`);
}

function countByReason(items) {
  return items.reduce((acc, item) => {
    acc[item.reason] = (acc[item.reason] ?? 0) + 1;
    return acc;
  }, {});
}

audit();
