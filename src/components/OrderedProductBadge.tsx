"use client";

import type { ReactNode } from "react";
import { useCustomerCabinet } from "@/lib/customer-cabinet";
import type { Product } from "@/lib/types";

interface OrderedProductBadgeProps {
  product?: Product;
  productId?: string;
  compact?: boolean;
}

interface OrderedProductSurfaceProps {
  product: Product;
  children: ReactNode;
  className?: string;
  defaultClassName?: string;
  orderedClassName?: string;
}

export function useLastOrderedDate(target: Product | string | string[]) {
  const { hydrated, getLastOrderedDate } = useCustomerCabinet();
  if (!hydrated) return undefined;

  let lastOrderedAt: string | undefined;
  for (const key of getProductOrderKeys(target)) {
    const orderedAt = getLastOrderedDate(key);
    if (
      orderedAt &&
      (!lastOrderedAt || Date.parse(orderedAt) > Date.parse(lastOrderedAt))
    ) {
      lastOrderedAt = orderedAt;
    }
  }

  return lastOrderedAt;
}

export function formatOrderedDate(iso: string) {
  try {
    return new Intl.DateTimeFormat("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

export function OrderedProductBadge({
  product,
  productId,
  compact = false,
}: OrderedProductBadgeProps) {
  const lastOrderedAt = useLastOrderedDate(product ?? productId ?? []);
  if (!lastOrderedAt) return null;

  const formatted = formatOrderedDate(lastOrderedAt);
  if (!formatted) return null;

  return (
    <div
      className={`inline-flex w-fit items-center rounded-md bg-emerald-100 font-bold text-emerald-700 ring-1 ring-emerald-200 ${
        compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-[11px]"
      }`}
    >
      Заказывали: {formatted}
    </div>
  );
}

export function OrderedProductSurface({
  product,
  children,
  className = "",
  defaultClassName = "",
  orderedClassName = "",
}: OrderedProductSurfaceProps) {
  const lastOrderedAt = useLastOrderedDate(product);

  return (
    <div
      className={`${className} ${
        lastOrderedAt ? orderedClassName : defaultClassName
      }`}
    >
      {children}
    </div>
  );
}

export function getProductOrderKeys(target: Product | string | string[]) {
  const values = Array.isArray(target)
    ? target
    : typeof target === "string"
      ? [target]
      : [
          target.id,
          target.sku,
          target.specs?.Артикул,
          target.specs?.article,
          target.specs?.Article,
        ];

  return Array.from(
    new Set(
      values
        .map((value) => (value ?? "").trim().toLowerCase())
        .filter(Boolean)
    )
  );
}
