"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { ContextualRecommendations } from "@/components/ContextualRecommendations";
import { PageShell } from "@/components/PageShell";
import { useCart } from "@/context/CartContext";
import { getClientSession } from "@/lib/client-pricing-session";
import { formatPrice } from "@/lib/format";
import type { ManagerOrderItem } from "@/lib/manager-orders";
import type { OrderSnapshot } from "@/lib/order-history";

interface OrderExportLine {
  productId: string;
  sku: string;
  name: string;
  quantity: number;
  unit: string;
  price: number;
  total: number;
}

export default function CheckoutPage() {
  const {
    hydrated,
    items,
    cartProducts,
    cartLoading,
    totalItems,
    totalPrice,
    submitOrder,
  } = useCart();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [comment, setComment] = useState("");
  const [touched, setTouched] = useState(false);
  const [submittedOrder, setSubmittedOrder] = useState<OrderSnapshot | null>(null);
  const [submittedOrderText, setSubmittedOrderText] = useState("");
  const [serverOrderSent, setServerOrderSent] = useState(false);
  const [serverOrderError, setServerOrderError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [shareStatus, setShareStatus] = useState("");

  useEffect(() => {
    const client = getClientSession();
    if (!client) return;
    setName((current) => current || client.name);
    setPhone((current) => current || client.phone);
  }, []);

  const productsReady = items.length === 0 || cartProducts.length === items.length;
  const canSubmit =
    hydrated &&
    items.length > 0 &&
    productsReady &&
    name.trim().length > 1 &&
    phone.trim().length > 4 &&
    !isSubmitting;

  const missingProductsCount = Math.max(0, items.length - cartProducts.length);

  const orderedLines = useMemo(
    () =>
      cartProducts.map(({ product, quantity }) => ({
        product,
        quantity,
        total: product.price * quantity,
      })),
    [cartProducts]
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTouched(true);
    if (!canSubmit) return;

    setIsSubmitting(true);
    setServerOrderError("");

    const exportLines = orderedLines.map(({ product, quantity, total }) => ({
      productId: product.id,
      sku: product.sku,
      name: product.name,
      quantity,
      unit: product.unit,
      price: product.price,
      total,
    }));

    const exportText = buildOrderText({
      name,
      phone,
      comment,
      lines: exportLines,
      total: totalPrice,
    });

    const order = submitOrder({
      customer: {
        name,
        phone,
        comment,
      },
      total: totalPrice,
      items: exportLines.map((line) => ({
        productId: line.productId,
        sku: line.sku,
        article: line.sku,
      })),
    });

    if (order) {
      const sent = await sendOrderToManager({
        order,
        customer: {
          name,
          phone,
          comment,
        },
        lines: exportLines,
        total: totalPrice,
      });

      setSubmittedOrder(order);
      setSubmittedOrderText(exportText);
      setServerOrderSent(sent);
      setServerOrderError(
        sent
          ? ""
          : "Заказ сохранен локально, но не отправлен менеджеру. Скопируйте заказ и отправьте вручную."
      );
      setShareStatus("");
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    setIsSubmitting(false);
  };

  const copySubmittedOrder = async () => {
    const ok = await copyTextToClipboard(submittedOrderText);
    setShareStatus(ok ? "Заказ скопирован" : "Не удалось скопировать заказ");
  };

  if (submittedOrder) {
    return (
      <PageShell
        variant="agent"
        title={serverOrderSent ? "Заказ отправлен" : "Заказ сохранен"}
      >
        <div className="px-3 py-4">
          <div
            className={`rounded-lg p-4 text-center ring-1 ${
              serverOrderSent
                ? "bg-emerald-50 ring-emerald-200"
                : "bg-amber-50 ring-amber-200"
            }`}
          >
            <p
              className={`text-lg font-bold ${
                serverOrderSent ? "text-emerald-800" : "text-amber-800"
              }`}
            >
              {serverOrderSent ? "Заказ отправлен" : "Заказ сохранен"}
            </p>
            <p
              className={`mt-1 text-xs ${
                serverOrderSent ? "text-emerald-700" : "text-amber-700"
              }`}
            >
              {serverOrderSent
                ? "Заказ сохранен в истории и появился в админке. Товары из него теперь будут подсвечиваться в каталоге."
                : serverOrderError}
            </p>
            <p
              className={`mt-3 font-mono text-xs ${
                serverOrderSent ? "text-emerald-700" : "text-amber-700"
              }`}
            >
              {submittedOrder.orderId}
            </p>
          </div>

          {!serverOrderSent && (
            <div className="mt-3 rounded-lg bg-white p-3 ring-1 ring-slate-200">
              <p className="text-sm font-bold text-slate-900">Ручная отправка</p>
              <div className="mt-2 grid gap-2">
                <button
                  type="button"
                  onClick={copySubmittedOrder}
                  className="rounded-lg bg-slate-900 px-3 py-3 text-sm font-bold text-white active:bg-slate-700"
                >
                  Скопировать заказ
                </button>
              </div>
              {shareStatus && (
                <p className="mt-2 text-xs font-medium text-emerald-700">
                  {shareStatus}
                </p>
              )}
              <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-600 ring-1 ring-slate-200">
                {submittedOrderText}
              </pre>
            </div>
          )}

          <div className="mt-3 grid grid-cols-2 gap-2">
            <Link
              href="/orders"
              className="rounded-lg bg-white px-3 py-3 text-center text-sm font-bold text-slate-800 ring-1 ring-slate-200 active:bg-slate-50"
            >
              История
            </Link>
            <Link
              href="/catalog"
              className="rounded-lg bg-brand-600 px-3 py-3 text-center text-sm font-bold text-white active:bg-brand-700"
            >
              В каталог
            </Link>
          </div>
        </div>
      </PageShell>
    );
  }

  if (!hydrated) {
    return (
      <PageShell variant="agent" title="Оформление">
        <div className="px-3 py-8 text-center text-sm text-slate-500">Загрузка...</div>
      </PageShell>
    );
  }

  if (items.length === 0) {
    return (
      <PageShell variant="agent" title="Оформление">
        <div className="px-4 py-12 text-center">
          <p className="text-sm font-semibold text-slate-800">Корзина пуста</p>
          <p className="mt-1 text-xs text-slate-500">
            Добавьте товары в заказ, затем вернитесь к оформлению.
          </p>
          <Link
            href="/catalog"
            className="mt-5 inline-flex rounded-lg bg-brand-600 px-5 py-3 text-sm font-bold text-white active:bg-brand-700"
          >
            В каталог
          </Link>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell variant="agent" title="Оформление">
      <form onSubmit={handleSubmit} className="px-3 py-3">
        <section className="rounded-lg bg-white p-3 ring-1 ring-slate-200">
          <h1 className="text-base font-bold text-slate-900">Оформление заказа</h1>
          <div className="mt-3 space-y-3">
            <Field label="Имя" error={touched && name.trim().length <= 1}>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                onBlur={() => setTouched(true)}
                autoComplete="name"
                className="h-11 w-full rounded-lg border-0 bg-slate-50 px-3 text-sm text-slate-900 ring-1 ring-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-600"
                placeholder="Как к вам обращаться"
              />
            </Field>

            <Field label="Телефон" error={touched && phone.trim().length <= 4}>
              <input
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                onBlur={() => setTouched(true)}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                className="h-11 w-full rounded-lg border-0 bg-slate-50 px-3 text-sm text-slate-900 ring-1 ring-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-600"
                placeholder="+380..."
              />
            </Field>

            <div>
              <label className="text-xs font-bold text-slate-700">Комментарий</label>
              <textarea
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                rows={3}
                className="mt-1 w-full resize-none rounded-lg border-0 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 ring-1 ring-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-600"
                placeholder="Адрес, время доставки или примечание"
              />
            </div>
          </div>
        </section>

        <section className="mt-3 overflow-hidden rounded-lg bg-white ring-1 ring-slate-200">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2.5">
            <h2 className="text-sm font-bold text-slate-900">Товары в заказе</h2>
            <span className="text-xs font-semibold tabular-nums text-slate-500">
              {cartProducts.length} арт. · {totalItems} ед.
            </span>
          </div>

          {cartLoading && cartProducts.length === 0 ? (
            <div className="space-y-0">
              {items.map((item) => (
                <div
                  key={item.productId}
                  className="h-[76px] animate-pulse border-b border-slate-100 bg-white last:border-b-0"
                />
              ))}
            </div>
          ) : (
            <div>
              {orderedLines.map(({ product, quantity, total }) => (
                <div
                  key={product.id}
                  className="border-b border-slate-100 px-3 py-2.5 last:border-b-0"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-sm font-bold text-slate-900">
                        {product.sku}
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-slate-600">
                        {product.name}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs font-semibold tabular-nums text-slate-500">
                        {quantity} {product.unit}
                      </p>
                      <p className="mt-1 text-sm font-bold tabular-nums text-slate-900">
                        {formatPrice(total)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
              {missingProductsCount > 0 && (
                <div className="px-3 py-2 text-xs text-slate-500">
                  Загружается еще {missingProductsCount} поз.
                </div>
              )}
            </div>
          )}
        </section>

        <div className="mt-3">
          <ContextualRecommendations
            title="Сопутствующие товары"
            subtitle="Проверьте мелкие позиции до отправки заказа."
            productIds={cartProducts.map(({ product }) => product.id)}
            compact
          />
        </div>

        <div className="sticky bottom-16 z-10 mt-3 border-t border-slate-200 bg-slate-100 py-3 safe-bottom">
          <div className="rounded-lg bg-white px-3 py-2.5 ring-1 ring-slate-200">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs font-medium text-slate-500">Сумма</span>
              <span className="text-2xl font-bold tabular-nums text-slate-900">
                {formatPrice(totalPrice)}
              </span>
            </div>
          </div>
          <button
            type="submit"
            disabled={!canSubmit}
            className="mt-2 w-full rounded-lg bg-brand-600 py-3.5 text-sm font-bold text-white active:bg-brand-700 disabled:bg-slate-300 disabled:text-slate-500"
          >
            {isSubmitting ? "Отправляем..." : "Отправить заказ"}
          </button>
        </div>
      </form>
    </PageShell>
  );
}

async function sendOrderToManager({
  order,
  customer,
  lines,
  total,
}: {
  order: OrderSnapshot;
  customer: { name: string; phone: string; comment: string };
  lines: ManagerOrderItem[];
  total: number;
}) {
  try {
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        orderId: order.orderId ?? order.id,
        date: order.date ?? order.savedAt,
        customer: {
          name: customer.name.trim(),
          phone: customer.phone.trim(),
          comment: customer.comment.trim(),
        },
        items: lines,
        total,
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

function buildOrderText({
  name,
  phone,
  comment,
  lines,
  total,
}: {
  name: string;
  phone: string;
  comment: string;
  lines: OrderExportLine[];
  total: number;
}) {
  const parts = [
    "Новый заказ Ultra Svet",
    "",
    `Имя клиента: ${name.trim()}`,
    `Телефон: ${phone.trim()}`,
    `Комментарий: ${comment.trim() || "-"}`,
    "",
    "Товары:",
    ...lines.flatMap((line, index) => [
      `${index + 1}. ${line.sku}`,
      line.name,
      `Количество: ${line.quantity} ${line.unit}`,
      `Цена: ${formatMessengerPrice(line.price)}`,
      `Сумма: ${formatMessengerPrice(line.total)}`,
      "",
    ]),
    `Итоговая сумма: ${formatMessengerPrice(total)}`,
  ];

  return parts.join("\n").trim();
}

function formatMessengerPrice(value: number) {
  return formatPrice(value).replace(/\u00a0/g, " ");
}

async function copyTextToClipboard(text: string) {
  if (!text.trim()) return false;

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fallback below */
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="text-xs font-bold text-slate-700">{label}</label>
      <div className="mt-1">{children}</div>
      {error && (
        <p className="mt-1 text-[11px] font-medium text-red-600">
          Заполните поле
        </p>
      )}
    </div>
  );
}
