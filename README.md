# Ultra Svet — B2B PWA каталог электротоваров

Современное прогрессивное веб-приложение (PWA) для оптового каталога электротоваров. Мобильный интерфейс, поиск, корзина, офлайн-кэширование и установка на устройство.

## Стек

- **Next.js 15** (App Router)
- **TypeScript**
- **Tailwind CSS**
- **@ducanh2912/next-pwa** — Service Worker и офлайн-кэш

## Возможности

- Главная страница с категориями и популярными товарами
- Каталог с поиском по названию и артикулу, фильтром по категориям
- **Lazy loading** — подгрузка по 20 товаров при прокрутке
- Импорт каталога из `src/data/products.json` (готово к 10 000+ позиций)
- Карточка товара: изображение, артикул, цена, остаток
- Корзина с сохранением в `localStorage`
- 120+ тестовых товаров (генератор)
- PWA: manifest, установка на экран, офлайн-кэш (production build)

## Каталог товаров

Товары хранятся в `src/data/products.json`.

### Импорт с ultra-svet.com

```bash
# 20 товаров (тест), пауза 1.5 с между запросами
npm run import:ultra-svet

# Свои параметры
node scripts/import-ultra-svet.mjs --limit=50 --delay=2000
```

Переменные: `IMPORT_LIMIT`, `IMPORT_DELAY`.

Импортируются: название, артикул, цена, изображение, ссылка (`sourceUrl`).

### Локальные тестовые данные

```bash
npm run generate:products
```

API для каталога (пагинация, поиск):

- `GET /api/products?q=&category=&page=1&limit=20`
- `GET /api/products/[id]`
- `GET /api/products?ids=1,2,3` — пакетная загрузка для корзины

## Требования

- [Node.js](https://nodejs.org/) 18.18+ (рекомендуется 20 LTS)
- npm 9+

## Запуск локально

```bash
# 1. Перейти в папку проекта
cd "c:\Users\alexn\Documents\ultra svet"

# 2. Установить зависимости
npm install

# 3. Режим разработки
npm run dev
```

Откройте [http://localhost:3000](http://localhost:3000) в браузере.

## Production и PWA

Service Worker включается только в production-сборке:

```bash
npm run build
npm start
```

Для проверки PWA (установка, офлайн):

1. Соберите проект (`npm run build && npm start`)
2. Откройте в Chrome → DevTools → Application → Service Workers
3. На мобильном: «Добавить на главный экран»

## Структура проекта

```
src/
├── app/              # Страницы и API (/api/products)
├── components/       # UI-компоненты
├── context/          # CartContext (корзина)
├── data/
│   ├── products.json # Каталог (импорт из JSON)
│   └── categories.ts
├── hooks/            # useInfiniteProducts, useDebouncedValue
└── lib/
    ├── catalog/      # Индексированный каталог (до 10k+)
    └── api/          # Клиент API
public/
├── manifest.json     # PWA manifest
└── icons/            # Иконки приложения
```

## Скрипты

| Команда        | Описание                    |
|----------------|-----------------------------|
| `npm run dev`  | Dev-сервер с Turbopack      |
| `npm run build`| Production-сборка + SW      |
| `npm start`    | Запуск production-сервера   |
| `npm run lint` | ESLint                      |
