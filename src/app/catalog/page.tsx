"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { SearchBar } from "@/components/SearchBar";
import { SearchSuggestions } from "@/components/SearchSuggestions";
import { ProductListRow } from "@/components/ProductListRow";
import { InfiniteScrollTrigger } from "@/components/InfiniteScrollTrigger";
import { useInfiniteProducts } from "@/hooks/useInfiniteProducts";
import { useProductSuggestions } from "@/hooks/useProductSuggestions";
import { isSkuLikeQuery, normalizeSearchQuery } from "@/lib/search/query";
import { useCart } from "@/context/CartContext";
import { fetchProducts } from "@/lib/api/products";
import { formatPrice } from "@/lib/format";
import {
  loadOrderHistory,
  type OrderSnapshot,
} from "@/lib/order-history";
import {
  CLIENT_PRICING_EVENT,
  getClientSession,
  setClientSession,
  type ClientSessionSummary,
} from "@/lib/client-pricing-session";
import {
  buildCatalogViewKey,
  saveCatalogScrollState,
  saveCatalogViewState,
} from "@/lib/catalog-view-state";
import type { CategoryId, Product } from "@/lib/types";

const SUGGEST_LIST_ID = "catalog-suggest-list";
const CATEGORY_PATH_SEPARATOR = "\u001f";
const MIN_QUICK_ORDERS = 5;
const CATALOG_TABS = [
  { key: "promo", label: "Акции" },
  { key: "seasonal", label: "Сезонный товар" },
] as const;

type CatalogTab = "promo" | "seasonal" | "quick";

interface QuickProductsState {
  orderCount: number;
  productIds: string[];
  topCategory?: string;
  topSubcategory?: string;
}

interface BreadcrumbItem {
  label: string;
  href: string;
}

function CatalogContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const categoryParam = searchParams.get("category") as CategoryId | null;
  const subcategoryParam = searchParams.get("subcategory");
  const pathParam = searchParams.get("path");
  const categoryPathParam = useMemo(
    () => parseCategoryPathParam(pathParam),
    [pathParam]
  );
  const queryParam = searchParams.get("search") ?? searchParams.get("q") ?? "";
  const tabParam = searchParams.get("tab");
  const brandParam = searchParams.get("brand") ?? "";
  const seriesParam = searchParams.get("series") ?? "";
  const designParam = searchParams.get("design") ?? "";
  const productTypeParam = searchParams.get("productType") ?? "";
  const cableMarkParam = searchParams.get("cableMark") ?? "";
  const priceMinParam = searchParams.get("priceMin") ?? "";
  const priceMaxParam = searchParams.get("priceMax") ?? "";
  const inStockParam = searchParams.get("inStock");
  const showPreorderParam = searchParams.get("showPreorder") === "true";
  const specParamKey = searchParams.getAll("spec").join("\u001e");
  const activeSpecs = useMemo(
    () => parseSpecParamKey(specParamKey),
    [specParamKey]
  );
  const activeSpecsKey = useMemo(
    () => serializeSpecFilters(activeSpecs),
    [activeSpecs]
  );
  const searchRef = useRef<HTMLInputElement>(null);
  const suggestOpenRef = useRef(false);
  const restoringScrollRef = useRef(false);

  const [inputValue, setInputValue] = useState(queryParam);
  const [submittedSearch, setSubmittedSearch] = useState(
    normalizeSearchQuery(queryParam)
  );
  const [searchOpen, setSearchOpen] = useState(Boolean(queryParam));
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [activeSuggest, setActiveSuggest] = useState(0);
  const [activeCategory, setActiveCategory] = useState<CategoryId | "all">(
    categoryParam || "all"
  );
  const [activeSubcategory, setActiveSubcategory] = useState<string | "all">(
    subcategoryParam || "all"
  );
  const [activeCategoryPath, setActiveCategoryPath] = useState<string[]>(
    categoryPathParam
  );
  const [activeTab, setActiveTab] = useState<CatalogTab | null>(
    !queryParam && isCatalogTab(tabParam) && tabParam !== "quick"
      ? tabParam
      : null
  );
  const [activeBrand, setActiveBrand] = useState(brandParam);
  const [activeSeries, setActiveSeries] = useState(seriesParam);
  const [activeDesign, setActiveDesign] = useState(designParam);
  const [activeProductType, setActiveProductType] = useState(productTypeParam);
  const [activeCableMark, setActiveCableMark] = useState(cableMarkParam);
  const [priceMinInput, setPriceMinInput] = useState(priceMinParam);
  const [priceMaxInput, setPriceMaxInput] = useState(priceMaxParam);
  const [inStockOnly, setInStockOnly] = useState(inStockParam === "true");
  const [showPreorder, setShowPreorder] = useState(showPreorderParam);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [quickProducts, setQuickProducts] = useState<QuickProductsState>({
    orderCount: 0,
    productIds: [],
  });

  const { items: suggestions } = useProductSuggestions(inputValue, 8);
  const { totalItems, totalPrice } = useCart();
  const [client, setClient] = useState<ClientSessionSummary | null>(null);

  useEffect(() => {
    const syncClient = () => setClient(getClientSession());
    syncClient();
    window.addEventListener(CLIENT_PRICING_EVENT, syncClient);
    return () => window.removeEventListener(CLIENT_PRICING_EVENT, syncClient);
  }, []);

  const refreshQuickProducts = useCallback(() => {
    let cancelled = false;
    const orders = loadOrderHistory();

    if (orders.length < MIN_QUICK_ORDERS) {
      setQuickProducts({ orderCount: orders.length, productIds: [] });
      return () => {
        cancelled = true;
      };
    }

    const fallback = buildQuickProductsState(orders);
    setQuickProducts(fallback);

    const ids = fallback.productIds.slice(0, 100);
    if (ids.length === 0) return;

    fetchProducts({ ids, limit: ids.length, includeFilters: false })
      .then((data) => {
        if (!cancelled) {
          setQuickProducts(buildQuickProductsState(orders, data.items));
        }
      })
      .catch(() => {
        if (!cancelled) setQuickProducts(fallback);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => refreshQuickProducts(), [refreshQuickProducts]);

  useEffect(() => {
    window.addEventListener(CLIENT_PRICING_EVENT, refreshQuickProducts);
    return () =>
      window.removeEventListener(CLIENT_PRICING_EVENT, refreshQuickProducts);
  }, [refreshQuickProducts]);

  suggestOpenRef.current = suggestOpen && suggestions.length > 0;
  const quickProductsAvailable =
    quickProducts.orderCount >= MIN_QUICK_ORDERS &&
    quickProducts.productIds.length > 0;
  const activePreset = activeTab === "seasonal" ? "seasonal" : undefined;
  const activeIds = activeTab === "quick" ? quickProducts.productIds : undefined;

  const {
    items,
    total,
    catalogTotal,
    loading,
    initialLoading,
    hasMore,
    error,
    loadMore,
    retry,
    filters,
    restoredScrollY,
    queryKey,
  } = useInfiniteProducts({
    q: submittedSearch,
    category: activeCategory,
    subcategory: activeSubcategory,
    categoryPath: activeCategoryPath,
    brand: activeBrand || undefined,
    series: activeSeries || undefined,
    design: activeDesign || undefined,
    productType: activeProductType || undefined,
    cableMark: activeCableMark || undefined,
    priceMin: parseOptionalNumber(priceMinInput),
    priceMax: parseOptionalNumber(priceMaxInput),
    inStock: inStockOnly ? true : undefined,
    includePreorder: showPreorder,
    specs: activeSpecsKey ? activeSpecs : undefined,
    featured: activeTab === "promo",
    preset: activePreset,
    ids: activeIds,
  });

  const catalogReturnHref = useMemo(() => {
    const params = new URLSearchParams();

    if (submittedSearch) {
      params.set("search", submittedSearch);
    } else if (activeTab) {
      params.set("tab", activeTab);
    } else if (activeCategoryPath.length > 0) {
      params.set("category", activeCategoryPath[0]);
      if (activeCategoryPath.length > 1) {
        params.set(
          "subcategory",
          activeCategoryPath[activeCategoryPath.length - 1]
        );
      }
      params.set("path", activeCategoryPath.join(CATEGORY_PATH_SEPARATOR));
    } else {
      if (activeCategory !== "all") params.set("category", activeCategory);
      if (activeSubcategory !== "all") {
        params.set("subcategory", activeSubcategory);
      }
    }

    appendFilterParams(params, {
      brand: activeBrand,
      series: activeSeries,
      design: activeDesign,
      productType: activeProductType,
      cableMark: activeCableMark,
      priceMin: priceMinInput,
      priceMax: priceMaxInput,
      inStock: inStockOnly,
      showPreorder,
      specs: activeSpecs,
    });

    const qs = params.toString();
    return qs ? `/catalog?${qs}` : "/catalog";
  }, [
    activeCategory,
    activeCategoryPath,
    activeSubcategory,
    activeBrand,
    activeSeries,
    activeDesign,
    activeProductType,
    activeCableMark,
    activeSpecs,
    activeTab,
    inStockOnly,
    showPreorder,
    priceMaxInput,
    priceMinInput,
    submittedSearch,
  ]);

  useEffect(() => {
    if (window.location.pathname !== "/catalog") return;
    const currentHref = `${window.location.pathname}${window.location.search}`;
    if (currentHref !== catalogReturnHref) {
      window.history.replaceState(window.history.state, "", catalogReturnHref);
    }
  }, [catalogReturnHref]);

  const currentCatalogViewKey = useMemo(
    () =>
      buildCatalogViewKey({
        q: submittedSearch,
        category: activeCategory,
        subcategory: activeSubcategory,
        scope: [
          activeCategoryPath.length
            ? `path:${activeCategoryPath.join(CATEGORY_PATH_SEPARATOR)}`
            : "",
          activeBrand ? `brand:${activeBrand}` : "",
          activeSeries ? `series:${activeSeries}` : "",
          activeDesign ? `design:${activeDesign}` : "",
          activeProductType ? `productType:${activeProductType}` : "",
          activeCableMark ? `cableMark:${activeCableMark}` : "",
          activeSpecsKey ? `specs:${activeSpecsKey}` : "",
          priceMinInput ? `priceMin:${priceMinInput}` : "",
          priceMaxInput ? `priceMax:${priceMaxInput}` : "",
          inStockOnly ? "inStock:true" : "",
          showPreorder ? "showPreorder:true" : "",
          activeTab === "promo" ? "featured" : "",
          activeTab === "seasonal" ? "seasonal" : "",
          activeTab === "quick" ? `ids:${quickProducts.productIds.join(",")}` : "",
        ]
          .filter(Boolean)
          .join("|"),
      }),
    [
      activeCategory,
      activeCategoryPath,
      activeSubcategory,
      activeBrand,
      activeSeries,
      activeDesign,
      activeProductType,
      activeCableMark,
      activeSpecsKey,
      activeTab,
      inStockOnly,
      showPreorder,
      priceMaxInput,
      priceMinInput,
      quickProducts.productIds,
      submittedSearch,
    ]
  );

  const focusSearch = useCallback(() => {
    const el = searchRef.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    try {
      const len = el.value.length;
      el.setSelectionRange(len, len);
    } catch {
      /* iOS */
    }
  }, []);

  useEffect(() => {
    if (!searchOpen) return;
    const id = requestAnimationFrame(() => {
      window.setTimeout(focusSearch, 50);
    });
    return () => cancelAnimationFrame(id);
  }, [focusSearch, searchOpen]);

  useEffect(() => {
    if (restoredScrollY === null || initialLoading) return;

    let cancelled = false;
    let attempts = 0;
    restoringScrollRef.current = true;
    const restore = () => {
      if (cancelled) return;
      window.scrollTo({ top: restoredScrollY, behavior: "auto" });
      attempts += 1;
      if (attempts < 5 && Math.abs(window.scrollY - restoredScrollY) > 2) {
        window.setTimeout(restore, 80);
      } else {
        window.setTimeout(() => {
          restoringScrollRef.current = false;
          saveCatalogScrollState(queryKey, window.scrollY);
        }, 120);
      }
    };

    const frame = requestAnimationFrame(restore);
    return () => {
      cancelled = true;
      restoringScrollRef.current = false;
      cancelAnimationFrame(frame);
    };
  }, [initialLoading, items.length, queryKey, restoredScrollY]);

  useEffect(() => {
    let ticking = false;
    const saveScroll = () => {
      if (restoringScrollRef.current) return;
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        if (restoringScrollRef.current) {
          ticking = false;
          return;
        }
        saveCatalogScrollState(queryKey, window.scrollY);
        ticking = false;
      });
    };

    window.addEventListener("scroll", saveScroll, { passive: true });
    window.addEventListener("pagehide", saveScroll);

    return () => {
      window.removeEventListener("scroll", saveScroll);
      window.removeEventListener("pagehide", saveScroll);
    };
  }, [queryKey]);

  useEffect(() => {
    setActiveSuggest(0);
  }, [inputValue, suggestions.length]);

  useEffect(() => {
    const normalized = normalizeSearchQuery(queryParam);
    setInputValue(queryParam);
    setSubmittedSearch(normalized);
    if (normalized) setSearchOpen(true);
    if (normalized) setActiveTab(null);
    setSuggestOpen(false);
    setActiveSuggest(0);
  }, [queryParam]);

  useEffect(() => {
    if (normalizeSearchQuery(queryParam)) return;

    if (tabParam === "quick") {
      setActiveTab(quickProductsAvailable ? "quick" : null);
      return;
    }

    setActiveTab(isCatalogTab(tabParam) ? tabParam : null);
  }, [queryParam, quickProductsAvailable, tabParam]);

  useEffect(() => {
    setActiveCategory(categoryParam || "all");
  }, [categoryParam]);

  useEffect(() => {
    setActiveSubcategory(subcategoryParam || "all");
  }, [subcategoryParam]);

  useEffect(() => {
    setActiveCategoryPath(categoryPathParam);
  }, [categoryPathParam]);

  useEffect(() => {
    setActiveBrand(brandParam);
  }, [brandParam]);

  useEffect(() => {
    setActiveSeries(seriesParam);
  }, [seriesParam]);

  useEffect(() => {
    setActiveDesign(designParam);
  }, [designParam]);

  useEffect(() => {
    setActiveProductType(productTypeParam);
  }, [productTypeParam]);

  useEffect(() => {
    setActiveCableMark(cableMarkParam);
  }, [cableMarkParam]);

  useEffect(() => {
    setPriceMinInput(priceMinParam);
  }, [priceMinParam]);

  useEffect(() => {
    setPriceMaxInput(priceMaxParam);
  }, [priceMaxParam]);

  useEffect(() => {
    setInStockOnly(inStockParam === "true");
  }, [inStockParam]);

  useEffect(() => {
    setShowPreorder(showPreorderParam);
  }, [showPreorderParam]);

  const submitSearch = useCallback(() => {
    const normalized = normalizeSearchQuery(inputValue);
    setInputValue(normalized);
    setSubmittedSearch(normalized);
    setSearchOpen(Boolean(normalized));
    setSuggestOpen(false);
    setActiveSuggest(0);
    setActiveTab(null);

    const params = new URLSearchParams(searchParams.toString());
    params.delete("q");
    params.delete("tab");
    if (normalized) {
      params.set("search", normalized);
      params.delete("category");
      params.delete("subcategory");
      params.delete("path");
      setActiveCategory("all");
      setActiveSubcategory("all");
      setActiveCategoryPath([]);
    } else {
      params.delete("search");

      if (activeCategory !== "all") params.set("category", activeCategory);
      else params.delete("category");

      if (activeSubcategory !== "all") params.set("subcategory", activeSubcategory);
      else params.delete("subcategory");

      if (activeCategoryPath.length > 0) {
        params.set("path", activeCategoryPath.join(CATEGORY_PATH_SEPARATOR));
      } else {
        params.delete("path");
      }
    }

    const qs = params.toString();
    router.replace(qs ? `/catalog?${qs}` : "/catalog", { scroll: false });
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [
    activeCategory,
    activeCategoryPath,
    activeSubcategory,
    inputValue,
    router,
    searchParams,
  ]);

  const openSearch = useCallback(() => {
    setSearchOpen(true);
    window.setTimeout(focusSearch, 60);
  }, [focusSearch]);

  const closeSearch = useCallback(() => {
    setInputValue("");
    setSuggestOpen(false);
    setActiveSuggest(0);
    if (submittedSearch) {
      setSubmittedSearch("");
      const params = new URLSearchParams(searchParams.toString());
      params.delete("q");
      params.delete("search");
      if (activeCategory !== "all") params.set("category", activeCategory);
      if (activeSubcategory !== "all") {
        params.set("subcategory", activeSubcategory);
      }
      if (activeCategoryPath.length > 0) {
        params.set("path", activeCategoryPath.join(CATEGORY_PATH_SEPARATOR));
      }
      const qs = params.toString();
      router.replace(qs ? `/catalog?${qs}` : "/catalog", { scroll: false });
    }
    setSearchOpen(false);
  }, [
    activeCategory,
    activeCategoryPath,
    activeSubcategory,
    router,
    searchParams,
    submittedSearch,
  ]);

  const updateCatalogUrl = useCallback(
    (updates: {
      brand?: string;
      series?: string;
      design?: string;
      productType?: string;
      cableMark?: string;
      priceMin?: string;
      priceMax?: string;
      inStock?: boolean;
      showPreorder?: boolean;
      spec?: { key: string; value: string };
      categoryPath?: string[];
      clearFilters?: boolean;
    }) => {
      const params = new URLSearchParams(searchParams.toString());
      const nextPath = updates.categoryPath ?? activeCategoryPath;

      if (updates.categoryPath) {
        setActiveCategoryPath(nextPath);
        setActiveCategory(nextPath[0] || "all");
        setActiveSubcategory(nextPath.length > 1 ? nextPath[nextPath.length - 1] : "all");
        setActiveSeries("");
        setActiveDesign("");
        setActiveProductType("");
        setActiveCableMark("");
        params.delete("series");
        params.delete("design");
        params.delete("productType");
        params.delete("cableMark");
        if (nextPath.length > 0) {
          params.set("category", nextPath[0]);
          if (nextPath.length > 1) params.set("subcategory", nextPath[nextPath.length - 1]);
          else params.delete("subcategory");
          params.set("path", nextPath.join(CATEGORY_PATH_SEPARATOR));
        } else {
          params.delete("category");
          params.delete("subcategory");
          params.delete("path");
        }
      }

      if (updates.clearFilters) {
        setActiveBrand("");
        setActiveSeries("");
        setActiveDesign("");
        setActiveProductType("");
        setActiveCableMark("");
        setPriceMinInput("");
        setPriceMaxInput("");
        setInStockOnly(false);
        setShowPreorder(false);
        params.delete("brand");
        params.delete("series");
        params.delete("design");
        params.delete("productType");
        params.delete("cableMark");
        params.delete("priceMin");
        params.delete("priceMax");
        params.delete("inStock");
        params.delete("showPreorder");
        params.delete("spec");
      } else {
        if (updates.brand !== undefined) {
          setActiveBrand(updates.brand);
          if (updates.brand) params.set("brand", updates.brand);
          else params.delete("brand");
        }
        if (updates.series !== undefined) {
          setActiveSeries(updates.series);
          if (updates.series) params.set("series", updates.series);
          else params.delete("series");
        }
        if (updates.design !== undefined) {
          setActiveDesign(updates.design);
          if (updates.design) params.set("design", updates.design);
          else params.delete("design");
        }
        if (updates.productType !== undefined) {
          setActiveProductType(updates.productType);
          if (updates.productType) params.set("productType", updates.productType);
          else params.delete("productType");
        }
        if (updates.cableMark !== undefined) {
          setActiveCableMark(updates.cableMark);
          if (updates.cableMark) params.set("cableMark", updates.cableMark);
          else params.delete("cableMark");
        }
        if (updates.priceMin !== undefined) {
          setPriceMinInput(updates.priceMin);
          if (updates.priceMin) params.set("priceMin", updates.priceMin);
          else params.delete("priceMin");
        }
        if (updates.priceMax !== undefined) {
          setPriceMaxInput(updates.priceMax);
          if (updates.priceMax) params.set("priceMax", updates.priceMax);
          else params.delete("priceMax");
        }
        if (updates.inStock !== undefined) {
          setInStockOnly(updates.inStock);
          if (updates.inStock) params.set("inStock", "true");
          else params.delete("inStock");
        }
        if (updates.showPreorder !== undefined) {
          setShowPreorder(updates.showPreorder);
          if (updates.showPreorder) params.set("showPreorder", "true");
          else params.delete("showPreorder");
        }
        if (updates.spec) {
          const nextSpecs = { ...activeSpecs };
          if (updates.spec.value) {
            nextSpecs[updates.spec.key] = updates.spec.value;
          } else {
            delete nextSpecs[updates.spec.key];
          }
          replaceSpecParams(params, nextSpecs);
        }
      }

      params.delete("q");
      const qs = params.toString();
      router.replace(qs ? `/catalog?${qs}` : "/catalog", { scroll: false });
      window.scrollTo({ top: 0, behavior: "auto" });
    },
    [activeCategoryPath, activeSpecs, router, searchParams]
  );

  const commitCatalogStateBeforeProductOpen = useCallback(() => {
    saveCatalogViewState({
      queryKey: currentCatalogViewKey,
      q: submittedSearch,
      category: activeCategory,
      subcategory: activeSubcategory,
      items,
      total,
      catalogTotal,
      page: Math.max(1, Math.ceil(items.length / 24)),
      hasMore,
      scrollY: window.scrollY,
    });
    saveCatalogScrollState(currentCatalogViewKey, window.scrollY);
  }, [
    activeCategory,
    activeSubcategory,
    catalogTotal,
    currentCatalogViewKey,
    hasMore,
    items,
    submittedSearch,
    total,
  ]);

  const selectSuggestion = useCallback(
    (id: string) => {
      commitCatalogStateBeforeProductOpen();
      setSuggestOpen(false);
      const productHref = `/product/${id}?from=${encodeURIComponent(catalogReturnHref)}`;
      router.push(productHref);
    },
    [catalogReturnHref, commitCatalogStateBeforeProductOpen, router]
  );

  const selectCatalogTab = useCallback((tab: CatalogTab) => {
    if (tab === "quick" && !quickProductsAvailable) return;

    setInputValue("");
    setSubmittedSearch("");
    setSearchOpen(false);
    setSuggestOpen(false);
    setActiveSuggest(0);
    setActiveCategory("all");
    setActiveSubcategory("all");
    setActiveCategoryPath([]);
    setActiveBrand("");
    setActiveSeries("");
    setActiveDesign("");
    setActiveProductType("");
    setActiveCableMark("");
    setPriceMinInput("");
    setPriceMaxInput("");
    setInStockOnly(false);
    setShowPreorder(false);
    setFiltersOpen(false);
    setActiveTab(tab);
    router.replace(`/catalog?tab=${encodeURIComponent(tab)}`, {
      scroll: false,
    });
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [quickProductsAvailable, router]);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/client/logout", { method: "POST" });
    } finally {
      setClientSession(null);
      router.refresh();
    }
  }, [router]);

  const handleSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      setSuggestOpen(false);
      return;
    }

    if (!suggestOpenRef.current) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveSuggest((i) => Math.min(i + 1, suggestions.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveSuggest((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === "Escape") {
      setSuggestOpen(false);
    }
  };

  const skuMode = isSkuLikeQuery(submittedSearch || inputValue);
  const showSuggest =
    searchOpen &&
    suggestOpen &&
    normalizeSearchQuery(inputValue).length >= 3 &&
    suggestions.length > 0;
  const breadcrumbs: BreadcrumbItem[] = [
    {
      label: "Поиск",
      href: submittedSearch
        ? makeCatalogHref({ search: submittedSearch })
        : "/catalog",
    },
  ];

  if (submittedSearch) {
    breadcrumbs.push({
      label: `Поиск: ${submittedSearch}`,
      href: makeCatalogHref({ search: submittedSearch }),
    });
  } else if (activeTab) {
    breadcrumbs.push({
      label: catalogTabLabel(activeTab),
      href: makeCatalogHref({ tab: activeTab }),
    });
  } else if (activeCategoryPath.length > 0) {
    activeCategoryPath.forEach((_, index) => {
      const path = activeCategoryPath.slice(0, index + 1);
      breadcrumbs.push({
        label: path[path.length - 1],
        href: makeCatalogHref({ path }),
      });
    });
  } else {
    if (activeCategory !== "all") {
      breadcrumbs.push({
        label: activeCategory,
        href: makeCatalogHref({ category: activeCategory }),
      });
    }
    if (activeSubcategory !== "all") {
      breadcrumbs.push({
        label: activeSubcategory,
        href: makeCatalogHref({
          category: activeCategory !== "all" ? activeCategory : undefined,
          subcategory: activeSubcategory,
        }),
      });
    }
  }

  const scopedCrumbBase = {
    search: submittedSearch || undefined,
    path: activeCategoryPath.length > 0 ? activeCategoryPath : undefined,
    category:
      activeCategoryPath.length === 0 && activeCategory !== "all"
        ? activeCategory
        : undefined,
    subcategory:
      activeCategoryPath.length === 0 && activeSubcategory !== "all"
        ? activeSubcategory
        : undefined,
  };

  if (activeBrand) {
    breadcrumbs.push({
      label: activeBrand,
      href: makeCatalogHref({ ...scopedCrumbBase, brand: activeBrand }),
    });
  }
  if (activeSeries) {
    breadcrumbs.push({
      label: activeSeries,
      href: makeCatalogHref({
        ...scopedCrumbBase,
        brand: activeBrand,
        series: activeSeries,
      }),
    });
  }
  if (activeDesign) {
    breadcrumbs.push({
      label: activeDesign,
      href: makeCatalogHref({
        ...scopedCrumbBase,
        brand: activeBrand,
        series: activeSeries,
        design: activeDesign,
      }),
    });
  }
  if (activeProductType) {
    breadcrumbs.push({
      label: activeProductType,
      href: makeCatalogHref({
        ...scopedCrumbBase,
        brand: activeBrand,
        series: activeSeries,
        design: activeDesign,
        productType: activeProductType,
      }),
    });
  }
  if (activeCableMark) {
    breadcrumbs.push({
      label: activeCableMark,
      href: makeCatalogHref({
        ...scopedCrumbBase,
        brand: activeBrand,
        cableMark: activeCableMark,
      }),
    });
  }
  const activeFilterCount = [
    activeBrand,
    activeSeries,
    activeDesign,
    activeProductType,
    activeCableMark,
    priceMinInput,
    priceMaxInput,
    inStockOnly ? "stock" : "",
    showPreorder ? "preorder" : "",
    ...Object.values(activeSpecs),
  ].filter(Boolean).length;

  return (
    <PageShell variant="agent" hideHeader>
      <div className="sticky top-0 z-50 border-b border-slate-200 bg-slate-100 safe-top">
        <div className="mx-auto max-w-lg px-2 pt-2">
          <div className="mb-2 flex items-center justify-between gap-2 px-1">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Подбор по артикулу
              </p>
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900">Поиск</p>
                {client && (
                  <div className="mt-0.5 flex items-center gap-2">
                    <span className="max-w-[150px] truncate text-[11px] font-semibold text-slate-600">
                      {client.name}
                    </span>
                    <button
                      type="button"
                      onClick={logout}
                      className="shrink-0 text-[11px] font-bold text-brand-700"
                    >
                      Выйти
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {!searchOpen && (
                <button
                  type="button"
                  onClick={openSearch}
                  className="flex h-10 items-center gap-1.5 rounded-lg bg-white px-3 text-xs font-bold text-slate-700 ring-1 ring-slate-200 active:bg-slate-50"
                  aria-label="Открыть поиск"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                  </svg>
                  <span>Поиск</span>
                </button>
              )}
              {!client && (
                <Link
                  href="/login"
                  className="rounded-lg bg-white px-2.5 py-2 text-xs font-bold text-slate-700 ring-1 ring-slate-200 active:bg-slate-50"
                >
                  Войти
                </Link>
              )}
              <Link
                href="/cart"
                className="flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-white active:bg-brand-700"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
                </svg>
                <div className="text-left leading-tight">
                  <p className="text-[10px] opacity-80">Корзина</p>
                  <p className="text-xs font-bold tabular-nums">
                    {totalItems > 0 ? `${totalItems} · ${formatPrice(totalPrice)}` : "пусто"}
                  </p>
                </div>
              </Link>
            </div>
          </div>

          <div
            className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${
              searchOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
            }`}
          >
          <div className={`relative ${searchOpen ? "overflow-visible" : "overflow-hidden"}`}>
            <SearchBar
              ref={searchRef}
              value={inputValue}
              onChange={(v) => {
                setInputValue(v);
                setSuggestOpen(normalizeSearchQuery(v).length >= 3);
              }}
              onBlur={() => {
                window.setTimeout(() => setSuggestOpen(false), 180);
              }}
              placeholder="Артикул или название..."
              large
              onKeyDown={handleSearchKeyDown}
              onSubmit={submitSearch}
              showClear={false}
              ariaExpanded={showSuggest}
              ariaControls={showSuggest ? SUGGEST_LIST_ID : undefined}
              ariaActiveDescendant={
                showSuggest ? `suggest-option-${activeSuggest}` : undefined
              }
            />
            <button
              type="button"
              onClick={closeSearch}
              className="absolute right-[4.75rem] top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 active:bg-slate-100"
              aria-label="Закрыть поиск"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
            <div id={SUGGEST_LIST_ID}>
              <SearchSuggestions
                items={suggestions}
                query={inputValue}
                visible={showSuggest}
                activeIndex={activeSuggest}
                onSelect={selectSuggestion}
                onHighlight={setActiveSuggest}
              />
            </div>
          </div>
          </div>

          <div className="mt-2 flex gap-1 overflow-x-auto pb-2 scrollbar-hide">
            {[...CATALOG_TABS, ...(quickProductsAvailable ? [{ key: "quick" as const, label: "Быстрые товары" }] : [])].map(({ label, key }) => {
              const active = activeTab === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => selectCatalogTab(key)}
                  title={
                    key === "quick"
                      ? quickProducts.topSubcategory || quickProducts.topCategory || undefined
                      : undefined
                  }
                  className={`shrink-0 rounded-md px-2.5 py-1.5 text-xs font-semibold ${
                    active
                      ? "bg-slate-800 text-white"
                      : "bg-white text-slate-600 ring-1 ring-slate-200"
                  }`}
                >
                  {label}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setFiltersOpen((value) => !value)}
              className={`shrink-0 rounded-md px-2.5 py-1.5 text-xs font-semibold ${
                filtersOpen || activeFilterCount > 0
                  ? "bg-brand-600 text-white"
                  : "bg-white text-slate-600 ring-1 ring-slate-200"
              }`}
            >
              Фильтры{activeFilterCount > 0 ? ` · ${activeFilterCount}` : ""}
            </button>
            <button
              type="button"
              onClick={() => updateCatalogUrl({ showPreorder: !showPreorder })}
              className={`shrink-0 rounded-md px-2.5 py-1.5 text-xs font-semibold ${
                showPreorder
                  ? "bg-amber-500 text-white"
                  : "bg-white text-slate-600 ring-1 ring-slate-200"
              }`}
            >
              Показывать под заказ
            </button>
          </div>

          {filtersOpen && (
            <>
            <button
              type="button"
              aria-label={"\u0417\u0430\u043a\u0440\u044b\u0442\u044c \u0444\u0438\u043b\u044c\u0442\u0440\u044b"}
              className="fixed inset-0 z-[60] bg-slate-900/35 backdrop-blur-[1px]"
              onClick={() => setFiltersOpen(false)}
            />
            <div className="fixed inset-x-0 bottom-0 z-[61] mx-auto max-h-[82vh] max-w-lg overflow-y-auto rounded-t-2xl bg-white p-3 shadow-2xl ring-1 ring-slate-200">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-slate-900">
                    {"\u0424\u0438\u043b\u044c\u0442\u0440"}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {"\u0420\u0435\u0430\u043b\u044c\u043d\u044b\u0435 \u043f\u0430\u0440\u0430\u043c\u0435\u0442\u0440\u044b \u0442\u0435\u043a\u0443\u0449\u0435\u0439 \u043a\u0430\u0442\u0435\u0433\u043e\u0440\u0438\u0438"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setFiltersOpen(false)}
                  className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-600 active:bg-slate-200"
                  aria-label={"\u0417\u0430\u043a\u0440\u044b\u0442\u044c"}
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="col-span-2 text-[11px] font-semibold text-slate-600">
                  Бренд
                  <select
                    value={activeBrand}
                    onChange={(event) =>
                      updateCatalogUrl({ brand: event.target.value })
                    }
                    className="mt-1 h-10 w-full rounded-lg border-0 bg-slate-50 px-2 text-sm font-semibold text-slate-800 ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-600"
                  >
                    <option value="">Все бренды</option>
                    {(filters?.brands ?? []).map((brand) => (
                      <option key={brand.value} value={brand.value}>
                        {brand.value} ({brand.count})
                      </option>
                    ))}
                  </select>
                </label>

                {(filters?.specs ?? []).map((group) => (
                  <label
                    key={group.key}
                    className="col-span-2 text-[11px] font-semibold text-slate-600"
                  >
                    {group.key}
                    <select
                      value={activeSpecs[group.key] ?? ""}
                      onChange={(event) =>
                        updateCatalogUrl({
                          spec: { key: group.key, value: event.target.value },
                        })
                      }
                      className="mt-1 h-10 w-full rounded-lg border-0 bg-slate-50 px-2 text-sm font-semibold text-slate-800 ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-600"
                    >
                      <option value="">
                        {"\u0412\u0441\u0435 \u0437\u043d\u0430\u0447\u0435\u043d\u0438\u044f"}
                      </option>
                      {group.values.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.value} ({item.count})
                        </option>
                      ))}
                    </select>
                  </label>
                ))}

                <label className="text-[11px] font-semibold text-slate-600">
                  Цена от
                  <input
                    value={priceMinInput}
                    inputMode="decimal"
                    onChange={(event) => setPriceMinInput(event.target.value)}
                    onBlur={() => updateCatalogUrl({ priceMin: priceMinInput })}
                    placeholder={filters?.price.min ? String(filters.price.min) : "0"}
                    className="mt-1 h-10 w-full rounded-lg border-0 bg-slate-50 px-2 text-sm font-semibold text-slate-800 ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-600"
                  />
                </label>

                <label className="text-[11px] font-semibold text-slate-600">
                  Цена до
                  <input
                    value={priceMaxInput}
                    inputMode="decimal"
                    onChange={(event) => setPriceMaxInput(event.target.value)}
                    onBlur={() => updateCatalogUrl({ priceMax: priceMaxInput })}
                    placeholder={filters?.price.max ? String(filters.price.max) : "0"}
                    className="mt-1 h-10 w-full rounded-lg border-0 bg-slate-50 px-2 text-sm font-semibold text-slate-800 ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-600"
                  />
                </label>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => updateCatalogUrl({ inStock: !inStockOnly })}
                  className={`rounded-md px-2.5 py-2 text-xs font-bold ${
                    inStockOnly
                      ? "bg-emerald-600 text-white"
                      : "bg-slate-100 text-slate-700"
                  }`}
                >
                  В наличии{filters ? ` · ${filters.availability.inStock}` : ""}
                </button>
                {activeFilterCount > 0 && (
                  <button
                    type="button"
                    onClick={() => updateCatalogUrl({ clearFilters: true })}
                    className="rounded-md bg-slate-100 px-2.5 py-2 text-xs font-bold text-slate-600"
                  >
                    Сбросить
                  </button>
                )}
              </div>

              {(filters?.categories?.length ?? 0) > 0 && (
                <div className="mt-2 flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
                  {filters?.categories.slice(0, 12).map((category) => (
                    <button
                      key={category.path.join(CATEGORY_PATH_SEPARATOR)}
                      type="button"
                      onClick={() =>
                        updateCatalogUrl({ categoryPath: category.path })
                      }
                      className="shrink-0 rounded-md bg-slate-100 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 active:bg-slate-200"
                    >
                      {category.name} · {category.count}
                    </button>
                  ))}
                </div>
              )}
            </div>
            </>
          )}

          <div className="flex items-center gap-1 overflow-x-auto border-t border-slate-200/80 px-1 py-1.5 text-[11px] text-slate-500 scrollbar-hide">
            {breadcrumbs.map((item, index) => (
              <span key={`${item.href}-${item.label}-${index}`} className="shrink-0">
                {index > 0 && <span className="mx-1 text-slate-300">/</span>}
                <Link
                  href={item.href}
                  scroll={false}
                  className={`rounded px-1 py-0.5 active:bg-slate-200 ${
                    index === breadcrumbs.length - 1
                      ? "font-semibold text-slate-700"
                      : "text-brand-600"
                  }`}
                >
                  {item.label}
                </Link>
              </span>
            ))}
          </div>

          <p className="border-t border-slate-200/80 px-1 py-1.5 text-[11px] tabular-nums text-slate-500">
            {initialLoading
              ? `Загрузка... (${catalogTotal} в базе)`
              : submittedSearch
                ? `${total} найдено · ${skuMode ? "артикул" : "название"}`
                : activeTab
                  ? `${total} товаров · ${catalogTabLabel(activeTab)}`
                : `${items.length} / ${total} · база ${catalogTotal}`}
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-lg">
        {error && (
          <div className="border-b border-red-200 bg-red-50 px-3 py-2 text-center">
            <p className="text-xs text-red-700">{error}</p>
            <button type="button" onClick={retry} className="text-xs font-semibold text-brand-600">
              Повторить
            </button>
          </div>
        )}

        {initialLoading ? (
          <div>
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                className="h-[72px] animate-pulse border-b border-slate-100 bg-white"
              />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="font-mono text-lg font-bold text-slate-400">-</p>
            <p className="mt-2 text-sm font-medium text-slate-700">Не найдено</p>
            <p className="mt-1 text-xs text-slate-500">
              Попробуйте другой раздел, подкатегорию или часть артикула
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200/80">
            {items.map((product) => (
              <ProductListRow
                key={product.id}
                product={product}
                returnHref={catalogReturnHref}
                onOpen={commitCatalogStateBeforeProductOpen}
              />
            ))}
          </div>
        )}

        <InfiniteScrollTrigger
          onLoadMore={loadMore}
          hasMore={hasMore}
          loading={loading}
        />
      </div>
    </PageShell>
  );
}

function isCatalogTab(value: string | null): value is CatalogTab {
  return value === "promo" || value === "seasonal" || value === "quick";
}

function catalogTabLabel(tab: CatalogTab) {
  if (tab === "promo") return "Акции";
  if (tab === "seasonal") return "Сезонный товар";
  return "Быстрые товары";
}

function buildQuickProductsState(
  orders: OrderSnapshot[],
  products: Product[] = []
): QuickProductsState {
  const productStats = new Map<
    string,
    { quantity: number; orders: number; lastOrdered: number; index: number }
  >();

  orders.forEach((order, orderIndex) => {
    const timestamp = Date.parse(order.date || order.savedAt) || 0;
    const seenInOrder = new Set<string>();

    order.items.forEach((item, itemIndex) => {
      const productId = String(item.productId || "").trim();
      if (!productId) return;

      const current =
        productStats.get(productId) ?? {
          quantity: 0,
          orders: 0,
          lastOrdered: 0,
          index: orderIndex * 1000 + itemIndex,
        };

      current.quantity += Math.max(1, Number(item.quantity) || 1);
      current.lastOrdered = Math.max(current.lastOrdered, timestamp);
      if (!seenInOrder.has(productId)) {
        current.orders += 1;
        seenInOrder.add(productId);
      }

      productStats.set(productId, current);
    });
  });

  const rankedProductIds = Array.from(productStats.entries())
    .sort((a, b) => {
      const first = a[1];
      const second = b[1];
      return (
        second.orders - first.orders ||
        second.quantity - first.quantity ||
        second.lastOrdered - first.lastOrdered ||
        first.index - second.index
      );
    })
    .map(([productId]) => productId);

  if (products.length === 0) {
    return {
      orderCount: orders.length,
      productIds: rankedProductIds.slice(0, 80),
    };
  }

  const byId = new Map(products.map((product) => [product.id, product]));
  const categoryScores = new Map<string, number>();
  const subcategoryScores = new Map<string, number>();

  for (const [productId, stats] of productStats) {
    const product = byId.get(productId);
    if (!product) continue;

    const score = stats.orders * 10 + stats.quantity;
    if (product.categoryId) {
      categoryScores.set(
        product.categoryId,
        (categoryScores.get(product.categoryId) ?? 0) + score
      );
    }
    if (product.subcategory) {
      const key = `${product.categoryId}\u0000${product.subcategory}`;
      subcategoryScores.set(key, (subcategoryScores.get(key) ?? 0) + score);
    }
  }

  const topCategory = topScoreKey(categoryScores);
  const topSubcategoryKey = topScoreKey(subcategoryScores);
  const topSubcategory = topSubcategoryKey?.split("\u0000")[1];
  const categoryBoostedIds = rankedProductIds.filter((productId) => {
    const product = byId.get(productId);
    if (!product) return false;
    return (
      product.categoryId === topCategory ||
      (topSubcategoryKey &&
        `${product.categoryId}\u0000${product.subcategory}` === topSubcategoryKey)
    );
  });

  return {
    orderCount: orders.length,
    productIds: uniqueStrings([...categoryBoostedIds, ...rankedProductIds]).slice(
      0,
      80
    ),
    topCategory,
    topSubcategory,
  };
}

function topScoreKey(scores: Map<string, number>) {
  return Array.from(scores.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function makeCatalogHref(options: {
  search?: string;
  tab?: CatalogTab | null;
  path?: string[];
  category?: string;
  subcategory?: string;
  brand?: string;
  series?: string;
  design?: string;
  productType?: string;
  cableMark?: string;
}) {
  const params = new URLSearchParams();
  const path = options.path?.map((entry) => entry.trim()).filter(Boolean) ?? [];

  if (options.search) {
    params.set("search", options.search);
  } else if (options.tab) {
    params.set("tab", options.tab);
  } else if (path.length > 0) {
    params.set("category", path[0]);
    if (path.length > 1) params.set("subcategory", path[path.length - 1]);
    params.set("path", path.join(CATEGORY_PATH_SEPARATOR));
  } else {
    if (options.category && options.category !== "all") {
      params.set("category", options.category);
    }
    if (options.subcategory && options.subcategory !== "all") {
      params.set("subcategory", options.subcategory);
    }
  }

  appendFilterParams(params, {
    brand: options.brand,
    series: options.series,
    design: options.design,
    productType: options.productType,
    cableMark: options.cableMark,
  });

  const qs = params.toString();
  return qs ? `/catalog?${qs}` : "/catalog";
}

function appendFilterParams(
  params: URLSearchParams,
  filters: {
    brand?: string;
    series?: string;
    design?: string;
    productType?: string;
    cableMark?: string;
    priceMin?: string;
    priceMax?: string;
    inStock?: boolean;
    showPreorder?: boolean;
    specs?: Record<string, string>;
  }
) {
  if (filters.brand) params.set("brand", filters.brand);
  else params.delete("brand");

  if (filters.series) params.set("series", filters.series);
  else params.delete("series");

  if (filters.design) params.set("design", filters.design);
  else params.delete("design");

  if (filters.productType) params.set("productType", filters.productType);
  else params.delete("productType");

  if (filters.cableMark) params.set("cableMark", filters.cableMark);
  else params.delete("cableMark");

  if (filters.priceMin) params.set("priceMin", filters.priceMin);
  else params.delete("priceMin");

  if (filters.priceMax) params.set("priceMax", filters.priceMax);
  else params.delete("priceMax");

  if (filters.inStock) params.set("inStock", "true");
  else params.delete("inStock");

  if (filters.showPreorder) params.set("showPreorder", "true");
  else params.delete("showPreorder");

  replaceSpecParams(params, filters.specs ?? {});
}

function parseSpecParamKey(value: string): Record<string, string> {
  if (!value) return {};

  const specs: Record<string, string> = {};
  for (const entry of value.split("\u001e")) {
    const [key, specValue] = entry.split(CATEGORY_PATH_SEPARATOR);
    const cleanKey = key?.trim();
    const cleanValue = specValue?.trim();
    if (cleanKey && cleanValue) specs[cleanKey] = cleanValue;
  }
  return specs;
}

function serializeSpecFilters(specs: Record<string, string>) {
  return Object.entries(specs)
    .filter((entry): entry is [string, string] => Boolean(entry[0] && entry[1]))
    .sort(([a], [b]) => a.localeCompare(b, "ru"))
    .map(([key, value]) => `${key}${CATEGORY_PATH_SEPARATOR}${value}`)
    .join("\u001e");
}

function replaceSpecParams(
  params: URLSearchParams,
  specs: Record<string, string>
) {
  params.delete("spec");
  for (const [key, value] of Object.entries(specs).sort(([a], [b]) =>
    a.localeCompare(b, "ru")
  )) {
    if (key && value) params.append("spec", `${key}${CATEGORY_PATH_SEPARATOR}${value}`);
  }
}

function parseOptionalNumber(value: string) {
  if (!value.trim()) return undefined;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseCategoryPathParam(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(CATEGORY_PATH_SEPARATOR)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export default function CatalogPage() {
  return (
    <Suspense
      fallback={
        <PageShell variant="agent" hideHeader>
          <div className="px-3 py-8 text-center text-sm text-slate-500">Загрузка...</div>
        </PageShell>
      }
    >
      <CatalogContent />
    </Suspense>
  );
}
