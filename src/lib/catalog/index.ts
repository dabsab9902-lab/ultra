import { UNCATEGORIZED } from "@/lib/catalog/category-tree";
import {
  getCatalogProductsSignature,
  loadCatalogProducts,
} from "@/lib/catalog/load-products";
import {
  ELECTRICAL_FILTER_KEYS,
  getElectricalSpecs,
  getProductSpecValue,
} from "@/lib/catalog/electrical-filters";
import {
  getCableMarking,
  isCableProduct,
} from "@/lib/catalog/cable-marking";
import {
  getElectroFittingSpecs,
  isElectroFittingProduct,
} from "@/lib/catalog/electrofittings";
import {
  CatalogSearchIndex,
  type CompactSearchEntry,
  type SearchSuggestion,
} from "@/lib/catalog/search-index";
import {
  DEFAULT_PRODUCT_SORT,
  sortCatalogProducts,
} from "@/lib/product-sort";
import { normalizeProductSearchText } from "@/lib/search/products";
import type {
  CatalogFilters,
  CatalogPage,
  CatalogQuery,
  Category,
  CategoryId,
  Product,
} from "@/lib/types";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const UNKNOWN_BRAND = "Без бренда";

class ProductCatalog {
  private products: Product[] = [];
  private byId = new Map<string, Product>();
  private byCategory = new Map<CategoryId, Product[]>();
  private byCategorySubcategory = new Map<string, Product[]>();
  private byCategoryPath = new Map<string, Product[]>();
  private categoryTree: Category[] = [];
  private brandList: { name: string; count: number }[] = [];
  private featured: Product[] = [];
  private searchIndex = new CatalogSearchIndex();
  private basePoolCache = new Map<string, Product[]>();
  private filterCache = new Map<string, CatalogFilters>();
  private indexVersion = "";
  private sourceSignature = "";
  private initialized = false;

  private filterKey(categoryId: string, subcategory: string) {
    return `${categoryId}\u0000${subcategory}`;
  }

  private pathKey(path: string[]) {
    return path.map((entry) => entry.trim()).filter(Boolean).join("\u0000");
  }

  private init() {
    const sourceSignature = getCatalogProductsSignature();
    if (this.initialized && this.sourceSignature === sourceSignature) return;

    this.byId.clear();
    this.byCategory.clear();
    this.byCategorySubcategory.clear();
    this.byCategoryPath.clear();
    this.categoryTree = [];
    this.brandList = [];
    this.featured = [];
    this.basePoolCache.clear();
    this.filterCache.clear();

    this.products = loadCatalogProducts().filter(
      (product) => !product.catalogHidden
    );
    this.searchIndex.build(this.products);
    this.indexVersion = String(this.products.length);
    this.sourceSignature = sourceSignature;

    for (const product of this.products) {
      this.byId.set(product.id, product);

      const catList = this.byCategory.get(product.categoryId) ?? [];
      catList.push(product);
      this.byCategory.set(product.categoryId, catList);

      const subKey = this.filterKey(product.categoryId, product.subcategory);
      const subList = this.byCategorySubcategory.get(subKey) ?? [];
      subList.push(product);
      this.byCategorySubcategory.set(subKey, subList);

      const path = product.categoryPath?.length
        ? product.categoryPath
        : [product.categoryId, product.subcategory].filter(Boolean);
      for (let depth = 1; depth <= path.length; depth += 1) {
        const key = this.pathKey(path.slice(0, depth));
        if (!key) continue;
        const pathList = this.byCategoryPath.get(key) ?? [];
        pathList.push(product);
        this.byCategoryPath.set(key, pathList);
      }
    }

    this.categoryTree = this.buildCategoryTree();
    this.brandList = countBrands(this.products);
    this.featured = this.products.filter((p) => p.featured);
    this.initialized = true;
  }

