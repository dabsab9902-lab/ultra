"use client";

import { useState } from "react";
import { useCart } from "@/context/CartContext";

interface AddToCartButtonProps {
  productId: string;
  minOrder: number;
  unit: string;
  variant?: "card" | "full";
}

export function AddToCartButton({
  productId,
  unit,
  variant = "full",
}: AddToCartButtonProps) {
  const { addItem, getItemQuantity } = useCart();
  const qty = getItemQuantity(productId);
  const [draft, setDraft] = useState("1");

  const readQuantity = () => {
    const next = Math.max(1, parseInt(draft || "1", 10) || 1);
    setDraft(String(next));
    return next;
  };

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    addItem(productId, 1, readQuantity());
  };

  const input = (
    <label className="flex h-11 shrink-0 items-center overflow-hidden rounded-lg bg-white ring-1 ring-slate-200">
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
        onClick={(e) => e.stopPropagation()}
        className="h-full w-16 bg-white text-center font-mono text-base font-bold tabular-nums text-slate-900 focus:outline-none"
        aria-label="Количество"
      />
      <span className="pr-2 text-[11px] font-semibold text-slate-400">
        {unit}
      </span>
    </label>
  );

  if (variant === "card") {
    return (
      <div className="flex items-center gap-2">
        {input}
        <button
          type="button"
          onClick={handleClick}
          className={`h-11 flex-1 rounded-lg px-3 text-sm font-bold active:opacity-90 ${
            qty > 0 ? "bg-brand-700 text-white" : "bg-brand-600 text-white"
          }`}
        >
          {qty > 0 ? "Добавить еще" : "В корзину"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {input}
      <button
        type="button"
        onClick={handleClick}
        className={`flex h-12 flex-1 items-center justify-center gap-2 rounded-xl px-3 text-base font-bold active:opacity-90 ${
          qty > 0 ? "bg-brand-700 text-white" : "bg-brand-600 text-white"
        }`}
      >
        <svg
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        {qty > 0 ? "Добавить еще" : "В корзину"}
      </button>
    </div>
  );
}
