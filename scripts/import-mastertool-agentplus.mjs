import { existsSync, readFileSync, writeFileSync } from "fs";
import { join, resolve } from "path";

const DEFAULT_XML_PATH = join(
  process.env.TEMP || process.cwd(),
  "ultra-svet-1c-audit",
  "FromCDB.xml"
);
const PRODUCTS_FILE = join(process.cwd(), "products.json");
const NOMENCLATURE_GUID = "D6D52ADA-0F38-4112-AF3C-2F1E425A43D1";
const MASTERTOOL_RE = /master\s*tool|mastertool/i;
const SOURCE = "agentplus-mastertool";

const inputPath = resolve(process.argv[2] || DEFAULT_XML_PATH);

if (!existsSync(inputPath)) {
  console.error(`FromCDB.xml not found: ${inputPath}`);
  process.exit(1);
}

if (!existsSync(PRODUCTS_FILE)) {
  console.error(`products.json not found: ${PRODUCTS_FILE}`);
  process.exit(1);
}

const xml = readFileSync(inputPath, "utf-8");
const productsFile = JSON.parse(readFileSync(PRODUCTS_FILE, "utf-8"));
const products = Array.isArray(productsFile.products) ? productsFile.products : [];

const nomenclatureBlock = blockBy(xml, "CATALOG", NOMENCLATURE_GUID);
const groupsBlock =
  nomenclatureBlock.match(/<GROUPS>[\s\S]*?<\/GROUPS>/)?.[0] ?? "";
const elementsStart =
  (nomenclatureBlock.match(/<\/GROUPS>/)?.index ?? -9) + 9;
const rows = firstElementItems(nomenclatureBlock.slice(elementsStart));
const groups = new Map(itemsIn(groupsBlock).map((group) => [group.GUID, group]));
const groupPathMemo = new Map();
const groupStats = new Map();
const masterRows = [];

for (const row of rows) {
  const name = firstString(row.Name, row.A035);
  if (!row.GUID || !name) continue;

  const groupId = row.GrpId0 || "";
  const agentCategoryPath = getGroupPath(groupId, groups, groupPathMemo);
  const pathText = agentCategoryPath.join(" / ");

  if (!MASTERTOOL_RE.test(pathText) && !MASTERTOOL_RE.test(name)) continue;

  const stock = getStock(row);
  const price = firstPositiveNumber(row.A021, row.A020, row.A040);
  const article = extractArticle(name);
  const relativePath = getMastertoolRelativePath(agentCategoryPath);
  const categoryPath = ["MASTER TOOL", ...relativePath].filter(Boolean);
  const leafCategory = categoryPath.at(-1) || "MASTER TOOL";

  const parsed = {
    guid: row.GUID,
    name,
    article,
    price,
    stock,
    unit: guessUnit(name),
    groupId,
    agentCategoryPath,
    categoryPath,
    leafCategory,
    row,
  };

  masterRows.push(parsed);

  const stats = groupStats.get(groupId) ?? { total: 0, inStock: 0 };
  stats.total += 1;
  if (stock > 0) stats.inStock += 1;
  groupStats.set(groupId, stats);
}

const selectedGroupIds = new Set(
  Array.from(groupStats.entries())
    .filter(([, stats]) => stats.inStock > 0)
    .map(([groupId]) => groupId)
);

const existingIndex = buildExistingIndex(products);
const addedCodeKeys = new Set();
const updatedIndexes = new Set();
const hiddenIndexes = new Set();
let added = 0;
let updated = 0;
let hiddenExisting = 0;
let skippedDuplicates = 0;
let skippedNoArticle = 0;
let selectedInStock = 0;
let selectedPreorder = 0;
let selectedTotal = 0;

for (const item of masterRows) {
  const shouldImport = selectedGroupIds.has(item.groupId);
  const existingIndexValue = findExistingIndex(item, existingIndex);

  if (!shouldImport) {
    if (existingIndexValue !== undefined) {
      const product = products[existingIndexValue];
      updateAgentFields(product, item, { catalogHidden: true });
      if (!hiddenIndexes.has(existingIndexValue)) {
        hiddenIndexes.add(existingIndexValue);
        hiddenExisting += 1;
      }
    }
    continue;
  }

  selectedTotal += 1;
  if (item.stock > 0) selectedInStock += 1;
  else selectedPreorder += 1;

  if (existingIndexValue !== undefined) {
    const product = products[existingIndexValue];
    updateVisibleProduct(product, item);
    if (!updatedIndexes.has(existingIndexValue)) {
      updatedIndexes.add(existingIndexValue);
      updated += 1;
    }
    continue;
  }

  if (!item.article) {
    skippedNoArticle += 1;
    continue;
  }

  const articleKey = codeKey(item.article);
  if (addedCodeKeys.has(articleKey) || existingIndex.byCode.has(articleKey)) {
    skippedDuplicates += 1;
    continue;
  }

  const product = createImportedProduct(item);
  products.push(product);
  added += 1;
  addedCodeKeys.add(articleKey);
  addProductToIndex(products.length - 1, product, existingIndex);
}