  private buildCategoryTree(): Category[] {
    const roots: Category[] = [];
    const nodes = new Map<string, Category>();

    for (const product of this.products) {
      const path = product.categoryPath?.length
        ? product.categoryPath
        : [product.categoryId, product.subcategory].filter(Boolean);
      const urls = product.categoryPathUrls ?? [];
      let siblings = roots;

      for (let index = 0; index < path.length; index += 1) {
        const name = path[index]?.trim();
        if (!name) continue;

        const currentPath = path.slice(0, index + 1);
        const key = this.pathKey(currentPath);
        let node = nodes.get(key);

        if (!node) {
          node = {
            id: key,
            name,
            icon: "",
            description: currentPath.join(" / "),
            kind: "category",
            count: 0,
            url: urls[index] ?? "",
            path: currentPath,
            pathKey: key,
            level: index,
            children: [],
          };
          nodes.set(key, node);
          siblings.push(node);
        }

        node.count = this.byCategoryPath.get(key)?.length ?? 0;
        siblings = node.children ?? [];
      }
    }

    this.addBrandLeaves(nodes);
    fillCategorySummaries(roots);

    return moveUncategorizedLast(roots);
  }

  private addBrandLeaves(nodes: Map<string, Category>) {
    for (const node of nodes.values()) {
      const path = node.path ?? [];
      const key = node.pathKey || this.pathKey(path);
      const hasCategoryChildren = (node.children ?? []).some(
        (child) => child.kind !== "brand"
      );
      if (hasCategoryChildren || path.length === 0) continue;

      const products = this.byCategoryPath.get(key) ?? [];
      if (isCableBranch(products)) {
        node.children = buildCableBrandTree(path, key, products);
        continue;
      }

      if (isElectroFittingBranch(products)) {
        node.children = buildElectroFittingBrandTree(path, key, products);
        continue;
      }

      const brands = countBrands(products);
      if (brands.length === 0) continue;

      node.children = brands.map(({ name, count }) => ({
        id: `${key}\u0000brand:${name}`,
        name,
        icon: "",
        description: `${path.join(" / ")} / ${name}`,
        kind: "brand",
        brand: name,
        count,
        path,
        pathKey: `${key}\u0000brand:${name}`,
        level: path.length,
        children: [],
      }));
    }
  }

  private getSeasonalProducts(): Product[] {
    const terms = getSeasonalTerms(new Date().getMonth()).map((term) =>
      normalizeProductSearchText(term)
    );
    const products = this.products.filter((product) => {
      const text = normalizeProductSearchText(
        `${product.name} ${product.categoryId} ${product.subcategory} ${
          product.categoryPath?.join(" ") ?? ""
        }`
      );
      return terms.some((term) => term && text.includes(term));
    });

    return products.length > 0 ? products : this.featured;
  }

  getTotalCount(): number {
    this.init();
    return this.products.length;
  }

  getIndexVersion(): string {
    this.init();
    return this.indexVersion;
  }

  getSourceSignature(): string {
    this.init();
    return this.sourceSignature;
  }

  getCompactSearchIndex(): { version: string; entries: CompactSearchEntry[] } {
    this.init();
    return {
      version: `${this.indexVersion}:search-v2`,
      entries: this.searchIndex.getCompactIndex(),
    };
  }

  getById(id: string): Product | undefined {
    this.init();
    return this.byId.get(id);
  }

  getByIds(ids: string[]): Product[] {
    this.init();
    return ids
      .map((id) => this.byId.get(id))
      .filter((p): p is Product => Boolean(p));
  }

  getFeatured(limit = 6): Product[] {
    this.init();
    return this.featured.slice(0, limit);
  }

  getCategoryCount(categoryId: CategoryId): number {
    this.init();
    return this.byCategory.get(categoryId)?.length ?? 0;
  }

  getCategories(): Category[] {
    this.init();
    return this.categoryTree;
  }

  getBrands(): { name: string; count: number }[] {
    this.init();
    return this.brandList;
  }

  getFilters(params: CatalogQuery = {}): CatalogFilters {
    this.init();
    const basePool = this.selectBasePool(params);
    return this.getCachedFilters(
      basePool,
      params.categoryPath ?? [],
      this.baseScopeKey(params)
    );
  }

  suggest(q: string, limit = 8): SearchSuggestion[] {
    this.init();
    return this.searchIndex.suggest(q, null, limit);
  }

