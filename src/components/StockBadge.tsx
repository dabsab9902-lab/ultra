import { formatStock } from "@/lib/format";

interface StockBadgeProps {
  stock: number;
  unit: string;
  stockStatus?: string;
  compact?: boolean;
}

export function StockBadge({
  stock,
  unit,
  stockStatus,
  compact = false,
}: StockBadgeProps) {
  const status = stockStatus || (stock > 0 ? "in_stock" : "preorder");
  const inStock = status === "in_stock" && stock > 0;
  const preorder = status === "preorder";
  const unknown = status === "unknown";
  const low = inStock && stock < 100;
  const label = inStock
    ? `${formatStock(stock)} ${unit}`
    : preorder
      ? "Под заказ"
      : unknown
        ? "Уточнить наличие"
        : "Под заказ";

  return (
    <span
      className={`shrink-0 rounded font-semibold tabular-nums ${
        compact ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-1 text-xs"
      } ${
        inStock
          ? low
            ? "bg-amber-100 text-amber-800"
            : "bg-emerald-100 text-emerald-800"
          : unknown
            ? "bg-slate-100 text-slate-600"
            : "bg-amber-100 text-amber-800"
      }`}
    >
      {label}
    </span>
  );
}
