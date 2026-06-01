"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { useCart } from "@/context/CartContext";
import { fetchProducts } from "@/lib/api/products";
import { formatPrice } from "@/lib/format";
import { loadOrderHistory, type OrderSnapshot } from "@/lib/order-history";
import type { Product } from "@/lib/types";

function formatDate(iso: string) {
  try {
    return new Intl.DateTimeFormat("ru-RU", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

function uniqueIds(ids: string[]) {
  return Array.from(new Set(ids.filter(Boolean)));
}

export default function OrdersPage() {
  const router = useRouter();
  const { items, replaceWithOrder } = useCart();
  const [orders, setOrders] = useState<OrderSnapshot[]>([]);
  const [products, setProducts] = useState<Map<string, Product>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setOrders(loadOrderHistory());
    setLoading(false);
  }, []);

  const productIds = useMemo(
    () =>
      uniqueIds(
        orders.flatMap((order) => order.items.map((item) => item.productId))
      ),
    [orders]
  );

  useEffect(() => {
    if (!productIds.length) {
      setProducts(new Map());
      return;
    }

    let cancelled = false;
    fetchProducts({ ids: productIds, limit: productIds.length })
      .then((data) => {
        if (!cancelled) {
          setProducts(new Map(data.items.map((product) => [product.id, product])));
        }
      })
      .catch(() => {
        if (!cancelled) setProducts(new Map());
      });

    return () => {
      cancelled = true;
    };
  }, [productIds]);

  const repeatOrder = (order: OrderSnapshot) => {
    if (!order.items.length) return;
    if (
      items.length > 0 &&
      !window.confirm("Заменить текущую корзину товарами из этого заказа?")
    ) {
      return;
    }
    replaceWithOrder(order.items);
    router.push("/cart");
  };

  return (
    <PageShell variant="agent" title="История заказов">
      <div className="sticky top-0 z-30 border-b border-slate-200 bg-slate-100 safe-top">
        <div className="mx-auto max-w-lg px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            B2B кабинет
          </p>
          <div className="mt-1 flex items-center justify-between gap-3">
            <h1 className="text-lg font-bold text-slate-900">История заказов</h1>
            <Link
              href="/account"
              className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-slate-700 ring-1 ring-slate-200 active:bg-slate-50"
            >
              Кабинет
            </Link>
          </div>
        </div>
      </div>

      <div className="px-3 py-3">
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="h-24 animate-pulse rounded-lg bg-white ring-1 ring-slate-200"
              />
            ))}
          </div>
        ) : orders.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-2">
            {orders.map((order, index) => (
              <OrderCard
                key={`${order.id ?? order.savedAt}-${index}`}
                index={orders.length - index}
                order={order}
                products={products}
                onRepeat={() => repeatOrder(order)}
              />
            ))}
          </div>
        )}
      </div>
    </PageShell>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg bg-white px-4 py-10 text-center ring-1 ring-slate-200">
      <p className="text-sm font-bold text-slate-800">Заказов пока нет</p>
      <p className="mt-1 text-xs text-slate-500">
        После отправки заявки история появится здесь.
      </p>
      <Link
        href="/catalog"
        className="mt-5 inline-flex rounded-lg bg-brand-600 px-5 py-3 text-sm font-bold text-white active:bg-brand-700"
      >
        Открыть каталог
      </Link>
    </div>
  );
}

function OrderCard({
  order,
  index,
  products,
  onRepeat,
}: {
  order: OrderSnapshot;
  index: number;
  products: Map<string, Product>;
  onRepeat: () => void;
}) {
  const calculatedTotal = order.items.reduce((sum, item) => {
    const product = products.get(item.productId);
    return sum + (product?.price ?? 0) * item.quantity;
  }, 0);
  const total = order.total ?? calculatedTotal;

  return (
    <article className="rounded-lg bg-white p-3 ring-1 ring-slate-200">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-900">Заказ #{index}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {formatDate(order.savedAt)} · {order.items.length} арт.
          </p>
          {(order.customer?.name || order.customer?.phone) && (
            <p className="mt-1 truncate text-xs font-medium text-slate-600">
              {[order.customer.name, order.customer.phone].filter(Boolean).join(" · ")}
            </p>
          )}
          {order.customer?.comment && (
            <p className="mt-1 line-clamp-2 text-xs text-slate-400">
              {order.customer.comment}
            </p>
          )}
          <div className="mt-2 space-y-1">
            {order.items.slice(0, 4).map((item) => {
              const product = products.get(item.productId);
              return (
                <p
                  key={item.productId}
                  className="truncate text-xs text-slate-500"
                >
                  {product?.sku ?? item.sku ?? item.article ?? "Товар"} · {item.quantity}
                  {product ? ` ${product.unit}` : ""}
                </p>
              );
            })}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-bold tabular-nums text-slate-900">
            {total > 0 ? formatPrice(total) : "—"}
          </p>
          <button
            type="button"
            onClick={onRepeat}
            className="mt-2 rounded-md bg-brand-600 px-3 py-2 text-xs font-bold text-white transition active:scale-[0.98] active:bg-brand-700"
          >
            Повторить
          </button>
        </div>
      </div>
    </article>
  );
}
