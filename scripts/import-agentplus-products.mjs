import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";

const DEFAULT_XML_PATH = join(
  process.env.TEMP || process.cwd(),
  "ultra-svet-1c-audit",
  "FromCDB.xml"
);
const PRODUCTS_FILE = join(process.cwd(), "products.json");
const OUTPUT_FILE = join(process.cwd(), "data", "agentplus-product-matches.json");
const AUDIT_FILE = join(process.cwd(), "data", "agentplus-product-audit.json");

const NOMENCLATURE_GUID = "D6D52ADA-0F38-4112-AF3C-2F1E425A43D1";
const WAREHOUSE_NAME = "Склад основний Ultra Svet";

const inputPath = resolve(process.argv[2] || DEFAULT_XML_PATH);

if (!existsSync(inputPath)) {
  console.error(`FromCDB.xml not found: ${inputPath}`);
  console.error(
    "Pass XML path: npm run import:agentplus-products -- C:\\path\\FromCDB.xml"
  );
  process.exit(1);
}

if (!existsSync(PRODUCTS_FILE)) {
  console.error(`products.json not found: ${PRODUCTS_FILE}`);
  process.exit(1);
}

const xml = readFileSync(inputPath, "utf-8");
const pwaFile = JSON.parse(readFileSync(PRODUCTS_FILE, "utf-8"));
const pwaProducts = Array.isArray(pwaFile.products) ? pwaFile.products : [];
const agentProducts = parseAgentProducts(xml);
const matcher = buildAgentMatcher(agentProducts);
const matches = [];
const unmatchedExamples = [];

for (let index = 0; index < pwaProducts.length; index += 1) {
  const pwaProduct = pwaProducts[index];
  const result = matchPwaProduct(pwaProduct, matcher);

  if (!result?.product) {
    if (unmatchedExamples.length < 50) {
      unmatchedExamples.push({
        index,
        sku: firstString(pwaProduct.article, pwaProduct.sku, pwaProduct.brandCode),
        name: firstString(pwaProduct.name, pwaProduct.title),
        url: firstString(pwaProduct.url, pwaProduct.sourceUrl),
      });
    }
    continue;
  }

  const agent = result.product;
  matches.push({
    productIndex: index,
    productUrl: firstString(pwaProduct.url, pwaProduct.sourceUrl),
    productSku: firstString(pwaProduct.article, pwaProduct.sku, pwaProduct.brandCode),
    productName: firstString(pwaProduct.name, pwaProduct.title),
    matchedBy: result.method,
    agentGuid: agent.guid,
    agentName: agent.name,
    agentPrice: agent.price,
    agentPriceSource: agent.priceSource,
    agentPriceFields: agent.priceFields,
    agentStock: agent.stock,
    agentUnit: guessUnit(agent.name),
    agentCategoryPath: agent.categoryPath,
    agentCategoryPathKey: categoryPathKey(agent.categoryPath),
  });
}

const withPrice = matches.filter((item) => Number.isFinite(item.agentPrice)).length;
const withStock = matches.filter((item) => Number.isFinite(item.agentStock)).length;
const byMethod = countBy(matches, "matchedBy");
const audit = {
  version: 1,
  generatedAt: new Date().toISOString(),
  source: inputPath,
  warehouse: WAREHOUSE_NAME,
  totalPwaProducts: pwaProducts.length,
  totalAgentProducts: agentProducts.length,
  matched: matches.length,
  withPrice,
  withStock,
  unmatched: Math.max(0, pwaProducts.length - matches.length),
  byMethod,
  unmatchedExamples,
};

const payload = {
  version: 1,
  generatedAt: audit.generatedAt,
  source: inputPath,
  warehouse: WAREHOUSE_NAME,
  totalPwaProducts: pwaProducts.length,
  totalAgentProducts: agentProducts.length,
  matches,
};

