import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";

const DEFAULT_XML_PATH = join(
  process.env.TEMP || process.cwd(),
  "ultra-svet-1c-audit",
  "FromCDB.xml"
);
const PRODUCTS_FILE = join(process.cwd(), "products.json");
const MATCHES_FILE = join(process.cwd(), "data", "agentplus-product-matches.json");
const TREE_PRODUCTS_FILE = join(process.cwd(), "data", "agentplus-tree-products.json");
const REPORT_JSON = join(process.cwd(), "reports", "agentplus-price-priority-report.json");
const REPORT_CSV = join(process.cwd(), "reports", "agentplus-price-priority-examples.csv");

const NOMENCLATURE_GUID = "D6D52ADA-0F38-4112-AF3C-2F1E425A43D1";
const inputPath = resolve(process.argv[2] || DEFAULT_XML_PATH);

if (!existsSync(inputPath)) {
  console.error(`FromCDB.xml not found: ${inputPath}`);
  process.exit(1);
}
if (!existsSync(PRODUCTS_FILE)) {
  console.error(`products.json not found: ${PRODUCTS_FILE}`);
  process.exit(1);
}
if (!existsSync(MATCHES_FILE)) {
  console.error(`agentplus-product-matches.json not found: ${MATCHES_FILE}`);
  process.exit(1);
}

const xml = readFileSync(inputPath, "utf-8");
const priceByGuid = parseAgentPrices(xml);
const productsFile = JSON.parse(readFileSync(PRODUCTS_FILE, "utf-8"));
const matchesFile = JSON.parse(readFileSync(MATCHES_FILE, "utf-8"));
const matches = Array.isArray(matchesFile.matches) ? matchesFile.matches : [];

const matchReport = buildMatchReport(matches, priceByGuid);
const productUpdate = updateProducts(productsFile, priceByGuid);
const treeUpdate = updateTreeProducts(priceByGuid);

const report = {
  version: 1,
  generatedAt: new Date().toISOString(),
  source: inputPath,
  pricePriority: ["A021", "A020", "A040"],
  previousPriority: ["A020", "A040", "A021"],
  totalMatchedProducts: matches.length,
  changedMatchedPrices: matchReport.changed.length,
  sourceCounts: matchReport.sourceCounts,
  usesA021: matchReport.sourceCounts.A021 ?? 0,
  fallbackA020A040:
    (matchReport.sourceCounts.A020 ?? 0) + (matchReport.sourceCounts.A040 ?? 0),
  missingPrice: matchReport.sourceCounts.missing ?? 0,
  productsJson: productUpdate,
  agentplusTreeProducts: treeUpdate,
  examples: matchReport.changed.slice(0, 20),
};

