"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { ProductListRow } from "@/components/ProductListRow";
import { ProductRowsSkeleton } from "@/components/Skeletons";
import { fetchProducts } from "@/lib/api/products";
import { useCustomerCabinet } from "@/lib/customer-cabinet";
import type { Product } from "@/lib/types";

export default function RecentPage() {
  const { hydrated, recent } = useCustomerCabinet();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const recentIds = useMemo(
    () => recent.map((entry) => entry.productId),
    [recent]
  );
  const recentKey = recentIds.join("|");

  useEffect(() => {
    if (!hydrated || recentIds.length === 0) {
      setProducts([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(false);

    fetchProducts({ ids: recentIds, limit: recentIds.length })
      .then((data) => {
        if (cancelled) return;
        const byId = new Map(data.items.map((product) => [product.id, product]));
        setProducts(
          recentIds
            .map((id) => byId.get(id))
            .filter((product): product is Product => Boolean(product))
        );
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [recentKey, recentIds, hydrated]);

  return (
    <PageShell variant="agent" title="Просмотренные">
      <div className="sticky top-0 z-30 border-b border-slate-200 bg-slate-100 safe-top">
        <div className="mx-auto max-w-lg px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                B2B кабинет
              </p>
              <h1 className="text-lg font-bold text-slate-900">Просмотренные</h1>
            </div>
            <div className="rounded-lg bg-white px-3 py-2 text-right ring-1 ring-slate-200">
              <p className="text-lg font-bold tabular-nums text-slate-900">
                {recent.length}
              </p>
              <p className="text-[10px] text-slate-500">товаров</p>
            </div>
          </div>
        </div>
      </div>

      {!hydrated || loading ? (
        <ProductRowsSkeleton count={6} />
      ) : error ? (
        <div className="px-4 py-12 text-center">
          <p className="text-sm font-bold text-slate-800">
            Не удалось загрузить просмотренные товары
          </p>
          <button
            type="button"
            onClick={() => location.reload()}
            className="mt-4 rounded-lg bg-brand-600 px-4 py-3 text-sm font-bold text-white active:bg-brand-700"
          >
            Повторить
          </button>
        </div>
      ) : recent.length === 0 ? (
        <div className="px-4 py-12 text-center">
          <p className="text-sm font-bold text-slate-800">
            Просмотренных товаров пока нет
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Откройте карточку товара, и она появится в этом списке.
          </p>
          <Link
            href="/catalog"
            className="mt-5 inline-flex rounded-lg bg-brand-600 px-5 py-3 text-sm font-bold text-white active:bg-brand-700"
          >
            Открыть каталог
          </Link>
        </div>
      ) : (
        <>
          <p className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
            Последние {products.length} из {recent.length}
          </p>
          <div className="divide-y divide-slate-200/80">
            {products.map((product) => (
              <ProductListRow key={product.id} product={product} />
            ))}
          </div>
        </>
      )}
    </PageShell>
  );
}
