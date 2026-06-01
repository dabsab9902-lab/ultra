"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { clearAdminSession } from "@/lib/admin-session";
import type { ClientRecord } from "@/lib/clients";
import {
  PROPOSAL_STATUS_ACCEPTED,
  PROPOSAL_STATUS_REJECTED,
  type CommercialProposal,
} from "@/lib/commercial-proposals";
import { formatPrice } from "@/lib/format";
import type { ManagerOrder, ManagerOrderItem } from "@/lib/manager-orders";

interface ClientStats {
  orderCount: number;
  totalAmount: number;
  lastOrder: ManagerOrder | null;
  topCategories: { name: string; count: number }[];
  topBrands: { name: string; count: number }[];
}

interface BrandRow {
  brand: string;
  count: number;
  percent: number;
  hasDiscount: boolean;
}

interface ClientDetails {
  client: ClientRecord;
  orders: ManagerOrder[];
  proposals: CommercialProposal[];
  stats: ClientStats;
  brands: BrandRow[];
}

const EMPTY_LINE = {
  sku: "",
  name: "",
  quantity: "1",
  unit: "шт",
  price: "",
};

export default function AdminClientCardPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [details, setDetails] = useState<ClientDetails | null>(null);
  const [draft, setDraft] = useState<ClientRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [brandQuery, setBrandQuery] = useState("");
  const [newCode, setNewCode] = useState("");
  const [line, setLine] = useState(EMPTY_LINE);
  const [proposalLine, setProposalLine] = useState(EMPTY_LINE);
  const [proposalItems, setProposalItems] = useState<ManagerOrderItem[]>([]);
  const [proposalComment, setProposalComment] = useState("");

  const loadDetails = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/clients/${id}`, { cache: "no-store" });
      if (response.status === 401) {
        router.replace("/admin/login");
        return;
      }
      if (!response.ok) throw new Error("network");
      const data = (await response.json()) as ClientDetails;
      setDetails(data);
      setDraft(data.client);
    } catch {
      setError("Не удалось загрузить карточку клиента");
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    loadDetails();
  }, [loadDetails]);

  const visibleBrands = useMemo(() => {
    const query = brandQuery.trim().toLocaleLowerCase("ru");
    const rows = details?.brands ?? [];
    if (!query) return rows;
    return rows.filter((row) =>
      row.brand.toLocaleLowerCase("ru").includes(query)
    );
  }, [details?.brands, brandQuery]);

  const saveClient = async (next?: ClientRecord) => {
    const client = next ?? draft;
    if (!client) return;

    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/clients/${client.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(client),
      });
      if (response.status === 401) {
        router.replace("/admin/login");
        return;
      }
      if (!response.ok) throw new Error("network");
      const data = (await response.json()) as ClientDetails;
      setDetails(data);
      setDraft(data.client);
      setMessage("Изменения сохранены");
    } catch {
      setError("Не удалось сохранить клиента");
    } finally {
      setSaving(false);
    }
  };

  const updateDraft = (patch: Partial<ClientRecord>) => {
    setDraft((current) => (current ? { ...current, ...patch } : current));
  };

  const setDiscountPercent = (brand: string, value: string) => {
    const percent = Number(value);
    setDraft((current) => {
      if (!current) return current;
      const nextDiscounts = current.discounts.filter(
        (item) => item.brand.toLocaleLowerCase("ru") !== brand.toLocaleLowerCase("ru")
      );
      if (Number.isFinite(percent) && percent > 0) {
        nextDiscounts.push({
          brand,
          percent: Math.min(99, Math.round(percent * 100) / 100),
        });
      }
      return { ...current, discounts: nextDiscounts };
    });
  };

  const getDraftDiscount = (brand: string) => {
    const discount = draft?.discounts.find(
      (item) => item.brand.toLocaleLowerCase("ru") === brand.toLocaleLowerCase("ru")
    );
    return discount?.percent ? String(discount.percent) : "";
  };

  const runAction = async (action: string, payload: Record<string, unknown> = {}) => {
    if (!draft) return;
    setSaving(true);
    setError("");
    setMessage("");
    setNewCode("");
    try {
      const response = await fetch(`/api/clients/${draft.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      if (response.status === 401) {
        router.replace("/admin/login");
        return;
      }
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "action");

      if (action === "resetPassword" && data.code) {
        setNewCode(String(data.code));
        setMessage("Новый код входа создан");
      } else {
        setMessage("Действие выполнено");
      }
      await loadDetails();
    } catch {
      setError("Не удалось выполнить действие");
    } finally {
      setSaving(false);
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

  const createManualOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const quantity = Number(line.quantity);
    const price = Number(line.price);
    if ((!line.sku.trim() && !line.name.trim()) || quantity <= 0 || price < 0) {
      setError("Заполните товар, количество и цену");
      return;
    }

    const item: ManagerOrderItem = {
      sku: line.sku.trim() || line.name.trim(),
      name: line.name.trim() || line.sku.trim(),
      quantity,
      unit: line.unit.trim() || "шт",
      price,
      total: price * quantity,
    };
    await runAction("createOrder", { items: [item] });
    setLine(EMPTY_LINE);
  };

  const addProposalItem = () => {
    const item = buildManualItem(proposalLine);
    if (!item) {
      setError(
        "\u0417\u0430\u043f\u043e\u043b\u043d\u0438\u0442\u0435 \u0442\u043e\u0432\u0430\u0440 \u0438 \u043a\u043e\u043b\u0438\u0447\u0435\u0441\u0442\u0432\u043e"
      );
      return;
    }
    setError("");
    setProposalItems((current) => [...current, item]);
    setProposalLine(EMPTY_LINE);
  };

  const removeProposalItem = (index: number) => {
    setProposalItems((current) =>
      current.filter((_, itemIndex) => itemIndex !== index)
    );
  };

  const createProposal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const pendingItem = buildManualItem(proposalLine);
    const items = pendingItem ? [...proposalItems, pendingItem] : proposalItems;

    if (items.length === 0) {
      setError(
        "\u0414\u043e\u0431\u0430\u0432\u044c\u0442\u0435 \u0445\u043e\u0442\u044f \u0431\u044b \u043e\u0434\u043d\u0443 \u043f\u043e\u0437\u0438\u0446\u0438\u044e"
      );
      return;
    }

    await runAction("createProposal", {
      items,
      managerComment: proposalComment,
    });
    setProposalItems([]);
    setProposalLine(EMPTY_LINE);
    setProposalComment("");
  };

  const convertProposalToOrder = async (proposal: CommercialProposal) => {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/proposals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: proposal.id,
          action: "convertToOrder",
        }),
      });
      if (response.status === 401) {
        router.replace("/admin/login");
        return;
      }
      if (!response.ok) throw new Error("network");
      setMessage(
        "\u0417\u0430\u043a\u0430\u0437 \u0441\u043e\u0437\u0434\u0430\u043d \u0438\u0437 \u043f\u0440\u0435\u0434\u043b\u043e\u0436\u0435\u043d\u0438\u044f"
      );
      await loadDetails();
    } catch {
      setError(
        "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0441\u043e\u0437\u0434\u0430\u0442\u044c \u0437\u0430\u043a\u0430\u0437 \u0438\u0437 \u043f\u0440\u0435\u0434\u043b\u043e\u0436\u0435\u043d\u0438\u044f"
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <PageShell variant="agent" title="Клиент" hideNav>
        <AdminHeader onLogout={logout} />
        <div className="space-y-2 px-3 py-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <div
              key={index}
              className="h-28 animate-pulse rounded-lg bg-white ring-1 ring-slate-200"
            />
          ))}
        </div>
      </PageShell>
    );
  }

  if (!details || !draft) {
    return (
      <PageShell variant="agent" title="Клиент" hideNav>
        <AdminHeader onLogout={logout} />
        <div className="px-4 py-10 text-center">
          <p className="text-sm font-bold text-slate-900">Клиент не найден</p>
          <Link
            href="/admin/clients"
            className="mt-4 inline-flex rounded-lg bg-slate-900 px-4 py-3 text-sm font-bold text-white"
          >
            К списку клиентов
          </Link>
        </div>
      </PageShell>
    );
  }

  const lastOrder = details.stats.lastOrder;

  return (
    <PageShell variant="agent" title={draft.name} hideNav>
      <AdminHeader onLogout={logout} />

      <div className="px-3 py-3">
        {error && (
          <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700 ring-1 ring-red-200">
            {error}
          </div>
        )}
        {message && (
          <div className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
            {message}
            {newCode && <span className="ml-1 font-mono font-bold">{newCode}</span>}
          </div>
        )}

        <section className="rounded-lg bg-white p-3 ring-1 ring-slate-200">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Карточка клиента
              </p>
              <h1 className="mt-1 truncate text-lg font-bold text-slate-900">
                {draft.name}
              </h1>
              <p className="text-xs text-slate-500">{draft.phone}</p>
            </div>
            <span
              className={`shrink-0 rounded-md px-2 py-1 text-[11px] font-bold ring-1 ${
                draft.active
                  ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                  : "bg-slate-100 text-slate-500 ring-slate-200"
              }`}
            >
              {draft.active ? "Активен" : "Неактивен"}
            </span>
          </div>

          <div className="mt-3 grid gap-2">
            <label className="text-xs font-bold text-slate-700">
              Имя
              <input
                value={draft.name}
                onChange={(event) => updateDraft({ name: event.target.value })}
                className="mt-1 h-10 w-full rounded-lg border-0 bg-slate-50 px-3 text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-600"
              />
            </label>
            <label className="text-xs font-bold text-slate-700">
              Телефон
              <input
                value={draft.phone}
                onChange={(event) => updateDraft({ phone: event.target.value })}
                inputMode="tel"
                className="mt-1 h-10 w-full rounded-lg border-0 bg-slate-50 px-3 text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-600"
              />
            </label>
            <label className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 ring-1 ring-slate-200">
              Статус активен
              <input
                type="checkbox"
                checked={draft.active}
                onChange={(event) => updateDraft({ active: event.target.checked })}
                className="h-4 w-4 accent-brand-600"
              />
            </label>
            <label className="text-xs font-bold text-slate-700">
              Комментарий менеджера
              <textarea
                value={draft.managerComment ?? ""}
                onChange={(event) =>
                  updateDraft({ managerComment: event.target.value })
                }
                rows={3}
                className="mt-1 w-full resize-none rounded-lg border-0 bg-slate-50 px-3 py-2.5 text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-600"
                placeholder="Условия, договоренности, особенности оплаты"
              />
            </label>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-500">
            <InfoLine label="Регистрация" value={formatDate(draft.createdAt)} />
            <InfoLine label="Код входа" value={draft.code} mono />
          </div>
          <button
            type="button"
            onClick={() => saveClient()}
            disabled={saving}
            className="mt-3 w-full rounded-lg bg-brand-600 py-3 text-sm font-bold text-white active:bg-brand-700 disabled:bg-slate-300"
          >
            {saving ? "Сохраняем..." : "Сохранить клиента"}
          </button>
        </section>

        <section className="mt-3 grid grid-cols-2 gap-2">
          <Metric label="Заказы" value={String(details.stats.orderCount)} />
          <Metric label="Сумма" value={formatPrice(details.stats.totalAmount)} />
          <Metric
            label="Последний заказ"
            value={lastOrder ? formatShortDate(lastOrder.date) : "нет"}
          />
          <Metric
            label="Средний чек"
            value={
              details.stats.orderCount
                ? formatPrice(details.stats.totalAmount / details.stats.orderCount)
                : "0 грн"
            }
          />
        </section>

        <section className="mt-3 rounded-lg bg-white p-3 ring-1 ring-slate-200">
          <h2 className="text-sm font-bold text-slate-900">Частые покупки</h2>
          <div className="mt-3 grid gap-3">
            <TopList title="Категории" items={details.stats.topCategories} />
            <TopList title="Бренды" items={details.stats.topBrands} />
          </div>
        </section>

        <section className="mt-3 rounded-lg bg-white p-3 ring-1 ring-slate-200">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-slate-900">Скидки по брендам</h2>
            <span className="text-[11px] font-semibold text-slate-500">
              {draft.discounts.length} активных
            </span>
          </div>
          <input
            value={brandQuery}
            onChange={(event) => setBrandQuery(event.target.value)}
            className="mt-3 h-10 w-full rounded-lg border-0 bg-slate-50 px-3 text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-600"
            placeholder="Поиск бренда"
          />
          <div className="mt-2 max-h-[420px] overflow-auto rounded-lg ring-1 ring-slate-100">
            {visibleBrands.map((row) => (
              <div
                key={row.brand}
                className="grid grid-cols-[1fr_72px] gap-2 border-b border-slate-100 px-3 py-2 last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-900">
                    {row.brand}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {row.count > 0 ? `${row.count} товаров` : "нет в каталоге"}
                    {!row.hasDiscount && " · без скидки"}
                  </p>
                </div>
                <label className="relative">
                  <input
                    value={getDraftDiscount(row.brand)}
                    onChange={(event) =>
                      setDiscountPercent(row.brand, event.target.value)
                    }
                    inputMode="decimal"
                    className="h-10 w-full rounded-lg border-0 bg-slate-50 px-2 pr-5 text-right text-sm font-bold tabular-nums ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-600"
                    placeholder="0"
                  />
                  <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                    %
                  </span>
                </label>
              </div>
            ))}
            {visibleBrands.length === 0 && (
              <div className="px-3 py-8 text-center text-xs text-slate-500">
                Бренд не найден
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => saveClient()}
            disabled={saving}
            className="mt-3 w-full rounded-lg bg-brand-600 py-3 text-sm font-bold text-white active:bg-brand-700 disabled:bg-slate-300"
          >
            Сохранить скидки
          </button>
        </section>

        <section className="mt-3 rounded-lg bg-white p-3 ring-1 ring-slate-200">
          <h2 className="text-sm font-bold text-slate-900">Быстрые действия</h2>
          <div className="mt-3 grid gap-2">
            <Link
              href="/admin/offers"
              className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-slate-700 ring-1 ring-slate-200 active:bg-slate-50"
            >
              КП
            </Link>
            <button
              type="button"
              onClick={() => saveClient({ ...draft, active: !draft.active })}
              disabled={saving}
              className="rounded-lg bg-white px-3 py-3 text-sm font-bold text-slate-800 ring-1 ring-slate-200 active:bg-slate-50 disabled:text-slate-400"
            >
              {draft.active ? "Отключить клиента" : "Включить клиента"}
            </button>
            <button
              type="button"
              onClick={() => runAction("resetPassword")}
              disabled={saving}
              className="rounded-lg bg-white px-3 py-3 text-sm font-bold text-slate-800 ring-1 ring-slate-200 active:bg-slate-50 disabled:text-slate-400"
            >
              Сбросить пароль
            </button>
            <button
              type="button"
              onClick={() => runAction("repeatLastOrder")}
              disabled={saving || details.orders.length === 0}
              className="rounded-lg bg-slate-900 px-3 py-3 text-sm font-bold text-white active:bg-slate-700 disabled:bg-slate-300"
            >
              Повторить прошлый заказ
            </button>
          </div>

          <form onSubmit={createManualOrder} className="mt-3 border-t border-slate-100 pt-3">
            <p className="text-xs font-bold text-slate-700">
              Создать заказ от имени клиента
            </p>
            <div className="mt-2 grid gap-2">
              <input
                value={line.sku}
                onChange={(event) =>
                  setLine((current) => ({ ...current, sku: event.target.value }))
                }
                className="h-10 rounded-lg border-0 bg-slate-50 px-3 text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-600"
                placeholder="Артикул"
              />
              <input
                value={line.name}
                onChange={(event) =>
                  setLine((current) => ({ ...current, name: event.target.value }))
                }
                className="h-10 rounded-lg border-0 bg-slate-50 px-3 text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-600"
                placeholder="Название товара"
              />
              <div className="grid grid-cols-[1fr_70px_1fr] gap-2">
                <input
                  value={line.quantity}
                  onChange={(event) =>
                    setLine((current) => ({ ...current, quantity: event.target.value }))
                  }
                  inputMode="decimal"
                  className="h-10 rounded-lg border-0 bg-slate-50 px-3 text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-600"
                  placeholder="Кол-во"
                />
                <input
                  value={line.unit}
                  onChange={(event) =>
                    setLine((current) => ({ ...current, unit: event.target.value }))
                  }
                  className="h-10 rounded-lg border-0 bg-slate-50 px-3 text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-600"
                  placeholder="шт"
                />
                <input
                  value={line.price}
                  onChange={(event) =>
                    setLine((current) => ({ ...current, price: event.target.value }))
                  }
                  inputMode="decimal"
                  className="h-10 rounded-lg border-0 bg-slate-50 px-3 text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-600"
                  placeholder="Цена"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={saving}
              className="mt-2 w-full rounded-lg bg-brand-600 py-3 text-sm font-bold text-white active:bg-brand-700 disabled:bg-slate-300"
            >
              Создать заказ
            </button>
          </form>
        </section>

        <section className="mt-3 rounded-lg bg-white p-3 ring-1 ring-slate-200">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-slate-900">
              {"\u041a\u043e\u043c\u043c\u0435\u0440\u0447\u0435\u0441\u043a\u0438\u0435 \u043f\u0440\u0435\u0434\u043b\u043e\u0436\u0435\u043d\u0438\u044f"}
            </h2>
            <span className="text-[11px] font-bold text-slate-500">
              {details.proposals.length}
            </span>
          </div>

          <form onSubmit={createProposal} className="mt-3 rounded-lg bg-slate-50 p-3 ring-1 ring-slate-100">
            <p className="text-xs font-bold text-slate-700">
              {"\u041d\u043e\u0432\u043e\u0435 \u043f\u0440\u0435\u0434\u043b\u043e\u0436\u0435\u043d\u0438\u0435"}
            </p>
            <p className="mt-1 text-[11px] text-slate-500">
              {"\u0415\u0441\u043b\u0438 \u0430\u0440\u0442\u0438\u043a\u0443\u043b \u043d\u0430\u0439\u0434\u0435\u0442\u0441\u044f \u0432 \u043a\u0430\u0442\u0430\u043b\u043e\u0433\u0435, \u0446\u0435\u043d\u0430 \u0432\u043e\u0437\u044c\u043c\u0435\u0442\u0441\u044f \u0443\u0436\u0435 \u0441 \u0443\u0447\u0435\u0442\u043e\u043c \u0441\u043a\u0438\u0434\u043e\u043a \u043a\u043b\u0438\u0435\u043d\u0442\u0430."}
            </p>

            {proposalItems.length > 0 && (
              <div className="mt-2 space-y-1">
                {proposalItems.map((item, index) => (
                  <div
                    key={`${item.sku}-${index}`}
                    className="flex items-start justify-between gap-2 rounded-md bg-white px-2 py-2 ring-1 ring-slate-100"
                  >
                    <div className="min-w-0">
                      <p className="font-mono text-xs font-bold text-slate-900">
                        {item.sku}
                      </p>
                      <p className="line-clamp-1 text-xs text-slate-600">
                        {item.name}
                      </p>
                      <p className="mt-0.5 text-[11px] font-bold tabular-nums text-slate-500">
                        {item.quantity} {item.unit} · {formatPrice(item.total)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeProposalItem(index)}
                      className="shrink-0 rounded-md bg-red-50 px-2 py-1 text-xs font-bold text-red-600 ring-1 ring-red-100"
                    >
                      {"\u0423\u0431\u0440\u0430\u0442\u044c"}
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-2 grid gap-2">
              <input
                value={proposalLine.sku}
                onChange={(event) =>
                  setProposalLine((current) => ({
                    ...current,
                    sku: event.target.value,
                  }))
                }
                className="h-10 rounded-lg border-0 bg-white px-3 text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-600"
                placeholder="Артикул"
              />
              <input
                value={proposalLine.name}
                onChange={(event) =>
                  setProposalLine((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                className="h-10 rounded-lg border-0 bg-white px-3 text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-600"
                placeholder="Название товара"
              />
              <div className="grid grid-cols-[1fr_70px_1fr] gap-2">
                <input
                  value={proposalLine.quantity}
                  onChange={(event) =>
                    setProposalLine((current) => ({
                      ...current,
                      quantity: event.target.value,
                    }))
                  }
                  inputMode="decimal"
                  className="h-10 rounded-lg border-0 bg-white px-3 text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-600"
                  placeholder="Кол-во"
                />
                <input
                  value={proposalLine.unit}
                  onChange={(event) =>
                    setProposalLine((current) => ({
                      ...current,
                      unit: event.target.value,
                    }))
                  }
                  className="h-10 rounded-lg border-0 bg-white px-3 text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-600"
                  placeholder="шт"
                />
                <input
                  value={proposalLine.price}
                  onChange={(event) =>
                    setProposalLine((current) => ({
                      ...current,
                      price: event.target.value,
                    }))
                  }
                  inputMode="decimal"
                  className="h-10 rounded-lg border-0 bg-white px-3 text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-600"
                  placeholder="Цена"
                />
              </div>
              <button
                type="button"
                onClick={addProposalItem}
                className="rounded-lg bg-white px-3 py-2.5 text-sm font-bold text-slate-800 ring-1 ring-slate-200 active:bg-slate-100"
              >
                {"\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c \u043f\u043e\u0437\u0438\u0446\u0438\u044e"}
              </button>
              <textarea
                value={proposalComment}
                onChange={(event) => setProposalComment(event.target.value)}
                rows={3}
                className="w-full resize-none rounded-lg border-0 bg-white px-3 py-2.5 text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-600"
                placeholder="Комментарий менеджера"
              />
            </div>
            <button
              type="submit"
              disabled={saving}
              className="mt-2 w-full rounded-lg bg-emerald-600 py-3 text-sm font-bold text-white active:bg-emerald-700 disabled:bg-slate-300"
            >
              {"\u041e\u0442\u043f\u0440\u0430\u0432\u0438\u0442\u044c \u043a\u0430\u043a \u043a\u043e\u043c\u043c\u0435\u0440\u0447\u0435\u0441\u043a\u043e\u0435 \u043f\u0440\u0435\u0434\u043b\u043e\u0436\u0435\u043d\u0438\u0435"}
            </button>
          </form>

          <div className="mt-3 space-y-2">
            {details.proposals.length === 0 ? (
              <p className="rounded-lg bg-slate-50 px-3 py-6 text-center text-xs text-slate-500">
                {"\u041f\u0440\u0435\u0434\u043b\u043e\u0436\u0435\u043d\u0438\u0439 \u043f\u043e\u043a\u0430 \u043d\u0435\u0442"}
              </p>
            ) : (
              details.proposals.map((proposal) => (
                <ProposalBlock
                  key={proposal.id}
                  proposal={proposal}
                  saving={saving}
                  onConvert={() => convertProposalToOrder(proposal)}
                />
              ))
            )}
          </div>
        </section>

        <section className="mt-3 rounded-lg bg-white p-3 ring-1 ring-slate-200">
          <h2 className="text-sm font-bold text-slate-900">История заказов</h2>
          <div className="mt-3 space-y-2">
            {details.orders.length === 0 ? (
              <p className="rounded-lg bg-slate-50 px-3 py-6 text-center text-xs text-slate-500">
                Заказов пока нет
              </p>
            ) : (
              details.orders.map((order) => (
                <OrderBlock key={order.id} order={order} />
              ))
            )}
          </div>
        </section>
      </div>
    </PageShell>
  );
}

function AdminHeader({ onLogout }: { onLogout: () => void }) {
  return (
    <div className="sticky top-0 z-30 border-b border-slate-200 bg-slate-100 safe-top">
      <div className="mx-auto max-w-lg px-3 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          Менеджер
        </p>
        <div className="mt-1 flex items-center justify-between gap-3">
          <Link href="/admin/clients" className="text-lg font-bold text-slate-900">
            Клиент
          </Link>
          <div className="flex shrink-0 gap-2">
            <Link
              href="/admin/orders"
              className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-slate-700 ring-1 ring-slate-200 active:bg-slate-50"
            >
              Заказы
            </Link>
            <button
              type="button"
              onClick={onLogout}
              className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-white active:bg-slate-700"
            >
              Выйти
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white px-3 py-2.5 ring-1 ring-slate-200">
      <p className="text-[10px] font-medium text-slate-500">{label}</p>
      <p className="mt-1 truncate text-sm font-bold tabular-nums text-slate-900">
        {value}
      </p>
    </div>
  );
}

function InfoLine({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2 ring-1 ring-slate-100">
      <p className="text-[10px] text-slate-500">{label}</p>
      <p className={`mt-0.5 truncate text-xs font-bold text-slate-800 ${mono ? "font-mono" : ""}`}>
        {value}
      </p>
    </div>
  );
}

function TopList({
  title,
  items,
}: {
  title: string;
  items: { name: string; count: number }[];
}) {
  return (
    <div>
      <p className="text-xs font-bold text-slate-700">{title}</p>
      <div className="mt-1 space-y-1">
        {items.length === 0 ? (
          <p className="rounded-md bg-slate-50 px-2 py-2 text-xs text-slate-500">
            Нет данных
          </p>
        ) : (
          items.map((item) => (
            <div
              key={item.name}
              className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-2 py-1.5"
            >
              <span className="truncate text-xs font-medium text-slate-700">
                {item.name}
              </span>
              <span className="shrink-0 text-xs font-bold tabular-nums text-slate-900">
                {item.count}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function OrderBlock({ order }: { order: ManagerOrder }) {
  return (
    <article className="rounded-lg bg-slate-50 p-3 ring-1 ring-slate-100">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-xs font-bold text-slate-500">
            {order.orderId}
          </p>
          <p className="mt-1 text-xs text-slate-500">{formatDate(order.date)}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-bold tabular-nums text-slate-900">
            {formatPrice(order.total)}
          </p>
          <p className="mt-0.5 text-[11px] font-bold text-slate-500">
            {order.status}
          </p>
        </div>
      </div>
      <div className="mt-2 space-y-1">
        {order.items.map((item, index) => (
          <div
            key={`${order.id}-${item.sku}-${index}`}
            className="rounded-md bg-white px-2 py-2"
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
                <p className="text-xs font-semibold tabular-nums text-slate-500">
                  {item.quantity} {item.unit}
                </p>
                <p className="mt-0.5 text-xs font-bold tabular-nums text-slate-900">
                  {formatPrice(item.total)}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

function ProposalBlock({
  proposal,
  saving,
  onConvert,
}: {
  proposal: CommercialProposal;
  saving: boolean;
  onConvert: () => void;
}) {
  const closed =
    proposal.status === PROPOSAL_STATUS_ACCEPTED ||
    proposal.status === PROPOSAL_STATUS_REJECTED;

  return (
    <article className="rounded-lg bg-slate-50 p-3 ring-1 ring-slate-100">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-xs font-bold text-slate-500">
            {proposal.proposalId}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {formatDate(proposal.date)}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-bold tabular-nums text-slate-900">
            {formatPrice(proposal.total)}
          </p>
          <p className="mt-0.5 text-[11px] font-bold text-emerald-700">
            {proposal.status}
          </p>
        </div>
      </div>

      {proposal.managerComment && (
        <p className="mt-2 rounded-md bg-white px-2 py-2 text-xs text-slate-600 ring-1 ring-slate-100">
          {proposal.managerComment}
        </p>
      )}
      {proposal.clientComment && (
        <p className="mt-2 rounded-md bg-amber-50 px-2 py-2 text-xs font-medium text-amber-800 ring-1 ring-amber-100">
          {"\u041a\u043e\u043c\u043c\u0435\u043d\u0442\u0430\u0440\u0438\u0439 \u043a\u043b\u0438\u0435\u043d\u0442\u0430: "}
          {proposal.clientComment}
        </p>
      )}
      {proposal.changeSummary?.length ? (
        <div className="mt-2 rounded-md bg-sky-50 px-2 py-2 ring-1 ring-sky-100">
          <p className="text-[11px] font-bold text-sky-800">
            {"\u0418\u0437\u043c\u0435\u043d\u0435\u043d\u0438\u044f \u043a\u043b\u0438\u0435\u043d\u0442\u0430"}
          </p>
          <ul className="mt-1 space-y-1">
            {proposal.changeSummary.map((change, index) => (
              <li key={`${proposal.id}-change-${index}`} className="text-xs text-sky-800">
                {change}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-2 space-y-1">
        {proposal.items.map((item, index) => (
          <div
            key={`${proposal.id}-${item.sku}-${index}`}
            className="rounded-md bg-white px-2 py-2"
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
                <p className="text-xs font-semibold tabular-nums text-slate-500">
                  {item.quantity} {item.unit}
                </p>
                <p className="mt-0.5 text-xs font-bold tabular-nums text-slate-900">
                  {formatPrice(item.total)}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {proposal.history.length > 0 && (
        <details className="mt-2 rounded-md bg-white px-2 py-2 ring-1 ring-slate-100">
          <summary className="cursor-pointer text-xs font-bold text-slate-700">
            {"\u0418\u0441\u0442\u043e\u0440\u0438\u044f \u0438\u0437\u043c\u0435\u043d\u0435\u043d\u0438\u0439"}
          </summary>
          <div className="mt-2 space-y-2">
            {proposal.history.slice(0, 5).map((entry) => (
              <div key={entry.id} className="border-t border-slate-100 pt-2 first:border-t-0 first:pt-0">
                <p className="text-[11px] font-bold text-slate-700">
                  {entry.action}
                </p>
                <p className="text-[11px] text-slate-500">
                  {formatDate(entry.date)} · {entry.status}
                </p>
              </div>
            ))}
          </div>
        </details>
      )}

      <button
        type="button"
        onClick={onConvert}
        disabled={saving || closed}
        className="mt-2 w-full rounded-lg bg-slate-900 py-2.5 text-sm font-bold text-white active:bg-slate-700 disabled:bg-slate-300"
      >
        {"\u0421\u043e\u0437\u0434\u0430\u0442\u044c \u0437\u0430\u043a\u0430\u0437 \u0438\u0437 \u043f\u0440\u0435\u0434\u043b\u043e\u0436\u0435\u043d\u0438\u044f"}
      </button>
    </article>
  );
}

function buildManualItem(line: typeof EMPTY_LINE): ManagerOrderItem | null {
  const quantity = Number(line.quantity);
  const price = Number(line.price);
  if ((!line.sku.trim() && !line.name.trim()) || quantity <= 0) return null;

  const safePrice = Number.isFinite(price) && price > 0 ? price : 0;
  return {
    sku: line.sku.trim() || line.name.trim(),
    name: line.name.trim() || line.sku.trim(),
    quantity,
    unit: line.unit.trim() || "\u0448\u0442",
    price: safePrice,
    total: safePrice * quantity,
  };
}

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return "";
  }
}

function formatShortDate(value: string) {
  try {
    return new Intl.DateTimeFormat("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    }).format(new Date(value));
  } catch {
    return "";
  }
}
