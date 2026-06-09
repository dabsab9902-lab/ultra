import type { Product } from "@/lib/types";

export const DEFAULT_PRODUCT_SORT = "default";

export const PRODUCT_SORT_OPTIONS = [
  { value: "default", label: "По умолчанию" },
  { value: "stock-desc", label: "По наличию" },
  { value: "price-asc", label: "Сначала дешевле" },
  { value: "price-desc", label: "Сначала дороже" },
  { value: "name-asc", label: "Название А-Я" },
  { value: "brand-asc", label: "По бренду" },
] as const;

export type ProductSort = (typeof PRODUCT_SORT_OPTIONS)[number]["value"];

export interface ProductSortInput {
  name?: string;
  brand?: string;
  price?: number;
  stock?: number;
  index?: number;
}

const SORT_VALUES = new Set<string>(
  PRODUCT_SORT_OPTIONS.map((option) => option.value)
);

export function normalizeProductSort(value: unknown): ProductSort {
  const raw = String(value ?? "").trim();
  if (raw === "stock") return "stock-desc";
  if (raw === "name") return "name-asc";
  if (raw === "brand") return "brand-asc";
  return SORT_VALUES.has(raw) ? (raw as ProductSort) : DEFAULT_PRODUCT_SORT;
}

export function sortCatalogProducts<T extends Product>(
  products: T[],
  sort: unknown
): T[] {
  return sortItems(products, sort, (product, index) => ({
    name: product.name,
    brand: product.brand,
    price: product.price,
    stock: product.stock,
    index,
  }));
}

export function sortItems<T>(
  items: T[],
  sort: unknown,
  getSortInput: (item: T, index: number) => ProductSortInput
): T[] {
  const normalizedSort = normalizeProductSort(sort);
  return items
    .map((item, index) => ({
      item,
      input: { ...getSortInput(item, index), index },
    }))
    .sort((first, second) =>
      compareProductSort(first.input, second.input, normalizedSort)
    )
    .map((entry) => entry.item);
}

export function compareProductSort(
  first: ProductSortInput,
  second: ProductSortInput,
  sort: ProductSort = DEFAULT_PRODUCT_SORT
) {
  const firstStock = finiteNumber(first.stock);
  const secondStock = finiteNumber(second.stock);
  const firstPrice = finiteNumber(first.price);
  const secondPrice = finiteNumber(second.price);
  const firstHasPrice = firstPrice > 0;
  const secondHasPrice = secondPrice > 0;
  const firstIndex = finiteNumber(first.index);
  const secondIndex = finiteNumber(second.index);

  if (sort === "stock-desc") {
    return (
      secondStock - firstStock ||
      compareText(first.name, second.name) ||
      firstIndex - secondIndex
    );
  }

  if (sort === "price-asc") {
    return (
      Number(!firstHasPrice) - Number(!secondHasPrice) ||
      firstPrice - secondPrice ||
      defaultAvailabilityCompare(firstStock, secondStock) ||
      compareText(first.name, second.name) ||
      firstIndex - secondIndex
    );
  }

  if (sort === "price-desc") {
    return (
      Number(!firstHasPrice) - Number(!secondHasPrice) ||
      secondPrice - firstPrice ||
      defaultAvailabilityCompare(firstStock, secondStock) ||
      compareText(first.name, second.name) ||
      firstIndex - secondIndex
    );
  }

  if (sort === "name-asc") {
    return (
      compareText(first.name, second.name) ||
      defaultAvailabilityCompare(firstStock, secondStock) ||
      firstIndex - secondIndex
    );
  }

  if (sort === "brand-asc") {
    return (
      compareText(first.brand, second.brand) ||
      compareText(first.name, second.name) ||
      defaultAvailabilityCompare(firstStock, secondStock) ||
      firstIndex - secondIndex
    );
  }

  return defaultAvailabilityCompare(firstStock, secondStock) || firstIndex - secondIndex;
}

function defaultAvailabilityCompare(firstStock: number, secondStock: number) {
  return Number(secondStock > 0) - Number(firstStock > 0);
}

function compareText(first?: string, second?: string) {
  return String(first ?? "").localeCompare(String(second ?? ""), "ru", {
    numeric: true,
    sensitivity: "base",
  });
}

function finiteNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}
