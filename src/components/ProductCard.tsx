"use client";

import Link from "next/link";
import type { Product } from "@/lib/types";
import { formatPrice } from "@/lib/format";
import { getProductExplanation } from "@/lib/product-explanations";
import { ProductImage } from "./ProductImage";
import { AddToCartButton } from "./AddToCartButton";
import { FavoriteButton } from "./FavoriteButton";
import { StockBadge } from "./StockBadge";
import { OrderedProductBadge, useLastOrderedDate } from "./OrderedProductBadge";

interface ProductCardProps {
  product: Product;
  compact?: boolean;
}

export function ProductCard({ product, compact = false }: ProductCardProps) {
  const lastOrderedAt = useLastOrderedDate(product);
  const explanation = getProductExplanation(product);

  return (
    <article
      className={`group flex flex-col overflow-hidden rounded-2xl border shadow-card transition-shadow hover:shadow-card-hover ${
        lastOrderedAt
          ? "border-emerald-200 bg-emerald-50/80 ring-1 ring-emerald-200"
          : "border-surface-border bg-white"
      }`}
    >
      <Link href={`/product/${product.id}`} className="flex flex-1 flex-col">
        <div className="relative">
          <ProductImage product={product} size="card" />
          <FavoriteButton
            productId={product.id}
            className="absolute right-2 top-2 bg-white/95 shadow-sm"
          />
        </div>
        <div className="flex flex-1 flex-col p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[10px] text-slate-500">
              {product.sku}
            </span>
            <StockBadge
              stock={product.stock}
              unit={product.unit}
              stockStatus={product.stockStatus}
              compact
            />
          </div>
          <h3
            className={`font-semibold text-slate-900 line-clamp-2 ${
              compact ? "text-sm" : "text-base"
            }`}
          >
            {product.name}
          </h3>
          {!compact && (
            <p className="mt-1 line-clamp-2 text-xs text-slate-500">
              {explanation}
            </p>
          )}
          {lastOrderedAt && (
            <div className="mt-2">
              <OrderedProductBadge product={product} />
            </div>
          )}
          <div className="mt-auto pt-3">
            <p className="text-lg font-bold text-brand-600">
              {formatPrice(product.price)}
              <span className="text-xs font-normal text-slate-400">
                /{product.unit}
              </span>
            </p>
          </div>
        </div>
      </Link>
      <div className="border-t border-surface-border px-4 py-3">
        <AddToCartButton
          productId={product.id}
          minOrder={product.minOrder}
          unit={product.unit}
          variant="card"
        />
      </div>
    </article>
  );
}
