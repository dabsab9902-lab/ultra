"use client";

import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { CartListRow } from "@/components/CartListRow";
import { ContextualRecommendations } from "@/components/ContextualRecommendations";
import { useCart } from "@/context/CartContext";
import { formatPrice } from "@/lib/format";

function formatOrderDate(iso: string | null) {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat("uk-UA", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return null;
  }
}

export default function CartPage() {
  const {
    cartProducts,
    totalPrice,
    totalItems,
    items,
    clearCart,
    cartLoading,
    repeatLastOrder,
    hasLastOrder,
    lastOrderDate,
    lastOrderItemCount,
    hydrated,
  } = useCart();

  const orderDateLabel = formatOrderDate(lastOrderDate);

  const handleRepeat = () => {
    if (!hasLastOrder) return;
    if (
      items.length > 0 &&
      !window.confirm("Заменить текущий заказ последним сохранённым?")
    ) {
      return;
    }
    const ok = repeatLastOrder();
    if (!ok) window.alert("Нет сохранённого заказа");
  };

  const handleClear = () => {
    if (items.length === 0) return;
    if (window.confirm("Очистить корзину? Все позиции будут удалены.")) {
      clearCart();
    }
  };

  return (
    <PageShell variant="agent" title="Заказ">
      {!hydrated ? (
        <div className="px-3 py-8 text-center text-sm text-slate-500">Загрузка…</div>
      ) : items.length === 0 ? (
        <div className="px-4 py-12 text-center">
          <p className="text-sm font-semibold text-slate-800">Заказ пуст</p>
          <p className="mt-1 text-xs text-slate-500">
            Позиции сохраняются автоматически после добавления
          </p>
          <div className="mt-4 flex flex-col gap-2">
            <Link
              href="/catalog"
              className="rounded-lg bg-brand-600 px-4 py-3.5 text-sm font-bold text-white active:bg-brand-700"
            >
              К подбору
            </Link>
            {hasLastOrder && (
              <button
                type="button"
                onClick={handleRepeat}
                className="rounded-lg border border-slate-300 bg-white px-4 py-3.5 text-sm font-bold text-slate-800 active:bg-slate-50"
              >
                Повторить заказ
                {orderDateLabel && (
                  <span className="mt-0.5 block text-[11px] font-normal text-slate-500">
                    {lastOrderItemCount} арт. · {orderDateLabel}
                  </span>
                )}
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="sticky top-0 z-10 border-b border-slate-200 bg-slate-100 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs tabular-nums text-slate-600">
                <span className="font-bold text-slate-900">{cartProducts.length}</span>{" "}
                арт. ·{" "}
                <span className="font-bold text-slate-900">{totalItems}</span> ед.
              </p>
            </div>
            <div className="mt-2 flex gap-2">
              {hasLastOrder && (
                <button
                  type="button"
                  onClick={handleRepeat}
                  className="flex-1 rounded-lg border border-brand-200 bg-white py-2.5 text-xs font-bold text-brand-700 active:bg-brand-50"
                >
                  Повторить заказ
                </button>
              )}
              <button
                type="button"
                onClick={handleClear}
                className="flex-1 rounded-lg border border-red-200 bg-white py-2.5 text-xs font-bold text-red-600 active:bg-red-50"
              >
                Очистить корзину
              </button>
            </div>
          </div>

          {cartLoading && cartProducts.length === 0 ? (
            <ul>
              {items.map((item) => (
                <li
                  key={item.productId}
                  className="h-[120px] border-b border-slate-100 bg-white"
                />
              ))}
            </ul>
          ) : (
            <ul>
              {cartProducts.map(({ product, quantity }) => (
                <CartListRow
                  key={product.id}
                  product={product}
                  quantity={quantity}
                />
              ))}
            </ul>
          )}

          <div className="px-3 pb-3">
            <ContextualRecommendations
              title="Не забудьте"
              subtitle="Сопутствующие позиции к товарам в заказе."
              productIds={cartProducts.map(({ product }) => product.id)}
              compact
            />
          </div>

          <div className="sticky bottom-16 z-10 border-t border-slate-200 bg-white p-3 safe-bottom">
            <div className="rounded-lg bg-slate-50 px-3 py-2.5 ring-1 ring-slate-200">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-medium text-slate-500">Итого</span>
                <span className="text-2xl font-bold tabular-nums text-slate-900">
                  {formatPrice(totalPrice)}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] text-slate-400">
                {cartProducts.length} артикулов · {totalItems} ед. · без НДС
              </p>
            </div>
            <Link
              href="/checkout"
              className="mt-2 flex w-full items-center justify-center rounded-lg bg-brand-600 py-3.5 text-sm font-bold text-white active:bg-brand-700"
            >
              Оформить заказ
            </Link>
          </div>
        </>
      )}
    </PageShell>
  );
}
