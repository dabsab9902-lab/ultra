import { formatStock } from "@/lib/format";

interface StockBadgeProps {
  stock: number;
  unit: string;
  compact?: boolean;
}

export function StockBadge({ stock, unit, compact = false }: StockBadgeProps) {
  const inStock = stock > 0;
  const low = inStock && stock < 100;

  return (
    <span
      className={`shrink-0 rounded font-semibold tabular-nums ${
        compact ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-1 text-xs"
      } ${
        !inStock
          ? "bg-red-100 text-red-700"
          : low
            ? "bg-amber-100 text-amber-800"
            : "bg-emerald-100 text-emerald-800"
      }`}
    >
      {!inStock ? "0" : formatStock(stock)} {unit}
    </span>
  );
}
