export type CategoryId = string;

export interface Category {
  id: CategoryId;
  name: string;
  icon: string;
  description: string;
  kind?:
    | "category"
    | "all"
    | "brand"
    | "series"
    | "design"
    | "productType"
    | "cableMark";
  brand?: string;
  series?: string;
  design?: string;
  productType?: string;
  cableMark?: string;
  subcategories?: string[];
  count?: number;
  subcategoryCounts?: Record<string, number>;
  url?: string;
  path?: string[];
  pathKey?: string;
  level?: number;
  children?: Category[];
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  brand: string;
  categoryId: CategoryId;
  subcategory: string;
  price: number;
  unit: string;
  minOrder: number;
  stock: number;
  stockStatus?: "in_stock" | "preorder" | "unknown" | string;
  agentGuid?: string;
  agentPrice?: number;
  agentStock?: number;
  agentUnit?: string;
  agentCategoryPath?: string[];
  catalogHidden?: boolean;
  image: string;
  sourceUrl?: string;
  categoryUrl?: string;
  subcategoryUrl?: string;
  categoryPath?: string[];
  categoryPathUrls?: string[];
  description: string;
  specs: Record<string, string>;
  featured?: boolean;
}

export interface ProductsFile {
  version: number;
  generatedAt: string;
  source?: string;
  total: number;
  products: Product[];
}

export interface CatalogQuery {
  q?: string;
  categoryId?: CategoryId | "all";
  subcategory?: string | "all";
  categoryPath?: string[];
  brand?: string;
  series?: string;
  design?: string;
  productType?: string;
  cableMark?: string;
  priceMin?: number;
  priceMax?: number;
  inStock?: boolean;
  includePreorder?: boolean;
  specs?: Record<string, string>;
  page?: number;
  limit?: number;
  offset?: number;
  includeFilters?: boolean;
  sort?: import("@/lib/product-sort").ProductSort;
  featured?: boolean;
  preset?: "seasonal";
  ids?: string[];
}

export interface CatalogFilterValue {
  value: string;
  count: number;
}

export interface CatalogFilterCategory {
  name: string;
  path: string[];
  count: number;
  level: number;
}

export interface CatalogFilters {
  brands: CatalogFilterValue[];
  price: {
    min: number;
    max: number;
  };
  availability: {
    inStock: number;
    outOfStock: number;
  };
  categories: CatalogFilterCategory[];
  specs: Array<{
    key: string;
    values: CatalogFilterValue[];
  }>;
}

export interface CatalogPage {
  items: Product[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
  filters?: CatalogFilters;
}

export interface CartItem {
  productId: string;
  quantity: number;
  minOrder: number;
}