productsFile.products = products;
productsFile.total = products.length;
productsFile.generatedAt = new Date().toISOString();
productsFile.mastertoolImport = {
  source: inputPath,
  importedAt: productsFile.generatedAt,
  totalMastertoolProducts: masterRows.length,
  totalMastertoolCategories: groupStats.size,
  selectedCategories: selectedGroupIds.size,
  hiddenCategories: Math.max(0, groupStats.size - selectedGroupIds.size),
  selectedProducts: selectedTotal,
  selectedInStock,
  selectedPreorder,
  added,
  updated,
  hiddenExisting,
  skippedDuplicates,
  skippedNoArticle,
};

writeFileSync(PRODUCTS_FILE, `${JSON.stringify(productsFile, null, 2)}\n`, "utf-8");

console.log(`MASTERTOOL categories total: ${groupStats.size}`);
console.log(`MASTERTOOL categories with stock: ${selectedGroupIds.size}`);
console.log(`MASTERTOOL selected products: ${selectedTotal}`);
console.log(`MASTERTOOL selected in stock: ${selectedInStock}`);
console.log(`MASTERTOOL selected preorder: ${selectedPreorder}`);
console.log(`Updated existing products: ${updated}`);
console.log(`Added products: ${added}`);
console.log(`Hidden existing products from empty MASTERTOOL groups: ${hiddenExisting}`);
console.log(`Skipped duplicates: ${skippedDuplicates}`);
console.log(`Skipped without article: ${skippedNoArticle}`);
console.log(`Products total now: ${products.length}`);

function createImportedProduct(item) {
  return {
    title: item.name,
    name: item.name,
    article: item.article,
    sku: item.article,
    brandCode: item.article,
    brand: detectMastertoolBrand(item.name),
    price: item.price ?? 0,
    basePrice: item.price ?? 0,
    priceAfterDiscount: item.price ?? 0,
    image: "",
    imageUrl: "",
    category: "MASTER TOOL",
    subcategory: item.leafCategory,
    categoryPath: item.categoryPath,
    categoryPathUrls: item.categoryPath.map(() => ""),
    breadcrumbs: item.categoryPath.map((title) => ({ title, url: "" })),
    url: "",
    source: SOURCE,
    availability: item.stock > 0 ? `${item.stock} ${item.unit}` : "Под заказ",
    stockStatus: item.stock > 0 ? "in_stock" : "preorder",
    agentGuid: item.guid,
    agentPrice: item.price,
    agentStock: item.stock,
    agentUnit: item.unit,
    agentCategoryPath: item.agentCategoryPath,
    catalogHidden: false,
  };
}

function updateVisibleProduct(product, item) {
  const image = firstString(product.image, product.imageUrl);
  const sourceUrl = firstString(product.url, product.sourceUrl);

  product.title = item.name;
  product.name = item.name;
  product.article = item.article || firstString(product.article, product.sku);
  product.sku = item.article || firstString(product.sku, product.article);
  product.brandCode = item.article || firstString(product.brandCode, product.article);
  product.brand = detectMastertoolBrand(item.name);
  product.price = item.price ?? product.price ?? 0;
  product.basePrice = item.price ?? product.basePrice ?? product.price ?? 0;
  product.priceAfterDiscount = item.price ?? product.priceAfterDiscount ?? product.price ?? 0;
  product.image = image;
  product.imageUrl = image;
  product.category = "MASTER TOOL";
  product.subcategory = item.leafCategory;
  product.categoryPath = item.categoryPath;
  product.categoryPathUrls = item.categoryPath.map(() => "");
  product.breadcrumbs = item.categoryPath.map((title) => ({ title, url: "" }));
  product.url = sourceUrl;
  product.availability = item.stock > 0 ? `${item.stock} ${item.unit}` : "Под заказ";
  product.stockStatus = item.stock > 0 ? "in_stock" : "preorder";
  product.source = firstString(product.source) || SOURCE;
  updateAgentFields(product, item, { catalogHidden: false });
}

