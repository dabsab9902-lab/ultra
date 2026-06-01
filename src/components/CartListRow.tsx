"use client";

import Link from "next/link";
import type { Product } from "@/lib/types";
import { formatPrice } from "@/lib/format";
import { useCart } from "@/context/CartContext";
import { CartQuantityEditor } from "./CartQuantityEditor";
import { StockBadge } from "./StockBadge";

interface CartListRowProps {
  product: Product;
  quantity: number;
}

export function CartListRow({ product, quantity }: CartListRowProps) {
  const { removeItem } = useCart();
  const lineTotal = product.price * quantity;

  return (
    <li className="border-b border-slate-200/80 bg-white px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <Link href={`/product/${product.id}`} className="min-w-0 flex-1">
          <p className="font-mono text-[15px] font-bold tracking-tight text-slate-900">
            {product.sku}
          </p>
          <p className="line-clamp-2 text-[13px] leading-snug text-slate-600">
            {product.name}
          </p>
        </Link>
        <StockBadge stock={product.stock} unit={product.unit} compact />
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <CartQuantityEditor
          productId={product.id}
          quantity={quantity}
          unit={product.unit}
        />
        <div className="text-right">
          <p className="text-[11px] text-slate-400">
            {formatPrice(product.price)}/{product.unit}
          </p>
          <p className="text-base font-bold tabular-nums text-slate-900">
            {formatPrice(lineTotal)}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => removeItem(product.id)}
        className="mt-1.5 text-[11px] font-medium text-red-600 active:text-red-700"
      >
        Удалить позицию
      </button>
    </li>
  );
}
