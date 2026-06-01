"use client";

import { useCustomerCabinet } from "@/lib/customer-cabinet";

export function ProductNote({ productId }: { productId: string }) {
  const { hydrated, productNotes, setProductNote } = useCustomerCabinet();
  const value = productNotes[productId] ?? "";

  if (!hydrated) return null;

  return (
    <div className="border-t border-slate-100 px-3 py-3">
      <label className="text-xs font-bold text-slate-700" htmlFor="product-note">
        Заметка по товару
      </label>
      <textarea
        id="product-note"
        value={value}
        onChange={(e) => setProductNote(productId, e.target.value)}
        placeholder="Например: брать для объекта на складе, согласовать цвет..."
        className="mt-2 min-h-20 w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-500 focus:bg-white"
      />
    </div>
  );
}
