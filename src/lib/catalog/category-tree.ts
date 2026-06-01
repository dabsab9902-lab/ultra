import type { Category } from "@/lib/types";

export const UNCATEGORIZED = "Без категории";
export const OTHER_SUBCATEGORY = "Другое";

// Категории каталога строятся динамически из breadcrumbs/categoryPath товаров.
export const categoryTree: Category[] = [];

export function getCategoryById(id: string): Category | undefined {
  if (!id) return undefined;

  return {
    id,
    name: id,
    icon: "",
    description: "",
    subcategories: [],
    count: 0,
    children: [],
    path: [id],
    pathKey: id,
    level: 0,
  };
}

export function getSubcategories(): string[] {
  return [];
}
