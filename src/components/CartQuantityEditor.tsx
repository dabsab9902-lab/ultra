"use client";

import { useEffect, useRef, useState } from "react";
import { useCart } from "@/context/CartContext";

interface CartQuantityEditorProps {
  productId: string;
  quantity: number;
  unit: string;
}

export function CartQuantityEditor({
  productId,
  quantity,
  unit,
}: CartQuantityEditorProps) {
  const { updateQuantity, adjustQuantity } = useCart();
  const [draft, setDraft] = useState(String(quantity));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (document.activeElement !== inputRef.current) {
      setDraft(String(quantity));
    }
  }, [quantity]);

  const commit = () => {
    const digits = draft.replace(/\s/g, "");
    if (!digits) {
      setDraft(String(quantity));
      return;
    }
    const n = parseInt(digits, 10);
    if (!Number.isFinite(n) || n < 1) {
      updateQuantity(productId, 1);
      setDraft("1");
      return;
    }
    updateQuantity(productId, n);
  };

  return (
    <div className="flex items-center gap-0.5">
      <button
        type="button"
        onClick={() => adjustQuantity(productId, -1)}
        className="flex h-10 w-10 items-center justify-center rounded-md bg-slate-100 text-lg font-semibold text-slate-800 active:bg-slate-200"
        aria-label="Уменьшить"
      >
        −
      </button>
      <div className="flex items-center rounded-md bg-slate-50 ring-1 ring-slate-200">
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          enterKeyHint="done"
          value={draft}
          onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, ""))}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              inputRef.current?.blur();
            }
          }}
          className="w-[4.25rem] bg-transparent py-2 text-center font-mono text-sm font-bold tabular-nums text-slate-900 focus:outline-none"
          aria-label="Количество"
        />
        <span className="pr-2 text-[11px] font-medium text-slate-400">{unit}</span>
      </div>
      <button
        type="button"
        onClick={() => adjustQuantity(productId, 1)}
        className="flex h-10 w-10 items-center justify-center rounded-md bg-slate-100 text-lg font-semibold text-slate-800 active:bg-slate-200"
        aria-label="Увеличить"
      >
        +
      </button>
    </div>
  );
}