  query(params: CatalogQuery = {}): CatalogPage {
    this.init();

    const {
      q = "",
      categoryId = "all",
      subcategory = "all",
      categoryPath,
      brand,
      series,
      design,
      productType,
      cableMark,
      priceMin,
      priceMax,
      inStock,
      includePreorder = true,
      specs,
      page = 1,
      limit = DEFAULT_LIMIT,
      offset,
      includeFilters = true,
      sort = DEFAULT_PRODUCT_SORT,
    } = params;

    const safeLimit = Math.min(Math.max(1, limit), MAX_LIMIT);
    const safePage = Math.max(1, page);
    const safeOffset = Number.isFinite(offset)
      ? Math.max(0, Math.floor(Number(offset)))
      : (safePage - 1) * safeLimit;
    const queryNorm = q.trim();

    const basePool = this.selectBasePool(params);
    const pool = applyProductFilters(basePool, {
      categoryId,
      subcategory,
      categoryPath,
      brand,
      series,
      design,
      productType,
      cableMark,
      priceMin,
      priceMax,
      inStock,
      includePreorder,
      specs,
      applyCategoryFilters: Boolean(queryNorm),
    });

    const sortedPool = sortCatalogProducts(pool, sort);
    const total = sortedPool.length;
    const items = sortedPool.slice(safeOffset, safeOffset + safeLimit);
    const hasMore = safeOffset + items.length < total;

    return {
      items,
      total,
      page: safePage,
      limit: safeLimit,
      hasMore,
      filters: includeFilters
        ? this.getCachedFilters(
            basePool,
            categoryPath ?? [],
            this.baseScopeKey(params)
          )
        : undefined,
    };
  }

  queryAll(params: CatalogQuery = {}): Product[] {
    this.init();

    const {
      q = "",
      categoryId = "all",
      subcategory = "all",
      categoryPath,
      brand,
      series,
      design,
      productType,
      cableMark,
      priceMin,
      priceMax,
      inStock,
      includePreorder = true,
      specs,
      sort = DEFAULT_PRODUCT_SORT,
    } = params;

    const queryNorm = q.trim();
    const basePool = this.selectBasePool(params);
    const pool = applyProductFilters(basePool, {
      categoryId,
      subcategory,
      categoryPath,
      brand,
      series,
      design,
      productType,
      cableMark,
      priceMin,
      priceMax,
      inStock,
      includePreorder,
      specs,
      applyCategoryFilters: Boolean(queryNorm),
    });

    return sortCatalogProducts(pool, sort);
  }

  private getCachedFilters(
    products: Product[],
    activePath: string[],
    scopeKey: string
  ) {
    const key = `${this.sourceSignature}\u0000${scopeKey}\u0000active:${this.pathKey(activePath)}`;
    const cached = this.filterCache.get(key);
    if (cached) return cached;

    const filters = buildFilters(products, activePath);
    if (this.filterCache.size > 128) {
      this.filterCache.clear();
    }
    this.filterCache.set(key, filters);
    return filters;
  }

  private baseScopeKey(params: CatalogQuery = {}) {
    const {
      q = "",
      categoryId = "all",
      subcategory = "all",
      categoryPath,
      featured = false,
      preset,
      ids,
    } = params;

    return [
      `q:${q.trim()}`,
      `category:${categoryId}`,
      `subcategory:${subcategory}`,
      categoryPath?.length ? `path:${this.pathKey(categoryPath)}` : "",
      featured ? "featured" : "",
      preset ? `preset:${preset}` : "",
      ids?.length ? `ids:${ids.join(",")}` : "",
    ]
      .filter(Boolean)
      .join("\u0000");
  }

