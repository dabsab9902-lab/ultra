/**
 * Fallback generator for local demo data.
 * Categories and subcategories are explicit and match the B2B catalog tree.
 *
 * Run: node scripts/generate-products.mjs
 */
import { writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "src", "data", "products.json");

const GROUPS = [
  {
    sourceId: "cables",
    category: "Кабель и провод",
    subcategories: ["ВВГ", "ВВГнг", "ПВС", "ШВВП", "СИП", "КГ", "ПВ", "UTP", "FTP"],
    prefix: "CBL",
  },
  {
    sourceId: "lighting",
    category: "Светотехника",
    subcategories: ["светильники", "LED лампы", "прожекторы", "LED ленты", "блоки питания"],
    prefix: "LT",
  },
  {
    sourceId: "sockets",
    category: "Электрофурнитура",
    subcategories: ["розетки", "выключатели", "рамки", "вилки", "удлинители"],
    prefix: "ELF",
  },
  {
    sourceId: "breakers",
    category: "Автоматика и защита",
    subcategories: ["автоматы", "УЗО", "дифавтоматы", "реле", "контакторы"],
    prefix: "AUT",
  },
  {
    sourceId: "tools",
    category: "Инструмент и расходники",
    subcategories: ["инструмент", "крепеж", "изолента", "стяжки", "расходные материалы"],
    prefix: "TLS",
  },
  {
    sourceId: "tools",
    category: "Бытовая техника",
    subcategories: ["пылесосы", "вентиляторы", "обогреватели"],
    prefix: "BT",
  },
];

const UNIT_BY_GROUP = { cables: "м" };

function roundPrice(n) {
  return Math.round(n * 100) / 100;
}

const products = [];
let id = 1;

for (const group of GROUPS) {
  for (const subcategory of group.subcategories) {
    for (let i = 1; i <= 4; i++) {
      const sku = `${group.prefix}-${String(id).padStart(5, "0")}`;
      const unit = UNIT_BY_GROUP[group.sourceId] ?? "шт";
      const minOrder = unit === "м" ? 100 : 10;
      const name = `${subcategory} demo ${i}`;
      const stock = 100 + ((id * 137) % 20000);

      products.push({
        id: String(id),
        name,
        sku,
        categoryId: group.category,
        subcategory,
        price: roundPrice(50 + (id * 17.3) % 5000 + i * 23.7),
        unit,
        minOrder,
        stock,
        image: `/images/placeholders/${group.sourceId}.svg`,
        description: `${name}. ${group.category} / ${subcategory}.`,
        specs: {
          Артикул: sku,
          Категория: group.category,
          Подкатегория: subcategory,
          "Мин. заказ": `${minOrder} ${unit}`,
          Остаток: `${stock} ${unit}`,
        },
        featured: id <= 8 || id % 15 === 0,
      });
      id++;
    }
  }
}

const payload = {
  version: 1,
  generatedAt: new Date().toISOString(),
  total: products.length,
  products,
};

writeFileSync(OUT, JSON.stringify(payload, null, 2), "utf-8");
console.log(`Generated ${products.length} products -> ${OUT}`);