mkdirSync(dirname(OUTPUT_FILE), { recursive: true });
writeFileSync(OUTPUT_FILE, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
writeFileSync(AUDIT_FILE, `${JSON.stringify(audit, null, 2)}\n`, "utf-8");

console.log(`AgentPlus products total: ${agentProducts.length}`);
console.log(`PWA products total: ${pwaProducts.length}`);
console.log(`Matched with AgentPlus: ${matches.length}`);
console.log(`With AgentPlus price: ${withPrice}`);
console.log(`With AgentPlus stock: ${withStock}`);
console.log(`Unmatched: ${audit.unmatched}`);
console.log(`Output: ${OUTPUT_FILE}`);
console.log(`Audit: ${AUDIT_FILE}`);

function parseAgentProducts(sourceXml) {
  const block = blockBy(sourceXml, "CATALOG", NOMENCLATURE_GUID);
  const groupsBlock = block.match(/<GROUPS>[\s\S]*?<\/GROUPS>/)?.[0] ?? "";
  const groups = itemsIn(groupsBlock);
  const groupById = new Map(groups.map((group) => [group.GUID, group]));
  const groupPathMemo = new Map();
  const elementsStart = (block.match(/<\/GROUPS>/)?.index ?? -9) + 9;
  const rows = firstElementItems(block.slice(elementsStart));

  return rows
    .map((row) => {
      const name = firstString(row.Name, row.A035);
      if (!row.GUID || !name) return null;

      const priceInfo = firstPositivePrice([
        ["A021", row.A021],
        ["A020", row.A020],
        ["A040", row.A040],
      ]);
      const stock = firstFiniteNumber(row.A030, row.A011);
      const stockFlag = firstFiniteNumber(row.A037);
      const normalizedStock =
        stock !== undefined
          ? Math.max(0, stock)
          : stockFlag && stockFlag > 0
            ? stockFlag
            : undefined;

      return {
        guid: row.GUID,
        name,
        nameKey: compactText(name),
        codes: extractLikelyCodes(name),
        price: priceInfo?.price,
        priceSource: priceInfo?.source,
        priceFields: {
          A020: parseNumber(row.A020),
          A021: parseNumber(row.A021),
          A040: parseNumber(row.A040),
        },
        stock: normalizedStock,
        categoryPath: getGroupPath(row.GrpId0, groupById, groupPathMemo),
      };
    })
    .filter(Boolean);
}

function buildAgentMatcher(agentProducts) {
  const byGuid = new Map();
  const byName = new Map();
  const byCode = new Map();

  for (const product of agentProducts) {
    byGuid.set(product.guid.toUpperCase(), product);
    pushMap(byName, product.nameKey, product);
    for (const code of product.codes) pushMap(byCode, code, product);
  }

  return { byGuid, byName, byCode };
}

function matchPwaProduct(product, matcher) {
  const guid = firstString(product.agentGuid);
  if (guid) {
    const byGuid = matcher.byGuid.get(guid.toUpperCase());
    if (byGuid) return { product: byGuid, method: "guid" };
  }

  const nameKey = compactText(firstString(product.name, product.title));
  const brandKey = normalizeText(firstString(product.brand));
  const productCodes = unique(
    [product.article, product.sku, product.brandCode]
      .map(codeKey)
      .filter(isUsefulCode)
  );

  for (const code of productCodes) {
    const candidates = matcher.byCode.get(code) ?? [];
    if (candidates.length === 1) {
      return { product: candidates[0], method: "article" };
    }

    if (candidates.length > 1) {
      const exactName = candidates.find((candidate) => candidate.nameKey === nameKey);
      if (exactName) return { product: exactName, method: "article+name" };

      const sameBrand = brandKey
        ? candidates.filter((candidate) =>
            normalizeText(candidate.name).includes(brandKey)
          )
        : [];
      if (sameBrand.length === 1) {
        return { product: sameBrand[0], method: "article+brand" };
      }
    }
  }

  const nameCandidates = matcher.byName.get(nameKey) ?? [];
  if (nameCandidates.length === 1) {
    return { product: nameCandidates[0], method: "name" };
  }

  return null;
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
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function getGroupPath(groupId, groups, memo) {
  if (!groupId || !groups.has(groupId)) return [];
  if (memo.has(groupId)) return memo.get(groupId);
  const group = groups.get(groupId);
  const path = [
    ...getGroupPath(group.ParId, groups, memo),
    cleanCategoryName(group.Name),
  ].filter(Boolean);
  memo.set(groupId, path);
  return path;
}

function cleanCategoryName(value) {
  return String(value ?? "")
    .replace(/^\s*\d+\s*[_-]\s*/u, "")
    .trim();
}

function extractLikelyCodes(value) {
  const tokens = Array.from(
    String(value ?? "").matchAll(/[\p{L}\p{N}][\p{L}\p{N}._/-]{1,}/gu)
  ).map((match) => codeKey(match[0]));

  return unique(tokens.filter(isUsefulCode));
}

function codeKey(value) {
  return String(value ?? "")
    .toUpperCase()
    .replace(/[\s"'`]+/g, "")
    .replace(/[()]+/g, "")
    .trim();
}

function isUsefulCode(value) {
  const code = String(value ?? "");
  if (!code || code.length < 3) return false;
  if (!/[0-9]/.test(code) && code.length < 4) return false;
  if (/^\d+$/.test(code) && code.length < 5) return false;
  if (
    /^(\d+P|\d+M|\d+(?:[,.]\d+)?A|[BCD]-?\d+A|\d+(?:[,.]\d+)?K?A)$/i.test(
      code
    )
  ) {
    return false;
  }
  return /[A-Z0-9]/i.test(code);
}

function normalizeText(value) {
  return String(value ?? "")
    .toLocaleLowerCase("uk")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function compactText(value) {
  return normalizeText(value).replace(/\s+/g, "");
}

function guessUnit(value) {
  const text = normalizeText(value);
  if (
    /\b(кабель|провід|провод|дріт|utp|ftp|ввг|пвс|шввп|сип|кг|пв)\b/u.test(
      text
    )
  ) {
    return "м";
  }
  return "шт";
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return "";
}

function firstPositiveNumber(...values) {
  for (const value of values) {
    const number = parseNumber(value);
    if (number !== undefined && number > 0) return roundMoney(number);
  }
  return undefined;
}

function firstPositivePrice(entries) {
  for (const [source, value] of entries) {
    const number = parseNumber(value);
    if (number !== undefined && number > 0) {
      return {
        price: roundMoney(number),
        source,
      };
    }
  }
  return undefined;
}

function firstFiniteNumber(...values) {
  for (const value of values) {
    const number = parseNumber(value);
    if (number !== undefined) return number;
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

function pushMap(map, key, value) {
  if (!key) return;
  const list = map.get(key) ?? [];
  list.push(value);
  map.set(key, list);
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function countBy(items, key) {
  return items.reduce((acc, item) => {
    const value = item[key] || "unknown";
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function categoryPathKey(path) {
  return Array.isArray(path) ? path.map(normalizeText).join("/") : "";
}