  private selectBasePool(params: CatalogQuery = {}): Product[] {
    const cacheKey = `${this.sourceSignature}\u0000base:${this.baseScopeKey(params)}`;
    const cached = this.basePoolCache.get(cacheKey);
    if (cached) return cached;

    const {
      q = "",
      categoryId = "all",
      subcategory = "all",
      categoryPath,
      featured = false,
      preset,
      ids,
    } = params;
    const queryNorm = q.trim();

    if (ids?.length) {
      return this.cacheBasePool(cacheKey, this.getByIds(ids));
    }
    if (featured) {
      return this.cacheBasePool(cacheKey, this.featured);
    }
    if (preset === "seasonal") {
      return this.cacheBasePool(cacheKey, this.getSeasonalProducts());
    }
    if (queryNorm) {
      return this.cacheBasePool(
        cacheKey,
        this.searchIndex
          .searchIds(queryNorm, null, 20000)
          .map((id) => this.byId.get(id))
          .filter((product): product is Product => Boolean(product))
      );
    }
    if (categoryPath?.length) {
      return this.cacheBasePool(
        cacheKey,
        this.byCategoryPath.get(this.pathKey(categoryPath)) ?? []
      );
    }
    if (categoryId !== "all" && subcategory !== "all") {
      return this.cacheBasePool(
        cacheKey,
        this.byCategorySubcategory.get(this.filterKey(categoryId, subcategory)) ??
          []
      );
    }
    if (categoryId !== "all") {
      return this.cacheBasePool(
        cacheKey,
        this.byCategory.get(categoryId) ?? []
      );
    }
    return this.cacheBasePool(cacheKey, this.products);
  }

  private cacheBasePool(key: string, products: Product[]) {
    if (this.basePoolCache.size > 128) {
      this.basePoolCache.clear();
    }
    this.basePoolCache.set(key, products);
    return products;
  }
}

const globalForCatalog = globalThis as unknown as {
  __productCatalog?: ProductCatalog;
};

export function getCatalog(): ProductCatalog {
  if (!globalForCatalog.__productCatalog) {
    globalForCatalog.__productCatalog = new ProductCatalog();
  }
  return globalForCatalog.__productCatalog;
}

export const catalog = getCatalog();

function moveUncategorizedLast(categories: Category[]): Category[] {
  const regular: Category[] = [];
  const uncategorized: Category[] = [];

  for (const category of categories) {
    if (category.children?.length) {
      category.children = moveUncategorizedLast(category.children);
    }
    if (category.name === UNCATEGORIZED) uncategorized.push(category);
    else regular.push(category);
  }

  return [...regular, ...uncategorized];
}

function fillCategorySummaries(categories: Category[]) {
  for (const category of categories) {
    if (category.children?.length) {
      fillCategorySummaries(category.children);
    }
    const children = category.children ?? [];
    category.subcategories = children
      .filter((child) => child.kind !== "brand")
      .map((child) => child.name);
    category.subcategoryCounts = Object.fromEntries(
      children.map((child) => [child.name, child.count ?? 0])
    );
  }
}

