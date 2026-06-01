"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCart } from "@/context/CartContext";
import { formatPrice } from "@/lib/format";
import {
  CLIENT_PRICING_EVENT,
  getClientSession,
  setClientSession,
  type ClientSessionSummary,
} from "@/lib/client-pricing-session";

export function Header({
  title,
  compact = false,
}: {
  title?: string;
  compact?: boolean;
}) {
  const { totalItems, totalPrice } = useCart();
  const router = useRouter();
  const [client, setClient] = useState<ClientSessionSummary | null>(null);

  useEffect(() => {
    const syncClient = () => setClient(getClientSession());
    syncClient();
    window.addEventListener(CLIENT_PRICING_EVENT, syncClient);
    return () => window.removeEventListener(CLIENT_PRICING_EVENT, syncClient);
  }, []);

  const logout = async () => {
    try {
      await fetch("/api/client/logout", { method: "POST" });
    } finally {
      setClientSession(null);
      router.refresh();
    }
  };

  if (compact) {
    return (
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-slate-100 safe-top">
        <div className="mx-auto flex min-h-11 max-w-lg items-center justify-between gap-2 px-3 py-1.5">
          <div className="min-w-0">
            <Link href="/" className="block truncate text-sm font-bold text-slate-900">
              Ultra Svet
            </Link>
            {client && (
              <div className="mt-0.5 flex items-center gap-2">
                <span className="truncate text-[11px] font-semibold text-slate-600">
                  {client.name}
                </span>
                <button
                  type="button"
                  onClick={logout}
                  className="shrink-0 text-[11px] font-bold text-brand-700"
                >
                  Выйти
                </button>
              </div>
            )}
          </div>
          <Link
            href="/cart"
            className="shrink-0 text-xs font-semibold tabular-nums text-brand-600"
          >
            {totalItems > 0
              ? `${totalItems} · ${formatPrice(totalPrice)}`
              : "Корзина"}
          </Link>
        </div>
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-40 border-b border-surface-border bg-white/95 backdrop-blur-sm safe-top">
      <div className="mx-auto flex min-h-12 max-w-lg items-center justify-between gap-2 px-3 py-1.5">
        <div className="min-w-0">
          <Link href="/catalog" className="block truncate text-sm font-bold text-slate-900">
            {title ?? "Ultra Svet"}
          </Link>
          {client && (
            <div className="mt-0.5 flex items-center gap-2">
              <span className="truncate text-[11px] font-semibold text-slate-600">
                {client.name}
              </span>
              <button
                type="button"
                onClick={logout}
                className="shrink-0 text-[11px] font-bold text-brand-700"
              >
                Выйти
              </button>
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!client && (
            <Link
              href="/login"
              className="rounded-lg bg-white px-2.5 py-2 text-xs font-bold text-slate-700 ring-1 ring-slate-200 active:bg-slate-50"
            >
              Войти
            </Link>
          )}
          <Link
            href="/cart"
            className="relative flex h-9 items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 text-xs font-semibold text-slate-800"
          >
            Заказ
            {totalItems > 0 && (
              <span className="rounded bg-brand-600 px-1.5 py-0.5 text-[10px] font-bold text-white tabular-nums">
                {totalItems > 99 ? "99+" : totalItems}
              </span>
            )}
          </Link>
        </div>
      </div>
    </header>
  );
}
