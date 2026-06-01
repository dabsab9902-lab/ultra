"use client";

import Link from "next/link";
import { useCart } from "@/context/CartContext";
import { formatPrice } from "@/lib/format";
import { getProductExplanation } from "@/lib/product-explanations";
import type { Product } from "@/lib/types";
import { ProductImage } from "./ProductImage";
import { QuickAddButton } from "./QuickAddButton";

export interface RecommendationDisplayItem {
  product: Product;
  label?: string;
  explanation?: string;
}

interface ProductRecommendationStripProps {
  title: string;
  subtitle?: string;
  products?: Product[];
  items?: RecommendationDisplayItem[];
  compact?: boolean;
}

export function ProductRecommendationStrip({
  title,
  subtitle,
  products,
  items,
  compact = false,
}: ProductRecommendationStripProps) {
  const displayItems: RecommendationDisplayItem[] =
    items ??
    (products ?? []).map((product) => ({
      product,
      explanation: getProductExplanation(product),
    }));

  if (displayItems.length === 0) return null;

  return (
    <section className="mt-3 rounded-lg bg-white p-3 ring-1 ring-slate-200">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-slate-900">{title}</h2>
          {subtitle && (
            <p className="mt-0.5 text-xs leading-snug text-slate-500">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      <div className="mt-3 flex snap-x gap-2 overflow-x-auto pb-1">
        {displayItems.map((item) => (
          <RecommendationMiniCard
            key={`${item.label ?? "item"}-${item.product.id}`}
            item={item}
            compact={compact}
          />
        ))}
      </div>
    </section>
  );
}

function RecommendationMiniCard({
  item,
  compact,
}: {
  item: RecommendationDisplayItem;
  compact: boolean;
}) {
  const { getItemQuantity } = useCart();
  const quantity = getItemQuantity(item.product.id);
  const explanation = item.explanation ?? getProductExplanation(item.product);

  return (
    <article className="w-[168px] shrink-0 snap-start rounded-lg bg-slate-50 p-2 ring-1 ring-slate-100">
      <Link href={`/product/${item.product.id}`} className="block">
        <ProductImage product={item.product} size="list" />
        {item.label && (
          <span className="mt-2 inline-flex rounded-md bg-white px-2 py-1 text-[11px] font-bold text-brand-700 ring-1 ring-brand-100">
            {item.label}
          </span>
        )}
        <h3 className="mt-2 line-clamp-2 text-xs font-bold leading-snug text-slate-900">
          {item.product.name}
        </h3>
        <p className="mt-1 truncate font-mono text-[11px] font-semibold text-slate-500">
          {item.product.sku}
        </p>
        {!compact && (
          <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-slate-500">
            {explanation}
          </p>
        )}
        <p className="mt-2 text-sm font-bold tabular-nums text-slate-900">
          {formatPrice(item.product.price)}
        </p>
      </Link>
      {quantity > 0 && (
        <p className="mt-1 rounded-md bg-emerald-100 px-2 py-1 text-[11px] font-bold text-emerald-700">
          В корзине: {quantity} {item.product.unit}
        </p>
      )}
      <div className="mt-2">
        <QuickAddButton
          productId={item.product.id}
          minOrder={item.product.minOrder}
          showQuantityBadge={false}
        />
      </div>
    </article>
  );
}
