import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";

const DEFAULT_XML_PATH = join(
  process.env.TEMP || process.cwd(),
  "ultra-svet-1c-audit",
  "FromCDB.xml"
);
const MATCHES_FILE = join(process.cwd(), "data", "agentplus-product-matches.json");
const OUTPUT_FILE = join(process.cwd(), "data", "agentplus-tree.json");
const PRODUCTS_OUTPUT_FILE = join(
  process.cwd(),
  "data",
  "agentplus-tree-products.json"
);

const NOMENCLATURE_GUID = "D6D52ADA-0F38-4112-AF3C-2F1E425A43D1";

const inputPath = resolve(process.argv[2] || DEFAULT_XML_PATH);

if (!existsSync(inputPath)) {
  console.error(`FromCDB.xml not found: ${inputPath}`);
  console.error(
    "Pass XML path: npm run import:agentplus-tree -- C:\\path\\FromCDB.xml"
  );
  process.exit(1);
}

const xml = readFileSync(inputPath, "utf-8");
const matchesByAgentGuid = readProductMatches();
const nomenclatureBlock = blockBy(xml, "CATALOG", NOMENCLATURE_GUID);
const groupsBlock =
  nomenclatureBlock.match(/<GROUPS>[\s\S]*?<\/GROUPS>/)?.[0] ?? "";
const groups = itemsIn(groupsBlock);
const products = firstElementItems(
  nomenclatureBlock.slice((nomenclatureBlock.match(/<\/GROUPS>/)?.index ?? -9) + 9)
);

const groupById = new Map(groups.map((group) => [group.GUID, group]));
const groupChildren = new Map();
const groupPathMemo = new Map();
const productsByGroup = {};
const directCount = new Map();
const directMatchedCount = new Map();

for (const group of groups) {
  const parentId = group.ParId || "";
  const children = groupChildren.get(parentId) ?? [];
  children.push(group.GUID);
  groupChildren.set(parentId, children);
}

for (const product of products) {
  const name = firstString(product.Name, product.A035);
  const groupId = product.GrpId0 || "";
  if (!product.GUID || !name || !groupId) continue;

  const match = matchesByAgentGuid.get(product.GUID.toUpperCase());
  const categoryPath = getGroupPath(groupId, groupById, groupPathMemo);
  const priceInfo = firstPositivePrice([
    ["A021", product.A021],
    ["A020", product.A020],
    ["A040", product.A040],
  ]);
  const row = {
    agentGuid: product.GUID,
    name,
    groupId,
    price: priceInfo?.price,
    priceSource: priceInfo?.source,
    priceFields: {
      A020: parseNumber(product.A020),
      A021: parseNumber(product.A021),
      A040: parseNumber(product.A040),
    },
    stock: firstFiniteNumber(product.A030, product.A011),
    unit: guessUnit(name),
    categoryPath,
    pwaProductId:
      typeof match?.productIndex === "number"
        ? String(match.productIndex + 1)
        : undefined,
    pwaSku: firstString(match?.productSku),
    pwaName: firstString(match?.productName),
    matchedBy: firstString(match?.matchedBy),
  };

  const groupProducts = productsByGroup[groupId] ?? [];
  groupProducts.push(row);
  productsByGroup[groupId] = groupProducts;
  directCount.set(groupId, (directCount.get(groupId) ?? 0) + 1);
  if (row.pwaProductId) {
    directMatchedCount.set(groupId, (directMatchedCount.get(groupId) ?? 0) + 1);
  }
}

const aggregateMemo = new Map();
const roots = (groupChildren.get("") ?? [])
  .map((id) => buildNode(id))
  .filter(Boolean);
const visibleGroups = countVisibleNodes(roots);
const totalProducts = Object.values(productsByGroup).reduce(
  (sum, items) => sum + items.length,
  0
);
const matchedProducts = Object.values(productsByGroup).reduce(
  (sum, items) => sum + items.filter((item) => item.pwaProductId).length,
  0
);

const payload = {
  version: 1,
  generatedAt: new Date().toISOString(),
  source: inputPath,
  totalGroups: visibleGroups,
  sourceGroups: groups.length,
  totalProducts,
  matchedProducts,
  roots,
};

const productsPayload = {
  version: 1,
  generatedAt: payload.generatedAt,
  source: inputPath,
  totalProducts,
  matchedProducts,
  productsByGroup,
};

mkdirSync(dirname(OUTPUT_FILE), { recursive: true });
writeFileSync(OUTPUT_FILE, `${JSON.stringify(payload)}\n`, "utf-8");
writeFileSync(
  PRODUCTS_OUTPUT_FILE,
  `${JSON.stringify(productsPayload)}\n`,
  "utf-8"
);

console.log(`AgentPlus tree groups: ${groups.length}`);
console.log(`Visible groups with products: ${visibleGroups}`);
console.log(`Hidden empty groups: ${groups.length - visibleGroups}`);
console.log(`AgentPlus tree products: ${totalProducts}`);
console.log(`Matched with PWA: ${matchedProducts}`);
console.log(`Output: ${OUTPUT_FILE}`);
console.log(`Products output: ${PRODUCTS_OUTPUT_FILE}`);

function buildNode(id) {
  const group = groupById.get(id);
  const children = (groupChildren.get(id) ?? [])
    .map((childId) => buildNode(childId))
    .filter(Boolean);
  const aggregate = aggregateCounts(id);

  if (aggregate.count <= 0 && children.length === 0) {
    return null;
  }

  return {
    id,
    name: cleanCategoryName(group?.Name),
    parentId: group?.ParId || undefined,
    path: getGroupPath(id, groupById, groupPathMemo),
    level: getGroupPath(id, groupById, groupPathMemo).length - 1,
    count: aggregate.count,
    directCount: directCount.get(id) ?? 0,
    matchedCount: aggregate.matchedCount,
    directMatchedCount: directMatchedCount.get(id) ?? 0,
    children,
  };
}

function countVisibleNodes(nodes) {
  return nodes.reduce(
    (sum, node) => sum + 1 + countVisibleNodes(node.children ?? []),
    0
  );
}

function aggregateCounts(id) {
  if (aggregateMemo.has(id)) return aggregateMemo.get(id);

  let count = directCount.get(id) ?? 0;
  let matchedCount = directMatchedCount.get(id) ?? 0;
  for (const childId of groupChildren.get(id) ?? []) {
    const child = aggregateCounts(childId);
    count += child.count;
    matchedCount += child.matchedCount;
  }

  const result = { count, matchedCount };
  aggregateMemo.set(id, result);
  return result;
}

function readProductMatches() {
  if (!existsSync(MATCHES_FILE)) return new Map();
  const parsed = JSON.parse(readFileSync(MATCHES_FILE, "utf-8"));
  const matches = Array.isArray(parsed.matches) ? parsed.matches : [];
  return new Map(
    matches
      .filter((match) => match.agentGuid)
      .map((match) => [String(match.agentGuid).toUpperCase(), match])
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

function cleanCategoryName(value) {
  return String(value ?? "")
    .replace(/^\s*\d+\s*[_-]\s*/u, "")
    .trim();
}

function guessUnit(value) {
  const text = String(value ?? "").toLocaleLowerCase("uk");
  if (/\b(кабель|провід|провод|дріт|utp|ftp|ввг|пвс|шввп|сип|кг|пв)\b/u.test(text)) {
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
