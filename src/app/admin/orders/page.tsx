"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { clearAdminSession } from "@/lib/admin-session";
import { formatPrice } from "@/lib/format";
import {
  ORDER_STATUSES,
  type ManagerOrder,
  type OrderStatus,
} from "@/lib/manager-orders";

const ORDERS_POLL_INTERVAL_MS = 10_000;

function formatDate(iso: string) {
  try {
    return new Intl.DateTimeFormat("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

export default function AdminOrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<ManagerOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatingId, setUpdatingId] = useState("");
  const [newOrderAlert, setNewOrderAlert] = useState("");
  const knownOrderIdsRef = useRef<Set<string>>(new Set());
  const ordersLoadedRef = useRef(false);

  const loadOrders = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!silent) setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/orders", { cache: "no-store" });
      if (response.status === 401) {
        router.replace("/admin/login");
        return;
      }
      if (!response.ok) throw new Error("network");
      const data = (await response.json()) as { orders?: ManagerOrder[] };
      const nextOrders = Array.isArray(data.orders) ? data.orders : [];
      const newOrders = ordersLoadedRef.current
        ? nextOrders.filter((order) => !knownOrderIdsRef.current.has(order.id))
        : [];

      setOrders(nextOrders);
      knownOrderIdsRef.current = new Set(nextOrders.map((order) => order.id));
      ordersLoadedRef.current = true;

      if (newOrders.length > 0) {
        const message =
          newOrders.length === 1
            ? "Поступил новый заказ"
            : `Поступило новых заказов: ${newOrders.length}`;
        setNewOrderAlert(message);
        playNewOrderSignal();
        showNewOrderNotification(message);
      }
    } catch {
      setError("Не удалось загрузить заказы");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      loadOrders({ silent: true });
    }, ORDERS_POLL_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [loadOrders]);

  useEffect(() => {
    if (!newOrderAlert) return;

    const timeoutId = window.setTimeout(() => {
      setNewOrderAlert("");
    }, 6_000);

    return () => window.clearTimeout(timeoutId);
  }, [newOrderAlert]);

  const totals = useMemo(
    () => ({
      count: orders.length,
      sum: orders.reduce((value, order) => value + order.total, 0),
      newCount: orders.filter((order) => order.status === "Новый").length,
    }),
    [orders]
  );

  useEffect(() => {
    if (totals.newCount <= 0) {
      document.title = "Заказы менеджера";
      return;
    }

    document.title = `(${totals.newCount}) Новые заказы`;

    return () => {
      document.title = "Заказы менеджера";
    };
  }, [totals.newCount]);

  const updateStatus = async (order: ManagerOrder, status: OrderStatus) => {
    if (order.status === status) return;
    setUpdatingId(order.id);
    setError("");
    const previous = orders;
    setOrders((current) =>
      current.map((item) =>
        item.id === order.id ? { ...item, status } : item
      )
    );

    try {
      const response = await fetch("/api/orders", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id: order.id, status }),
      });
      if (response.status === 401) {
        router.replace("/admin/login");
        return;
      }
      if (!response.ok) throw new Error("network");
      const data = (await response.json()) as { order?: ManagerOrder };
      if (data.order) {
        setOrders((current) =>
          current.map((item) => (item.id === order.id ? data.order! : item))
        );
      }
    } catch {
      setOrders(previous);
      setError("Не удалось изменить статус");
    } finally {
      setUpdatingId("");
    }
  };

  const logout = async () => {
    try {
      await fetch("/api/admin/logout", { method: "POST" });
    } finally {
      clearAdminSession();
      router.replace("/admin/login");
      router.refresh();
    }
  };

  return (
    <PageShell variant="agent" title="Заказы менеджера" hideNav>
      <div className="sticky top-0 z-30 border-b border-slate-200 bg-slate-100 safe-top">
        <div className="mx-auto max-w-lg px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Менеджер
          </p>
          <div className="mt-1 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-slate-900">Заказы</h1>
              {totals.newCount > 0 && (
                <span className="mt-1 inline-flex items-center rounded-md bg-sky-100 px-2 py-1 text-[11px] font-bold text-sky-800 ring-1 ring-sky-200">
                  Новые заказы: {totals.newCount}
                </span>
              )}
            </div>
            <div className="flex shrink-0 gap-2">
              <Link
                href="/admin/offers"
                className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-slate-700 ring-1 ring-slate-200 active:bg-slate-50"
              >
                КП
              </Link>
              <Link
                href="/admin/clients"
                className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-slate-700 ring-1 ring-slate-200 active:bg-slate-50"
              >
                Клиенты
              </Link>
              <button
                type="button"
                onClick={() => loadOrders()}
                className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-slate-700 ring-1 ring-slate-200 active:bg-slate-50"
              >
                Обновить
              </button>
              <button
                type="button"
                onClick={logout}
                className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-white active:bg-slate-700"
              >
                Выйти
              </button>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Metric label="Всего" value={String(totals.count)} />
            <Metric label="Новые" value={String(totals.newCount)} />
            <Metric label="Сумма" value={formatPrice(totals.sum)} />
          </div>
        </div>
      </div>

      <div className="px-3 py-3">
        {error && (
          <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700 ring-1 ring-red-200">
            {error}
          </div>
        )}

        {newOrderAlert && (
          <div
            role="status"
            className="mb-3 rounded-lg bg-sky-50 px-3 py-2 text-sm font-bold text-sky-800 ring-1 ring-sky-200"
          >
            {newOrderAlert}
          </div>
        )}

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="h-36 animate-pulse rounded-lg bg-white ring-1 ring-slate-200"
              />
            ))}
          </div>
        ) : orders.length === 0 ? (
          <div className="rounded-lg bg-white px-4 py-10 text-center ring-1 ring-slate-200">
            <p className="text-sm font-bold text-slate-800">Заказов пока нет</p>
            <p className="mt-1 text-xs text-slate-500">
              Новые заказы появятся здесь после отправки клиентом.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {orders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                updating={updatingId === order.id}
                onStatusChange={(status) => updateStatus(order, status)}
              />
            ))}
          </div>
        )}
      </div>
    </PageShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white px-2 py-2 ring-1 ring-slate-200">
      <p className="text-[10px] font-medium text-slate-500">{label}</p>
      <p className="mt-0.5 truncate text-sm font-bold tabular-nums text-slate-900">
        {value}
      </p>
    </div>
  );
}

