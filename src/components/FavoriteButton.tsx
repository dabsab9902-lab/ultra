"use client";

import { useCustomerCabinet } from "@/lib/customer-cabinet";

interface FavoriteButtonProps {
  productId: string;
  compact?: boolean;
  className?: string;
}

export function FavoriteButton({
  productId,
  compact = false,
  className = "",
}: FavoriteButtonProps) {
  const { hydrated, isFavorite, toggleFavorite } = useCustomerCabinet();
  const active = hydrated && isFavorite(productId);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toggleFavorite(productId);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`flex shrink-0 items-center justify-center rounded-md ${
        compact ? "h-9 w-9" : "h-10 w-10"
      } ${
        active
          ? "bg-amber-100 text-amber-600"
          : "bg-slate-100 text-slate-400 active:bg-slate-200"
      } ${className}`}
      aria-label={active ? "Убрать из избранного" : "Добавить в избранное"}
      aria-pressed={active}
    >
      <svg
        className={compact ? "h-4 w-4" : "h-5 w-5"}
        viewBox="0 0 24 24"
        fill={active ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M11.48 3.5a.6.6 0 0 1 1.04 0l2.18 4.42 4.88.71a.6.6 0 0 1 .33 1.02l-3.53 3.44.83 4.86a.6.6 0 0 1-.87.63L12 16.3l-4.36 2.29a.6.6 0 0 1-.87-.63l.83-4.86-3.53-3.44a.6.6 0 0 1 .33-1.02l4.88-.71 2.2-4.42Z"
        />
      </svg>
    </button>
  );
}
