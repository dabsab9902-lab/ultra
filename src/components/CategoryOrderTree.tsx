"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Category } from "@/lib/types";

const CATEGORY_TREE_STATE_KEY = "ultra-svet-category-tree-state:v3";
const CATEGORY_PATH_SEPARATOR = "\u001f";

interface CategoryOrderTreeProps {
  categories: Category[];
}

interface TreeState {
  expanded: string[];
}

let memoryTreeState: TreeState = {
  expanded: [],
};

function catalogHref(category: Category) {
  const path = category.path ?? [category.name];
  const cleanPath = path.map((entry) => entry.trim()).filter(Boolean);
  const params = new URLSearchParams();

  if (cleanPath[0]) params.set("category", cleanPath[0]);
  if (cleanPath.length > 1) {
    params.set("subcategory", cleanPath[cleanPath.length - 1]);
  }
  if (cleanPath.length > 0) {
    params.set("path", cleanPath.join(CATEGORY_PATH_SEPARATOR));
  }
  if (category.brand) params.set("brand", category.brand);
  if (category.series) params.set("series", category.series);
  if (category.design) params.set("design", category.design);
  if (category.productType) params.set("productType", category.productType);
  if (category.cableMark) params.set("cableMark", category.cableMark);

  const qs = params.toString();
  return qs ? `/catalog?${qs}` : "/catalog";
}

function countLabel(count = 0) {
  return count.toLocaleString("ru-RU");
}

function nodeKey(category: Category) {
  return category.pathKey || category.id;
}

function flattenNodeKeys(categories: Category[]): Set<string> {
  const keys = new Set<string>();
  const visit = (nodes: Category[]) => {
    for (const node of nodes) {
      keys.add(nodeKey(node));
      if (node.children?.length) visit(node.children);
    }
  };
  visit(categories);
  return keys;
}

function readStoredTreeState(): TreeState {
  try {
    const raw = window.sessionStorage?.getItem(CATEGORY_TREE_STATE_KEY);
    if (!raw) return memoryTreeState;

    const parsed = JSON.parse(raw) as Partial<TreeState>;
    return {
      expanded: parsed.expanded ?? [],
    };
  } catch {
    return memoryTreeState;
  }
}

function storeTreeState(state: TreeState) {
  memoryTreeState = state;

  try {
    window.sessionStorage?.setItem(CATEGORY_TREE_STATE_KEY, JSON.stringify(state));
  } catch {
    /* session cache is optional */
  }
}

function normalizeTreeState(state: TreeState, categories: Category[]): TreeState {
  const validKeys = flattenNodeKeys(categories);
  return {
    expanded: (state.expanded ?? []).filter((key) => validKeys.has(key)),
  };
}

