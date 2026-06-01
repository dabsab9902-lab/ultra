/**
 * Импорт товаров с ultra-svet.com → products.json
 *
 *   npm run import:ultra-svet
 *   npm run import:ultra-svet -- --limit=20 --delay=1500
 *
 * Переменные: IMPORT_LIMIT, IMPORT_DELAY
 */

import { writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { scrapeProducts, BASE_URL } from "./parser-ultra-svet.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_FILE = join(__dirname, "..", "products.json");
const APP_DATA_FILE = join(__dirname, "..", "src", "data", "products.json");

function parseArgs() {
  let limit = Number(process.env.IMPORT_LIMIT) || 20;
  let delay = Number(process.env.IMPORT_DELAY) || 1500;

  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--limit=")) limit = Number(arg.split("=")[1]) || limit;
    if (arg.startsWith("--delay=")) delay = Number(arg.split("=")[1]) || delay;
  }

  return {
    limit: Math.max(1, Math.min(limit, 500)),
    delay: Math.max(500, delay),
  };
}

function normalizeCategory(categoryLabel = "") {
  const category = categoryLabel.trim();
  return category || "Без категории";
}

function toAppProducts(items) {
  return items.map((item, index) => {
    const categoryId = normalizeCategory(item.category);
    const unit = /\b(м\/уп|пог\.?\s*м|грн\/м)\b/i.test(item.name) ? "м" : "шт";
    return {
      id: String(index + 1),
      name: item.name,
      sku: item.sku,
      categoryId,
      price: item.price,
      unit,
      minOrder: unit === "м" ? 100 : 10,
      stock: 100,
      image: item.image,
      sourceUrl: item.url,
      description: `${item.name}. Импорт с ultra-svet.com`,
      specs: {
        Артикул: item.sku,
        Категория: item.category || categoryId,
        Источник: "ultra-svet.com",
      },
      featured: index < 6,
    };
  });
}

function onProgress(event) {
  if (event.type === "ok") {
    const short = event.item.url.replace(BASE_URL, "");
    console.log(
      `[${event.index}/${event.limit}] ✓ ${event.item.sku} — ${event.item.price} грн — ${short.slice(0, 48)}`
    );
    return;
  }
  if (event.type === "skip") {
    console.log(`  пропуск: ${event.reason}`);
    return;
  }
  if (event.type === "error") {
    console.log(`  ✗ ${event.url}: ${event.message}`);
  }
}

async function main() {
  const { limit, delay } = parseArgs();

  console.log(`\n📦 Импорт с ${BASE_URL}`);
  console.log(`   Лимит: ${limit} товаров, задержка: ${delay} мс\n`);

  console.log("→ Сканируем каталоги…");
  const { products, scanned } = await scrapeProducts({
    limit,
    delay,
    onProgress: (e) => {
      if (e.type === "ok") onProgress(e);
    },
  });

  const payload = {
    source: "ultra-svet.com",
    generatedAt: new Date().toISOString(),
    limit,
    delayMs: delay,
    total: products.length,
    products,
  };

  writeFileSync(OUT_FILE, JSON.stringify(payload, null, 2), "utf-8");

  const appPayload = {
    version: 1,
    generatedAt: payload.generatedAt,
    source: payload.source,
    total: products.length,
    products: toAppProducts(products),
  };
  writeFileSync(APP_DATA_FILE, JSON.stringify(appPayload, null, 2), "utf-8");

  console.log(`\n✅ Сохранено ${products.length} товаров`);
  console.log(`   ${OUT_FILE}`);
  console.log(`   ${APP_DATA_FILE} (для сайта)`);
  console.log(`   Просмотрено карточек: ${scanned}\n`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