function updateAgentFields(product, item, { catalogHidden }) {
  product.agentGuid = item.guid;
  product.agentPrice = item.price;
  product.agentStock = item.stock;
  product.agentUnit = item.unit;
  product.agentCategoryPath = item.agentCategoryPath;
  product.catalogHidden = Boolean(catalogHidden);
  product.stockStatus = item.stock > 0 ? "in_stock" : "preorder";
}

function buildExistingIndex(existingProducts) {
  const index = {
    byGuid: new Map(),
    byCode: new Map(),
    byName: new Map(),
  };

  existingProducts.forEach((product, productIndex) => {
    addProductToIndex(productIndex, product, index);
  });

  return index;
}

function addProductToIndex(productIndex, product, index) {
  const guid = firstString(product.agentGuid);
  if (guid) index.byGuid.set(guid.toUpperCase(), productIndex);

  for (const code of getProductCodeKeys(product)) {
    const list = index.byCode.get(code) ?? [];
    list.push(productIndex);
    index.byCode.set(code, list);
  }

  const name = nameKey(firstString(product.name, product.title));
  if (name) {
    const list = index.byName.get(name) ?? [];
    list.push(productIndex);
    index.byName.set(name, list);
  }
}

function findExistingIndex(item, index) {
  const byGuid = index.byGuid.get(item.guid.toUpperCase());
  if (byGuid !== undefined) return byGuid;

  const articleKey = codeKey(item.article);
  if (articleKey) {
    const byCode = index.byCode.get(articleKey) ?? [];
    if (byCode.length === 1) return byCode[0];
    if (byCode.length > 1) {
      const itemName = nameKey(item.name);
      const exact = byCode.find((candidateIndex) => {
        const candidate = products[candidateIndex];
        return nameKey(firstString(candidate.name, candidate.title)) === itemName;
      });
      if (exact !== undefined) return exact;
    }
  }

  const byName = index.byName.get(nameKey(item.name)) ?? [];
  if (byName.length === 1) return byName[0];

  return undefined;
}

function getProductCodeKeys(product) {
  return unique(
    [
      product.article,
      product.sku,
      product.brandCode,
      ...extractLikelyCodes(
        [product.name, product.title, product.article, product.sku, product.brandCode]
          .filter(Boolean)
          .join(" ")
      ),
    ]
      .map(codeKey)
      .filter(Boolean)
  );
}

function blockBy(sourceXml, tag, guid) {
  const startRe = new RegExp(`<${tag}\\b[^>]*GUID="${guid}"[^>]*>`, "i");
  const match = startRe.exec(sourceXml);
  if (!match) return "";
  const start = match.index + match[0].length;
  const close = `</${tag}>`;
  const end = sourceXml.indexOf(close, start);
  return end >= 0 ? sourceXml.slice(start, end) : "";
}

function firstElementItems(block) {
  const startTagIndex = block.indexOf("<ELEMENTS");
  if (startTagIndex < 0) return [];
  const start = block.indexOf(">", startTagIndex) + 1;
  const end = block.indexOf("</ELEMENTS>", start);
  return end >= 0 ? itemsIn(block.slice(start, end)) : [];
}

function itemsIn(block) {
  return Array.from(block.matchAll(/<ITEM\b([^>]*)\/>/g)).map((match) =>
    attrs(match[1])
  );
}

function attrs(value) {
  const result = {};
  for (const match of value.matchAll(/([A-Za-z0-9_]+)="([^"]*)"/g)) {
    result[match[1]] = decodeXml(match[2]);
  }
  return result;
}