function OrderCard({
  order,
  updating,
  onStatusChange,
}: {
  order: ManagerOrder;
  updating: boolean;
  onStatusChange: (status: OrderStatus) => void;
}) {
  const totalQuantity = order.items.reduce(
    (sum, item) => sum + item.quantity,
    0
  );
  const isNew = order.status === "Новый";

  return (
    <article
      className={`rounded-lg p-3 ring-1 ${
        isNew
          ? "bg-sky-50 ring-sky-200 shadow-sm"
          : "bg-white ring-slate-200"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {isNew && (
            <span className="mb-2 inline-flex rounded-md bg-sky-600 px-2 py-1 text-[11px] font-bold text-white">
              Новый заказ
            </span>
          )}
          <p className="font-mono text-xs font-bold text-slate-500">
            {order.orderId}
          </p>
          <p className="mt-1 text-sm font-bold text-slate-900">
            {order.customer.name}
          </p>
          <p className="text-xs text-slate-500">{order.customer.phone}</p>
          {order.clientName && (
            <p className="mt-1 text-xs font-semibold text-brand-700">
              Клиент: {order.clientName}
            </p>
          )}
          {order.clientPhone && (
            <p className="text-xs font-semibold text-brand-700">
              {order.clientPhone}
            </p>
          )}
          <p className="mt-1 text-xs text-slate-400">{formatDate(order.date)}</p>
        </div>
        <div className="shrink-0 text-right">
          <StatusBadge status={order.status} />
          <p className="mt-2 text-sm font-bold tabular-nums text-slate-900">
            {formatPrice(order.total)}
          </p>
        </div>
      </div>

      {order.customer.comment && (
        <p className="mt-2 rounded-md bg-slate-50 px-2 py-1.5 text-xs text-slate-600">
          {order.customer.comment}
        </p>
      )}

      <div className="mt-3 border-t border-slate-100 pt-2">
        <div className="mb-1 flex justify-between text-[11px] font-semibold text-slate-500">
          <span>{order.items.length} арт.</span>
          <span>{totalQuantity} ед.</span>
        </div>
        <div className="space-y-2">
          {order.items.map((item, index) => (
            <div
              key={`${item.sku}-${index}`}
              className="rounded-md bg-slate-50 px-2 py-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-mono text-xs font-bold text-slate-900">
                    {item.sku}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-slate-600">
                    {item.name}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs font-semibold tabular-nums text-slate-600">
                    {item.quantity} {item.unit}
                  </p>
                  <p className="mt-0.5 text-xs font-bold tabular-nums text-slate-900">
                    {formatPrice(item.total)}
                  </p>
                </div>
              </div>
              <p className="mt-1 text-[11px] tabular-nums text-slate-400">
                {formatPrice(item.price)} / {item.unit}
              </p>
            </div>
          ))}
        </div>
      </div>

      <label className="mt-3 block text-xs font-bold text-slate-700">
        Статус заказа
      </label>
      <select
        value={order.status}
        disabled={updating}
        onChange={(event) => onStatusChange(event.target.value as OrderStatus)}
        className="mt-1 h-11 w-full rounded-lg border-0 bg-slate-50 px-3 text-sm font-semibold text-slate-900 ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-600 disabled:text-slate-400"
      >
        {ORDER_STATUSES.map((status) => (
          <option key={status} value={status}>
            {status}
          </option>
        ))}
      </select>
    </article>
  );
}

function StatusBadge({ status }: { status: OrderStatus }) {
  const className =
    status === "Выполнен"
      ? "bg-emerald-100 text-emerald-700 ring-emerald-200"
      : status === "В работе"
        ? "bg-amber-100 text-amber-700 ring-amber-200"
        : "bg-sky-100 text-sky-700 ring-sky-200";

  return (
    <span
      className={`inline-flex rounded-md px-2 py-1 text-[11px] font-bold ring-1 ${className}`}
    >
      {status}
    </span>
  );
}

function playNewOrderSignal() {
  try {
    const browserWindow = window as typeof window & {
      webkitAudioContext?: typeof AudioContext;
    };
    const AudioContextClass =
      browserWindow.AudioContext || browserWindow.webkitAudioContext;
    if (!AudioContextClass) return;
    const audioContext = new AudioContextClass();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    oscillator.type = "sine";
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.001, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, audioContext.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.35);

    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.38);
  } catch {
    /* Browser can block audio before user interaction. Visual alert still appears. */
  }
}

function showNewOrderNotification(message: string) {
  if (!("Notification" in window)) return;

  if (Notification.permission === "granted") {
    new Notification("Ultra Svet", {
      body: message,
      tag: "ultra-svet-new-order",
    });
  }
}