export function CategoryOrderTree({ categories }: CategoryOrderTreeProps) {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(
    () => new Set()
  );
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const storedState = normalizeTreeState(readStoredTreeState(), categories);
    setExpandedNodes(new Set(storedState.expanded));
    setHydrated(true);
  }, [categories]);

  useEffect(() => {
    if (!hydrated) return;
    storeTreeState({ expanded: Array.from(expandedNodes) });
  }, [expandedNodes, hydrated]);

  const totalExpanded = useMemo(() => expandedNodes.size, [expandedNodes]);

  const toggleNode = (key: string) => {
    setExpandedNodes((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const collapseAll = () => {
    setExpandedNodes(new Set());
  };

  return (
    <div className="space-y-2">
      {totalExpanded > 0 && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={collapseAll}
            className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-slate-600 ring-1 ring-slate-200 active:bg-slate-50"
          >
            Свернуть все
          </button>
        </div>
      )}

      <div className="space-y-2">
        {categories.map((category) => (
          <CategoryNodeRow
            key={nodeKey(category)}
            category={category}
            expandedNodes={expandedNodes}
            onToggle={toggleNode}
          />
        ))}
      </div>
    </div>
  );
}

function CategoryNodeRow({
  category,
  expandedNodes,
  onToggle,
}: {
  category: Category;
  expandedNodes: Set<string>;
  onToggle: (key: string) => void;
}) {
  const key = nodeKey(category);
  const children = category.children ?? [];
  const hasChildren = children.length > 0;
  const isBrand = category.kind === "brand";
  const isOpen = expandedNodes.has(key);
  const path = category.path ?? [category.name];
  const panelId = `category-panel-${key.replace(/[^\w-]/g, "-")}`;

  if (!hasChildren) {
    return (
      <Link
        href={catalogHref(category)}
        className={`flex min-h-[52px] items-center justify-between gap-3 rounded-lg px-3 py-2.5 ring-1 active:bg-slate-50 ${
          isBrand
            ? "bg-white text-slate-800 ring-slate-200"
            : "bg-white ring-slate-200"
        }`}
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold text-slate-900">
            {category.name}
          </span>
          <span className="mt-0.5 block truncate text-[11px] text-slate-500">
            {categoryKindLabel(category) || path.slice(0, -1).join(" / ")}
          </span>
        </span>
        <span className="shrink-0 rounded bg-slate-100 px-2 py-1 text-[11px] font-semibold tabular-nums text-slate-500">
          {countLabel(category.count)}
        </span>
      </Link>
    );
  }

  const brandChildren = children.filter((child) => child.kind === "brand");
  const categoryChildren = children.filter((child) => child.kind !== "brand");
  const allLinkLabel =
    brandChildren.length > 0 && categoryChildren.length === 0
      ? allProductsLabel(category.name)
      : "Все товары ветки";

  return (
    <section className="overflow-hidden rounded-lg bg-white ring-1 ring-slate-200">
      <button
        type="button"
        onClick={() => onToggle(key)}
        className="flex min-h-[58px] w-full items-center justify-between gap-3 px-3 py-3 text-left active:bg-slate-50"
        aria-expanded={isOpen}
        aria-controls={panelId}
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold text-slate-900">
            {category.name}
          </span>
          <span className="mt-0.5 block text-xs tabular-nums text-slate-500">
            {countLabel(category.count)} товаров ·{" "}
            {brandChildren.length > 0 && categoryChildren.length === 0
              ? `${brandChildren.length} брендов`
              : `${categoryChildren.length} разделов`}
          </span>
        </span>
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 transition-transform ${
            isOpen ? "rotate-90" : ""
          }`}
          aria-hidden
        >
          <ChevronIcon />
        </span>
      </button>

      {isOpen && (
        <div id={panelId} className="border-t border-slate-100 bg-slate-50 p-2">
          <Link
            href={catalogHref(category)}
            className="mb-2 flex min-h-[44px] items-center justify-between gap-3 rounded-lg bg-white px-3 text-sm font-bold text-brand-700 ring-1 ring-slate-200 active:bg-brand-50"
          >
            <span className="truncate">{allLinkLabel}</span>
            <span className="text-xs tabular-nums">{countLabel(category.count)}</span>
          </Link>

          <div className="space-y-2">
            {children.map((child) => (
              <CategoryNodeRow
                key={nodeKey(child)}
                category={child}
                expandedNodes={expandedNodes}
                onToggle={onToggle}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function allProductsLabel(name: string) {
  const lower = name.toLocaleLowerCase("ru");
  if (lower.includes("автомат")) return "Все автоматы";
  if (lower.includes("розет")) return "Все розетки";
  if (lower.includes("кабел")) return "Все кабели";
  if (lower.includes("світиль") || lower.includes("светиль")) {
    return "Все светильники";
  }
  return "Все товары";
}

function categoryKindLabel(category: Category) {
  if (category.kind === "brand") return "Бренд";
  if (category.kind === "series") return "Серия";
  if (category.kind === "design") return "Цвет / дизайн";
  if (category.kind === "productType") return "Тип товара";
  if (category.kind === "cableMark") return "Маркировка";
  return "";
}

function ChevronIcon() {
  return (
    <svg
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m9 5 7 7-7 7" />
    </svg>
  );
}
