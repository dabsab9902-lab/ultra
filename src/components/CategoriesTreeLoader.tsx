"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CategoryOrderTree } from "@/components/CategoryOrderTree";
import type { Category } from "@/lib/types";

function countLabel(count = 0) {
  return count.toLocaleString("ru-RU");
}

export function CategoriesTreeLoader() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const total = useMemo(
    () => categories.reduce((sum, category) => sum + (category.count ?? 0), 0),
    [categories]
  );

  useEffect(() => {
    let cancelled = false;

    fetch("/api/products/categories")
      .then((response) => {
        if (!response.ok) throw new Error("categories");
        return response.json() as Promise<Category[]>;
      })
      .then((items) => {
        if (!cancelled) {
          setCategories(items);
          setError("");
        }
      })
      .catch(() => {
        if (!cancelled) setError("Не удалось загрузить дерево каталога");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="px-3 py-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Каталог</h1>
          <p className="text-xs tabular-nums text-slate-500">
            {loading ? "Загрузка дерева..." : `${countLabel(total)} товаров`}
          </p>
        </div>
        <Link
          href="/catalog"
          className="rounded-lg bg-brand-600 px-3 py-2 text-xs font-bold text-white active:bg-brand-700"
        >
          Поиск
        </Link>
      </div>

      {error ? (
        <div className="rounded-lg bg-white px-3 py-8 text-center text-sm text-red-600 ring-1 ring-red-100">
          {error}
        </div>
      ) : loading ? (
        <div className="space-y-2">
          {Array.from({ length: 10 }).map((_, index) => (
            <div
              key={index}
              className="h-[58px] animate-pulse rounded-lg bg-white ring-1 ring-slate-200"
            />
          ))}
        </div>
      ) : (
        <CategoryOrderTree categories={categories} />
      )}
    </div>
  );
}