function decodeXml(value) {
  return String(value)
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function getGroupPath(groupId, groupsMap, memo) {
  if (!groupId || !groupsMap.has(groupId)) return [];
  if (memo.has(groupId)) return memo.get(groupId);
  const group = groupsMap.get(groupId);
  const path = [
    ...getGroupPath(group.ParId, groupsMap, memo),
    cleanCategoryName(group.Name),
  ].filter(Boolean);
  memo.set(groupId, path);
  return path;
}

function getMastertoolRelativePath(path) {
  const masterIndex = path.findIndex((entry) => MASTERTOOL_RE.test(entry));
  if (masterIndex >= 0) return path.slice(masterIndex + 1);
  return path.filter((entry) => !/продукц|ultra svet|інструмент/i.test(entry));
}

function cleanCategoryName(value) {
  return String(value ?? "")
    .replace(/^\s*\d+\s*[_-]\s*/u, "")
    .trim();
}

function extractArticle(name) {
  const text = String(name ?? "").replace(/\s+/g, " ").trim();
  const numericAtEnd = text.match(
    /(\b\d{1,3}(?:[-/]\d{2,5}){1,3}[A-ZА-ЯІЇЄҐ0-9]*\b)\s*$/i
  );
  if (numericAtEnd) return numericAtEnd[1];

  const alphaAtEnd = text.match(
    /(\b[A-ZА-ЯІЇЄҐ]{1,6}[- ]?\d{3,6}[A-ZА-ЯІЇЄҐ0-9]*\b)\s*$/i
  );
  if (alphaAtEnd) return alphaAtEnd[1].replace(/\s+/g, "");

  const afterMastertool = text.match(
    /(?:MASTER\s*TOOL|MASTERTOOL)\s*([A-ZА-ЯІЇЄҐ0-9][A-ZА-ЯІЇЄҐ0-9./-]{2,})\b/i
  );
  if (afterMastertool) return afterMastertool[1];

  const numericCodes = extractNumericCodes(text);
  if (numericCodes.length > 0) return numericCodes.at(-1) ?? "";

  const alphaCodes = extractAlphaNumericCodes(text).filter(
    (code) => !/^din\d+$/i.test(code)
  );
  return alphaCodes.at(-1) ?? "";
}

function extractLikelyCodes(text) {
  return unique([...extractNumericCodes(text), ...extractAlphaNumericCodes(text)]);
}

function extractNumericCodes(text) {
  return unique(
    Array.from(
      String(text ?? "").matchAll(
        /\b\d{1,3}(?:[-/]\d{2,5}){1,3}[A-ZА-ЯІЇЄҐ0-9]*\b/gi
      )
    ).map((match) => match[0])
  );
}

function extractAlphaNumericCodes(text) {
  return unique(
    Array.from(
      String(text ?? "").matchAll(
        /\b[A-ZА-ЯІЇЄҐ]{1,6}[- ]?\d{3,6}[A-ZА-ЯІЇЄҐ0-9]*\b/gi
      )
    ).map((match) => match[0].replace(/\s+/g, ""))
  );
}

function detectMastertoolBrand(name) {
  const text = String(name ?? "").toLocaleUpperCase("uk");
  if (text.includes("GRANITE")) return "GRANITE";
  if (text.includes("ГОСПОДАР")) return "ГОСПОДАР";
  if (text.includes("BURN GAS")) return "BURN GAS";
  if (text.includes("WERTVOLL")) return "WERTVOLL";
  if (text.includes("JUCO")) return "JUCO";
  if (text.includes("MPT")) return "MPT";
  if (text.includes("MASTERTOOL") || text.includes("MASTER TOOL")) {
    return "MASTER TOOL";
  }
  return "MASTER TOOL";
}

function guessUnit(value) {
  const text = String(value ?? "").toLocaleLowerCase("uk");
  if (/\b(м|метр|канат|шнур|мотуз|ліска|стрічка)\b/u.test(text)) return "м";
  return "шт";
}

function getStock(row) {
  const stock = firstFiniteNumber(row.A030, row.A011);
  const stockFlag = firstFiniteNumber(row.A037);
  return stock !== undefined ? stock : stockFlag && stockFlag > 0 ? stockFlag : 0;
}

function firstPositiveNumber(...values) {
  for (const value of values) {
    const number = parseNumber(value);
    if (number !== undefined && number > 0) return roundMoney(number);
  }
  return undefined;
}

function firstFiniteNumber(...values) {
  for (const value of values) {
    const number = parseNumber(value);
    if (number !== undefined) return Math.max(0, number);
  }
  return undefined;
}

function parseNumber(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const number = Number(String(value).replace(",", "."));
  return Number.isFinite(number) ? number : undefined;
}

function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return "";
}

function nameKey(value) {
  return String(value ?? "")
    .toLocaleLowerCase("uk")
    .replace(/[ʼ'`"«»]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function codeKey(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const extracted = extractLikelyCodes(raw).at(-1) ?? raw;
  return extracted
    .toLocaleLowerCase("uk")
    .replace(/^(master\s*tool|mastertool|tool)\s+/i, "")
    .replace(/[^a-zа-яіїєґ0-9]+/giu, "");
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}