function countBrands(products: Product[]) {
  const counts = new Map<string, number>();

  for (const product of products) {
    const brand = normalizeBrand(product.brand);
    counts.set(brand, (counts.get(brand) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => {
      if (a.name === UNKNOWN_BRAND) return 1;
      if (b.name === UNKNOWN_BRAND) return -1;
      return a.name.localeCompare(b.name, "ru");
    });
}

function isElectroFittingBranch(products: Product[]) {
  return products.length > 0 && products.some(isElectroFittingProduct);
}

function isCableBranch(products: Product[]) {
  return products.length > 0 && products.some(isCableProduct);
}

function buildCableBrandTree(
  path: string[],
  key: string,
  products: Product[]
): Category[] {
  const brandGroups = groupProducts(products, (product) =>
    normalizeBrand(product.brand)
  );

  return countBrands(products).map(({ name, count }) => {
    const brandProducts = brandGroups.get(name) ?? [];
    return {
      id: `${key}\u0000brand:${name}`,
      name,
      icon: "",
      description: `${path.join(" / ")} / ${name}`,
      kind: "brand" as const,
      brand: name,
      count,
      path,
      pathKey: `${key}\u0000brand:${name}`,
      level: path.length,
      children: buildCableMarkNodes(path, key, name, brandProducts),
    };
  });
}

function buildCableMarkNodes(
  path: string[],
  parentKey: string,
  brand: string,
  products: Product[]
): Category[] {
  const groups = groupProducts(products, getCableMarking);

  return sortProductGroups(groups)
    .filter(([mark]) => Boolean(mark))
    .map(([mark, markProducts]) => {
      const nodeKey = `${parentKey}\u0000brand:${brand}\u0000cableMark:${mark}`;
      return {
        id: nodeKey,
        name: mark,
        icon: "",
        description: `${path.join(" / ")} / ${brand} / ${mark}`,
        kind: "cableMark" as const,
        brand,
        cableMark: mark,
        count: markProducts.length,
        path,
        pathKey: nodeKey,
        level: path.length + 1,
        children: [],
      };
    });
}

function buildElectroFittingBrandTree(
  path: string[],
  key: string,
  products: Product[]
): Category[] {
  const brandGroups = groupProducts(products, (product) =>
    normalizeBrand(product.brand)
  );

  return countBrands(products).map(({ name, count }) => {
    const brandProducts = brandGroups.get(name) ?? [];
    return {
      id: `${key}\u0000brand:${name}`,
      name,
      icon: "",
      description: `${path.join(" / ")} / ${name}`,
      kind: "brand" as const,
      brand: name,
      count,
      path,
      pathKey: `${key}\u0000brand:${name}`,
      level: path.length,
      children: buildSeriesNodes(path, key, name, brandProducts),
    };
  });
}

function buildSeriesNodes(
  path: string[],
  parentKey: string,
  brand: string,
  products: Product[]
): Category[] {
  const groups = groupProducts(products, (product) =>
    getElectroFittingSpecs(product).series
  );

  return sortProductGroups(groups)
    .filter(([series]) => Boolean(series))
    .map(([series, seriesProducts]) => {
      const children = [
        ...buildDesignNodes(path, parentKey, brand, series, seriesProducts),
        ...buildProductTypeNodes(
          path,
          parentKey,
          seriesProducts.filter(
            (product) => !getElectroFittingSpecs(product).design
          ),
          { brand, series }
        ),
      ];
      const nodeKey = `${parentKey}\u0000brand:${brand}\u0000series:${series}`;

      return {
        id: nodeKey,
        name: series,
        icon: "",
        description: `${path.join(" / ")} / ${brand} / ${series}`,
        kind: "series" as const,
        brand,
        series,
        count: seriesProducts.length,
        path,
        pathKey: nodeKey,
        level: path.length + 1,
        children,
      };
    });
}

function buildDesignNodes(
  path: string[],
  parentKey: string,
  brand: string,
  series: string,
  products: Product[]
): Category[] {
  const groups = groupProducts(products, (product) =>
    getElectroFittingSpecs(product).design
  );

  return sortProductGroups(groups)
    .filter(([design]) => Boolean(design))
    .map(([design, designProducts]) => {
      const nodeKey = `${parentKey}\u0000brand:${brand}\u0000series:${series}\u0000design:${design}`;
      return {
        id: nodeKey,
        name: design,
        icon: "",
        description: `${path.join(" / ")} / ${brand} / ${series} / ${design}`,
        kind: "design" as const,
        brand,
        series,
        design,
        count: designProducts.length,
        path,
        pathKey: nodeKey,
        level: path.length + 2,
        children: buildProductTypeNodes(path, parentKey, designProducts, {
          brand,
          series,
          design,
        }),
      };
    });
}

function buildProductTypeNodes(
  path: string[],
  parentKey: string,
  products: Product[],
  filters: Pick<Category, "brand" | "series" | "design">
): Category[] {
  const groups = groupProducts(products, (product) =>
    getElectroFittingSpecs(product).productType
  );

  return sortProductGroups(groups)
    .filter(([productType]) => Boolean(productType))
    .map(([productType, productTypeProducts]) => {
      const nodeKey = [
        parentKey,
        filters.brand ? `brand:${filters.brand}` : "",
        filters.series ? `series:${filters.series}` : "",
        filters.design ? `design:${filters.design}` : "",
        `productType:${productType}`,
      ]
        .filter(Boolean)
        .join("\u0000");

      return {
        id: nodeKey,
        name: productType,
        icon: "",
        description: `${path.join(" / ")} / ${productType}`,
        kind: "productType" as const,
        brand: filters.brand,
        series: filters.series,
        design: filters.design,
        productType,
        count: productTypeProducts.length,
        path,
        pathKey: nodeKey,
        level: path.length + 3,
        children: [],
      };
    });
}

function groupProducts(
  products: Product[],
  getKey: (product: Product) => string
) {
  const groups = new Map<string, Product[]>();

  for (const product of products) {
    const key = getKey(product).trim();
    const group = groups.get(key) ?? [];
    group.push(product);
    groups.set(key, group);
  }

  return groups;
}

function sortProductGroups(groups: Map<string, Product[]>) {
  return Array.from(groups.entries()).sort(
    (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], "ru")
  );
}

function normalizeBrand(value?: string) {
  const brand = value?.trim();
  return brand && brand.length > 0 ? brand : UNKNOWN_BRAND;
}

function sameText(a?: string, b?: string) {
  return (
    String(a ?? "").toLocaleLowerCase("ru") ===
    String(b ?? "").toLocaleLowerCase("ru")
  );
}

function productInCategoryPath(product: Product, path: string[]) {
  if (path.length === 0) return true;
  const productPath = product.categoryPath ?? [];
  return path.every((entry, index) => productPath[index] === entry);
}

function applyProductFilters(
  products: Product[],
  params: Pick<
    CatalogQuery,
    | "categoryId"
    | "subcategory"
    | "categoryPath"
    | "brand"
    | "series"
    | "design"
    | "productType"
    | "cableMark"
    | "priceMin"
    | "priceMax"
    | "inStock"
    | "includePreorder"
    | "specs"
  > & { applyCategoryFilters?: boolean }
) {
  const {
    categoryId = "all",
    subcategory = "all",
    categoryPath,
    brand,
    series,
    design,
    productType,
    cableMark,
    priceMin,
    priceMax,
    inStock,
    includePreorder = true,
    specs,
    applyCategoryFilters = false,
  } = params;
  const brandFilter = brand?.trim();
  const seriesFilter = series?.trim();
  const designFilter = design?.trim();
  const productTypeFilter = productType?.trim();
  const cableMarkFilter = cableMark?.trim();

  return products.filter((product) => {
    if (applyCategoryFilters) {
      if (categoryPath?.length && !productInCategoryPath(product, categoryPath)) {
        return false;
      }
      if (categoryId !== "all" && product.categoryId !== categoryId) {
        return false;
      }
      if (subcategory !== "all" && product.subcategory !== subcategory) {
        return false;
      }
    }
    if (brandFilter && !sameText(normalizeBrand(product.brand), brandFilter)) {
      return false;
    }
    if (cableMarkFilter && !sameText(getCableMarking(product), cableMarkFilter)) {
      return false;
    }
    if (seriesFilter || designFilter || productTypeFilter) {
      const electroSpecs = getElectroFittingSpecs(product);
      if (seriesFilter && !sameText(electroSpecs.series, seriesFilter)) {
        return false;
      }
      if (designFilter && !sameText(electroSpecs.design, designFilter)) {
        return false;
      }
      if (
        productTypeFilter &&
        !sameText(electroSpecs.productType, productTypeFilter)
      ) {
        return false;
      }
    }
    if (Number.isFinite(priceMin) && product.price < Number(priceMin)) {
      return false;
    }
    if (Number.isFinite(priceMax) && product.price > Number(priceMax)) {
      return false;
    }
    if (typeof inStock === "boolean") {
      const available = product.stock > 0;
      if (inStock !== available) return false;
    }
    if (!includePreorder && isPreorderProduct(product)) {
      return false;
    }
    if (specs && Object.keys(specs).length > 0) {
      for (const [key, value] of Object.entries(specs)) {
        if (!value) continue;
        if (!sameText(getProductSpecValue(product, key), value)) return false;
      }
    }
    return true;
  });
}

function isPreorderProduct(product: Product) {
  return (
    product.stockStatus === "preorder" ||
    (product.agentStock !== undefined && product.stock <= 0)
  );
}

function buildFilters(products: Product[], activePath: string[] = []): CatalogFilters {
  const priceValues = products
    .map((product) => product.price)
    .filter((price) => Number.isFinite(price));

  return {
    brands: countBrands(products)
      .slice(0, 80)
      .map(({ name, count }) => ({ value: name, count })),
    price: {
      min: priceValues.length ? Math.floor(Math.min(...priceValues)) : 0,
      max: priceValues.length ? Math.ceil(Math.max(...priceValues)) : 0,
    },
    availability: {
      inStock: products.filter((product) => product.stock > 0).length,
      outOfStock: products.filter((product) => product.stock <= 0).length,
    },
    categories: countNextCategories(products, activePath),
    specs: buildSpecFilters(products),
  };
}

function countNextCategories(products: Product[], activePath: string[]) {
  const counts = new Map<
    string,
    { name: string; path: string[]; count: number; level: number }
  >();
  const depth = activePath.length;

  for (const product of products) {
    const path = product.categoryPath ?? [];
    if (activePath.length && !productInCategoryPath(product, activePath)) {
      continue;
    }
    const nextPath = path[depth] ? path.slice(0, depth + 1) : path;
    if (nextPath.length === 0) continue;
    const key = nextPath.join("\u0000");
    const row = counts.get(key) ?? {
      name: nextPath[nextPath.length - 1],
      path: nextPath,
      count: 0,
      level: nextPath.length - 1,
    };
    row.count += 1;
    counts.set(key, row);
  }

  return Array.from(counts.values())
    .filter((row) => row.path.length > activePath.length)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ru"))
    .slice(0, 40);
}

const IGNORED_SPEC_KEYS = [
  "артикул",
  "бренд",
  "категория",
  "категорія",
  "подкатегория",
  "підкатегорія",
  "категория сайта",
  "путь категории",
  "url категории",
  "url подкатегории",
  "источник",
];

function buildSpecFilters(products: Product[]) {
  const groups = new Map<string, Map<string, number>>();

  for (const product of products) {
    for (const [key, value] of Object.entries(getElectricalSpecs(product))) {
      addSpecFilterValue(groups, key, value);
    }

    for (const [key, value] of Object.entries(product.specs ?? {})) {
      const normalizedKey = key.trim().toLocaleLowerCase("ru");
      const normalizedValue = String(value).trim();
      if (
        !key ||
        !normalizedValue ||
        normalizedValue.length > 80 ||
        IGNORED_SPEC_KEYS.some((ignored) => normalizedKey.includes(ignored))
      ) {
        continue;
      }
      addSpecFilterValue(groups, key, normalizedValue);
    }
  }

  return Array.from(groups.entries())
    .map(([key, values]) => ({
      key,
      values: Array.from(values.entries())
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => sortSpecValues(key, a.value, b.value, b.count - a.count))
        .slice(0, 20),
    }))
    .filter((group) => group.values.length > 1 && group.values.length <= 30)
    .sort((a, b) => specGroupOrder(a.key) - specGroupOrder(b.key))
    .slice(0, 10);
}

