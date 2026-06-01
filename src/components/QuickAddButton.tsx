"use client";

import { useState } from "react";
import { useCart } from "@/context/CartContext";

interface QuickAddButtonProps {
  productId: string;
  minOrder: number;
  showQuantityBadge?: boolean;
}

export function QuickAddButton({
  productId,
  showQuantityBadge = true,
}: QuickAddButtonProps) {
  const { addItem, getItemQuantity } = useCart();
  const qty = getItemQuantity(productId);
  const [draft, setDraft] = useState("1");

  const readQuantity = () => {
    const next = Math.max(1, parseInt(draft || "1", 10) || 1);
    setDraft(String(next));
    return next;
  };

  const handleAdd = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    addItem(productId, 1, readQuantity());
  };

  const stopCardNavigation = (e: React.SyntheticEvent) => {
    e.stopPropagation();
  };

  return (
    <div
      className="flex shrink-0 items-center overflow-hidden rounded-lg bg-white ring-1 ring-slate-200"
      onClick={stopCardNavigation}
    >
      <input
        type="text"
        inputMode="numeric"
        enterKeyHint="done"
        value={draft}
        onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, ""))}
        onBlur={readQuantity}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
        className="h-11 w-12 bg-white text-center font-mono text-sm font-bold tabular-nums text-slate-900 focus:outline-none"
        aria-label="Количество"
      />
      <button
        type="button"
        onClick={handleAdd}
        className={`relative flex h-11 w-11 shrink-0 items-center justify-center font-bold active:opacity-90 ${
          qty > 0
            ? "bg-brand-700 text-white ring-2 ring-inset ring-brand-300"
            : "bg-brand-600 text-white"
        }`}
        aria-label="Добавить в корзину"
      >
        <span className="text-xl leading-none">+</span>
        {showQuantityBadge && qty > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-white px-0.5 text-[9px] font-bold text-brand-700">
            {qty > 99 ? "99+" : qty}
          </span>
        )}
      </button>
    </div>
  );
}
