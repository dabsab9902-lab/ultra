"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { ProductListRow } from "@/components/ProductListRow";
import { ProductRowsSkeleton } from "@/components/Skeletons";
import { fetchProducts } from "@/lib/api/products";
import { useCustomerCabinet } from "@/lib/customer-cabinet";
import type { Product } from "@/lib/types";

const CHUNK_SIZE = 100;

function chunkIds(ids: string[]) {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    chunks.push(ids.slice(i, i + CHUNK_SIZE));
  }
  return chunks;
}

export default function FavoritesPage() {
  const { hydrated, favoriteIds, favoriteCount } = useCustomerCabinet();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const favoriteKey = favoriteIds.join("|");

  useEffect(() => {
    if (!hydrated || favoriteIds.length === 0) {
      setProducts([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(false);

    Promise.all(
      chunkIds(favoriteIds).map((ids) =>
        fetchProducts({ ids, limit: ids.length }).then((data) => data.items)
      )
    )
      .then((chunks) => {
        if (cancelled) return;
        const byId = new Map(chunks.flat().map((product) => [product.id, product]));
        setProducts(
          favoriteIds
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
  }, [favoriteKey, favoriteIds, hydrated]);

  const loadedCount = useMemo(() => products.length, [products]);

  return (
    <PageShell variant="agent" title="Избранное">
      <div className="sticky top-0 z-30 border-b border-slate-200 bg-slate-100 safe-top">
        <div className="mx-auto max-w-lg px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                B2B подбор
              </p>
              <h1 className="text-lg font-bold text-slate-900">Избранное</h1>
            </div>
            <div className="rounded-lg bg-white px-3 py-2 text-right ring-1 ring-slate-200">
              <p className="text-lg font-bold tabular-nums text-slate-900">
                {favoriteCount}
              </p>
              <p className="text-[10px] text-slate-500">товаров</p>
            </div>
          </div>
          {favoriteCount > 0 && (
            <p className="mt-2 text-xs text-slate-500">
              Звезды сохраняются на этом устройстве и доступны после перезагрузки.
            </p>
          )}
        </div>
      </div>

      {!hydrated || loading ? (
        <ProductRowsSkeleton count={6} />
      ) : error ? (
        <div className="px-4 py-12 text-center">
          <p className="text-sm font-bold text-slate-800">
            Не удалось загрузить избранное
          </p>
          <button
            type="button"
            onClick={() => location.reload()}
            className="mt-4 rounded-lg bg-brand-600 px-4 py-3 text-sm font-bold text-white"
          >
            Повторить
          </button>
        </div>
      ) : favoriteCount === 0 ? (
        <div className="px-4 py-12 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-amber-50 text-amber-500">
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.5a.6.6 0 0 1 1.04 0l2.18 4.42 4.88.71a.6.6 0 0 1 .33 1.02l-3.53 3.44.83 4.86a.6.6 0 0 1-.87.63L12 16.3l-4.36 2.29a.6.6 0 0 1-.87-.63l.83-4.86-3.53-3.44a.6.6 0 0 1 .33-1.02l4.88-.71 2.2-4.42Z" />
            </svg>
          </div>
          <p className="mt-4 text-sm font-bold text-slate-800">
            Пока нет избранных товаров
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Нажимайте звезду в каталоге, чтобы собрать быстрый список закупки.
          </p>
          <Link
            href="/catalog"
            className="mt-5 inline-flex rounded-lg bg-brand-600 px-5 py-3 text-sm font-bold text-white"
          >
            Открыть каталог
          </Link>
        </div>
      ) : (
        <>
          <p className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
            Показано {loadedCount} из {favoriteCount}
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