mkdirSync(dirname(REPORT_JSON), { recursive: true });
writeFileSync(PRODUCTS_FILE, `${JSON.stringify(productsFile, null, 2)}\n`, "utf-8");
writeFileSync(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`, "utf-8");
writeFileSync(REPORT_CSV, toCsv(report.examples), "utf-8");

console.log(`Matched products: ${matches.length}`);
console.log(`Changed matched prices: ${report.changedMatchedPrices}`);
console.log(`Use A021: ${report.usesA021}`);
console.log(`Fallback A020/A040: ${report.fallbackA020A040}`);
console.log(`products.json agentPrice changed: ${productUpdate.agentPriceChanged}`);
console.log(`agentplus-tree-products price changed: ${treeUpdate.priceChanged}`);
console.log(`Report: ${REPORT_JSON}`);

function buildMatchReport(items, prices) {
  const changed = [];
  const sourceCounts = {};

  for (const match of items) {
    const guid = firstString(match.agentGuid).toUpperCase();
    const priceInfo = guid ? prices.get(guid) : null;
    const source = priceInfo?.newSource ?? "missing";
    sourceCounts[source] = (sourceCounts[source] ?? 0) + 1;

    if (!priceInfo?.newPrice) continue;

    const oldPrice = toNumber(match.agentPrice);
    if (oldPrice !== undefined && sameMoney(oldPrice, priceInfo.newPrice)) {
      continue;
    }

    changed.push({
      productSku: firstString(match.productSku),
      productName: firstString(match.productName),
      agentGuid: firstString(match.agentGuid),
      oldPrice,
      newPrice: priceInfo.newPrice,
      oldFormulaPrice: priceInfo.oldPrice,
      priceSource: priceInfo.newSource,
      A020: priceInfo.fields.A020,
      A021: priceInfo.fields.A021,
      A040: priceInfo.fields.A040,
      matchedBy: firstString(match.matchedBy),
    });
  }

  return { changed, sourceCounts };
}

function updateProducts(file, prices) {
  const rows = Array.isArray(file.products) ? file.products : [];
  let scanned = 0;
  let agentPriceChanged = 0;
  let priceChanged = 0;
  let basePriceChanged = 0;
  let priceAfterDiscountChanged = 0;
  const examples = [];

  for (const row of rows) {
    const guid = firstString(row.agentGuid).toUpperCase();
    if (!guid) continue;
    const priceInfo = prices.get(guid);
    if (!priceInfo?.newPrice) continue;
    scanned += 1;

    const oldAgentPrice = toNumber(row.agentPrice);
    const nextPrice = priceInfo.newPrice;
    const changed = !sameMoney(oldAgentPrice, nextPrice);

    if (changed) {
      if (examples.length < 20) {
        examples.push({
          article: firstString(row.article, row.sku, row.brandCode),
          name: firstString(row.name, row.title),
          oldAgentPrice,
          newAgentPrice: nextPrice,
          priceSource: priceInfo.newSource,
          A020: priceInfo.fields.A020,
          A021: priceInfo.fields.A021,
          A040: priceInfo.fields.A040,
        });
      }
      row.agentPrice = nextPrice;
      agentPriceChanged += 1;
    }

    if (oldAgentPrice !== undefined && sameMoney(row.price, oldAgentPrice)) {
      row.price = nextPrice;
      priceChanged += 1;
    }
    if (oldAgentPrice !== undefined && sameMoney(row.basePrice, oldAgentPrice)) {
      row.basePrice = nextPrice;
      basePriceChanged += 1;
    }
    if (
      oldAgentPrice !== undefined &&
      sameMoney(row.priceAfterDiscount, oldAgentPrice)
    ) {
      row.priceAfterDiscount = nextPrice;
      priceAfterDiscountChanged += 1;
    }
  }

  return {
    scanned,
    agentPriceChanged,
    priceChanged,
    basePriceChanged,
    priceAfterDiscountChanged,
    examples,
  };
}

function updateTreeProducts(prices) {
  if (!existsSync(TREE_PRODUCTS_FILE)) {
    return { scanned: 0, priceChanged: 0, skipped: "file not found" };
  }

  const file = JSON.parse(readFileSync(TREE_PRODUCTS_FILE, "utf-8"));
  const groups = file.productsByGroup ?? {};
  let scanned = 0;
  let priceChanged = 0;

  for (const rows of Object.values(groups)) {
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      const guid = firstString(row.agentGuid).toUpperCase();
      if (!guid) continue;
      const priceInfo = prices.get(guid);
      if (!priceInfo?.newPrice) continue;
      scanned += 1;

      if (!sameMoney(row.price, priceInfo.newPrice)) {
        row.price = priceInfo.newPrice;
        priceChanged += 1;
      }
      row.priceSource = priceInfo.newSource;
      row.priceFields = priceInfo.fields;
    }
  }

  writeFileSync(TREE_PRODUCTS_FILE, `${JSON.stringify(file)}\n`, "utf-8");
  return { scanned, priceChanged };
}

function parseAgentPrices(sourceXml) {
  const block = blockBy(sourceXml, "CATALOG", NOMENCLATURE_GUID);
  const elementsStart = (block.match(/<\/GROUPS>/)?.index ?? -9) + 9;
  const rows = firstElementItems(block.slice(elementsStart));
  const prices = new Map();

  for (const row of rows) {
    const guid = firstString(row.GUID).toUpperCase();
    if (!guid) continue;
    const fields = {
      A020: parseNumber(row.A020),
      A021: parseNumber(row.A021),
      A040: parseNumber(row.A040),
    };
    const oldPrice = firstPositivePrice([
      ["A020", row.A020],
      ["A040", row.A040],
      ["A021", row.A021],
    ]);
    const nextPrice = firstPositivePrice([
      ["A021", row.A021],
      ["A020", row.A020],
      ["A040", row.A040],
    ]);
    prices.set(guid, {
      fields,
      oldPrice: oldPrice?.price,
      oldSource: oldPrice?.source,
      newPrice: nextPrice?.price,
      newSource: nextPrice?.source,
    });
  }

  return prices;
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

function parseNumber(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const number = Number(String(value).replace(",", "."));
  return Number.isFinite(number) ? number : undefined;
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function sameMoney(first, second) {
  const a = toNumber(first);
  const b = toNumber(second);
  if (a === undefined || b === undefined) return false;
  return Math.abs(roundMoney(a) - roundMoney(b)) < 0.005;
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return "";
}

function toCsv(rows) {
  const columns = [
    "productSku",
    "productName",
    "agentGuid",
    "oldPrice",
    "newPrice",
    "oldFormulaPrice",
    "priceSource",
    "A020",
    "A021",
    "A040",
    "matchedBy",
  ];
  return [
    columns.join(","),
    ...rows.map((row) =>
      columns.map((column) => csvValue(row[column])).join(",")
    ),
  ].join("\n");
}

function csvValue(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
