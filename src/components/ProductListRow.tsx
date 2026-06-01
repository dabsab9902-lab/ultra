"use client";

import { memo, useMemo } from "react";
import Link from "next/link";
import type { Product } from "@/lib/types";
import { formatPrice } from "@/lib/format";
import { getProductExplanation } from "@/lib/product-explanations";
import { useCart } from "@/context/CartContext";
import { ProductImage } from "./ProductImage";
import { QuickAddButton } from "./QuickAddButton";
import { FavoriteButton } from "./FavoriteButton";
import { OrderedProductBadge, useLastOrderedDate } from "./OrderedProductBadge";

interface ProductListRowProps {
  product: Product;
  returnHref?: string;
}

function ProductListRowComponent({
  product,
  returnHref,
}: ProductListRowProps) {
  const lastOrderedAt = useLastOrderedDate(product);
  const { getItemQuantity } = useCart();
  const quantityInCart = getItemQuantity(product.id);
  const explanation = useMemo(() => getProductExplanation(product), [product]);
  const productHref = useMemo(
    () =>
      returnHref
        ? `/product/${product.id}?from=${encodeURIComponent(returnHref)}`
        : `/product/${product.id}`,
    [product.id, returnHref]
  );

  return (
    <article
      className={`border-b px-3 py-2 active:bg-slate-50 ${
        lastOrderedAt
          ? "border-emerald-200/80 bg-emerald-50/80 ring-1 ring-inset ring-emerald-200/70"
          : "border-slate-200/80 bg-white"
      }`}
      style={{ contentVisibility: "auto", containIntrinsicSize: "104px" }}
    >
      <div className="flex items-start gap-2">
        <Link
          href={productHref}
          className="flex min-w-0 flex-1 items-start gap-2.5"
        >
          <ProductImage product={product} size="list" />
          <div className="min-w-0 flex-1">
            <h3 className="line-clamp-3 text-[14px] font-semibold leading-snug text-slate-900">
              {product.name}
            </h3>
            <div className="mt-1 flex min-w-0 items-center gap-2">
              <span className="min-w-0 truncate font-mono text-[11px] font-semibold tracking-tight text-slate-500">
                {product.sku}
              </span>
              <span className="h-1 w-1 shrink-0 rounded-full bg-slate-300" />
              <span className="min-w-0 truncate text-[11px] text-slate-400">
                {product.categoryId} / {product.subcategory}
              </span>
            </div>
            {lastOrderedAt && (
              <div className="mt-1">
                <OrderedProductBadge product={product} compact />
              </div>
            )}
            {explanation && explanation.length <= 120 && (
              <p className="mt-1 line-clamp-1 text-[11px] leading-snug text-slate-500">
                {explanation}
              </p>
            )}
          </div>
        </Link>
        <FavoriteButton productId={product.id} compact />
      </div>

      <div className="mt-2 flex items-center justify-between gap-2 pl-[66px]">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <div className="flex min-w-0 items-baseline gap-1">
            <span className="text-[15px] font-bold tabular-nums text-slate-900">
              {formatPrice(product.price)}
            </span>
            <span className="text-[11px] text-slate-400">/{product.unit}</span>
          </div>
          {quantityInCart > 0 && (
            <span className="rounded-md bg-emerald-100 px-2 py-1 text-[11px] font-bold tabular-nums text-emerald-700">
              В корзине: {quantityInCart} {product.unit}
            </span>
          )}
        </div>
        <QuickAddButton
          productId={product.id}
          minOrder={product.minOrder}
          showQuantityBadge={false}
        />
      </div>
    </article>
  );
}

export const ProductListRow = memo(ProductListRowComponent);