function addSpecFilterValue(
  groups: Map<string, Map<string, number>>,
  key: string,
  value: string
) {
  const cleanKey = key.trim();
  const cleanValue = value.trim();
  if (!cleanKey || !cleanValue) return;

  const group = groups.get(cleanKey) ?? new Map<string, number>();
  group.set(cleanValue, (group.get(cleanValue) ?? 0) + 1);
  groups.set(cleanKey, group);
}

function specGroupOrder(key: string) {
  const index = ELECTRICAL_FILTER_KEYS.indexOf(
    key as (typeof ELECTRICAL_FILTER_KEYS)[number]
  );
  return index >= 0 ? index : ELECTRICAL_FILTER_KEYS.length + 1;
}

function sortSpecValues(
  key: string,
  first: string,
  second: string,
  fallback: number
) {
  if (
    key === ELECTRICAL_FILTER_KEYS[2] ||
    key === ELECTRICAL_FILTER_KEYS[4] ||
    key === ELECTRICAL_FILTER_KEYS[1]
  ) {
    const diff = numericSpecValue(first) - numericSpecValue(second);
    if (Number.isFinite(diff) && diff !== 0) return diff;
  }

  return fallback || first.localeCompare(second, "ru", { numeric: true });
}

function numericSpecValue(value: string) {
  const parsed = Number(value.replace(",", ".").replace(/[^\d.]/g, ""));
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

function getSeasonalTerms(month: number) {
  if (month === 11 || month <= 1) {
    return ["обогрев", "тепл", "кабель", "ламп", "свет"];
  }
  if (month >= 2 && month <= 4) {
    return ["кабель", "гофр", "розет", "инструмент", "свет"];
  }
  if (month >= 5 && month <= 7) {
    return ["вентил", "прожектор", "удлин", "кабель", "сад"];
  }
  return ["ламп", "светиль", "автомат", "кабель", "обогрев"];
}
