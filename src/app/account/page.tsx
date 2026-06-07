"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { QuickAddButton } from "@/components/QuickAddButton";
import { ProductImage } from "@/components/ProductImage";
import { useCart } from "@/context/CartContext";
import { fetchProducts } from "@/lib/api/products";
import {
  CLIENT_PRICING_EVENT,
  getClientSession,
  setClientSession,
  type ClientSessionSummary,
} from "@/lib/client-pricing-session";
import {
  PROPOSAL_STATUS_ACCEPTED,
  PROPOSAL_STATUS_NEW,
  PROPOSAL_STATUS_REJECTED,
  type CommercialProposal,
} from "@/lib/commercial-proposals";
import { useCustomerCabinet } from "@/lib/customer-cabinet";
import { formatPrice } from "@/lib/format";
import {
  loadOrderHistory,
  saveLastOrder,
  type OrderSnapshot,
} from "@/lib/order-history";
import type { ManagerOrderItem } from "@/lib/manager-orders";
import type { Product } from "@/lib/types";

function formatDate(iso: string) {
  try {
    return new Intl.DateTimeFormat("ru-RU", {
      day: "numeric",
      month: "short",
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

export default function AccountPage() {
  const router = useRouter();
  const { items, replaceWithOrder } = useCart();
  const {
    hydrated,
    favoriteIds,
    recent,
    notes,
    productNotes,
    setNotes,
    toggleFavorite,
  } = useCustomerCabinet();
  const [orders, setOrders] = useState<OrderSnapshot[]>([]);
  const [products, setProducts] = useState<Map<string, Product>>(new Map());
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [client, setClient] = useState<ClientSessionSummary | null>(null);
  const [proposals, setProposals] = useState<CommercialProposal[]>([]);
  const [proposalNotice, setProposalNotice] = useState(false);
  const [proposalMessage, setProposalMessage] = useState("");
  const [proposalLoading, setProposalLoading] = useState(false);
  const [proposalActionId, setProposalActionId] = useState("");
  const [editingProposalId, setEditingProposalId] = useState("");
  const [proposalDraftItems, setProposalDraftItems] = useState<
    Record<string, ManagerOrderItem[]>
  >({});
  const [proposalDraftComments, setProposalDraftComments] = useState<
    Record<string, string>
  >({});

  useEffect(() => {
    const syncClient = () => {
      setClient(getClientSession());
      setOrders(loadOrderHistory());
    };
    syncClient();
    window.addEventListener(CLIENT_PRICING_EVENT, syncClient);
    return () => window.removeEventListener(CLIENT_PRICING_EVENT, syncClient);
  }, []);

  const updateProposalState = useCallback((proposal: CommercialProposal) => {
    setProposals((current) =>
      current.map((item) => (item.id === proposal.id ? proposal : item))
    );
  }, []);

  const markProposalViewed = useCallback(
    async (id: string) => {
      try {
        const response = await fetch("/api/proposals", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, action: "view" }),
        });
        if (!response.ok) return;
        const data = (await response.json()) as {
          proposal?: CommercialProposal;
        };
        if (data.proposal) updateProposalState(data.proposal);
      } catch {
        /* best effort */
      }
    },
    [updateProposalState]
  );

  useEffect(() => {
    if (!client) {
      setProposals([]);
      setProposalNotice(false);
      return;
    }

    let cancelled = false;
    setProposalLoading(true);
    fetch("/api/proposals", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("network");
        return (await response.json()) as { proposals?: CommercialProposal[] };
      })
      .then((data) => {
        if (cancelled) return;
        const next = Array.isArray(data.proposals) ? data.proposals : [];
        setProposals(next);
        const newProposals = next.filter(
          (proposal) => proposal.status === PROPOSAL_STATUS_NEW
        );
        setProposalNotice(newProposals.length > 0);
        newProposals.forEach((proposal) => {
          markProposalViewed(proposal.id);
        });
      })
      .catch(() => {
        if (!cancelled) setProposals([]);
      })
      .finally(() => {
        if (!cancelled) setProposalLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [client, markProposalViewed]);

  const recentIds = useMemo(
    () => recent.map((entry) => entry.productId),
    [recent]
  );

  const productIds = useMemo(
    () =>
      uniqueIds([
        ...favoriteIds,
        ...recentIds,
        ...orders.flatMap((order) => order.items.map((item) => item.productId)),
        ...Object.keys(productNotes),
      ]),
    [favoriteIds, recentIds, orders, productNotes]
  );

  useEffect(() => {
    if (!productIds.length) return;
    setLoadingProducts(true);
    fetchProducts({ ids: productIds, limit: productIds.length })
      .then((data) => {
        setProducts(new Map(data.items.map((product) => [product.id, product])));
      })
      .catch(() => {
        setProducts(new Map());
      })
      .finally(() => setLoadingProducts(false));
  }, [productIds]);

  const favoriteProducts = favoriteIds
    .map((id) => products.get(id))
    .filter(Boolean) as Product[];

  const recentProducts = recentIds
    .map((id) => products.get(id))
    .filter(Boolean) as Product[];

  const repeatOrder = (order: OrderSnapshot) => {
    if (!order.items.length) return;
    if (
      items.length > 0 &&
      !window.confirm("Заменить текущую корзину выбранным повтором?")
    ) {
      return;
    }
    replaceWithOrder(order.items);
    router.push("/cart");
  };

  const logoutClient = async () => {
    try {
      await fetch("/api/client/logout", { method: "POST" });
    } finally {
      setClientSession(null);
      setClient(null);
      router.refresh();
    }
  };

  const startEditProposal = (proposal: CommercialProposal) => {
    setEditingProposalId(proposal.id);
    setProposalDraftItems((current) => ({
      ...current,
      [proposal.id]: proposal.items,
    }));
    setProposalDraftComments((current) => ({
      ...current,
      [proposal.id]: proposal.clientComment ?? "",
    }));
  };

  const updateProposalDraftQuantity = (
    proposalId: string,
    index: number,
    quantity: number
  ) => {
    setProposalDraftItems((current) => ({
      ...current,
      [proposalId]: (current[proposalId] ?? []).map((item, itemIndex) =>
        itemIndex === index ? { ...item, quantity: Math.max(1, quantity) } : item
      ),
    }));
  };

  const removeProposalDraftItem = (proposalId: string, index: number) => {
    setProposalDraftItems((current) => ({
      ...current,
      [proposalId]: (current[proposalId] ?? []).filter(
        (_, itemIndex) => itemIndex !== index
      ),
    }));
  };

  const submitProposalAction = async (
    proposal: CommercialProposal,
    action: "accept" | "reject" | "edit"
  ) => {
    setProposalActionId(proposal.id);
    setProposalMessage("");
    try {
      const body: Record<string, unknown> = {
        id: proposal.id,
        action,
      };
      if (action === "edit") {
        body.items = proposalDraftItems[proposal.id] ?? proposal.items;
        body.clientComment = proposalDraftComments[proposal.id] ?? "";
      }
      if (action === "reject") {
        body.clientComment = proposalDraftComments[proposal.id] ?? "";
      }

      const response = await fetch("/api/proposals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error("network");
      const data = (await response.json()) as {
        proposal?: CommercialProposal;
        order?: { orderId?: string };
      };
      if (data.proposal) {
        updateProposalState(data.proposal);
        if (action === "accept") {
          saveProposalToLocalHistory(data.proposal);
        }
      }
      setEditingProposalId("");
      setProposalMessage(
        action === "accept"
          ? "\u041f\u0440\u0435\u0434\u043b\u043e\u0436\u0435\u043d\u0438\u0435 \u043f\u0440\u0438\u043d\u044f\u0442\u043e \u0438 \u043f\u0440\u0435\u0432\u0440\u0430\u0449\u0435\u043d\u043e \u0432 \u0437\u0430\u043a\u0430\u0437"
          : action === "reject"
            ? "\u041f\u0440\u0435\u0434\u043b\u043e\u0436\u0435\u043d\u0438\u0435 \u043e\u0442\u043a\u043b\u043e\u043d\u0435\u043d\u043e"
            : "\u0418\u0437\u043c\u0435\u043d\u0435\u043d\u0438\u044f \u043e\u0442\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u044b \u043c\u0435\u043d\u0435\u0434\u0436\u0435\u0440\u0443"
      );
    } catch {
      setProposalMessage(
        "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043e\u0431\u043d\u043e\u0432\u0438\u0442\u044c \u043f\u0440\u0435\u0434\u043b\u043e\u0436\u0435\u043d\u0438\u0435"
      );
    } finally {
      setProposalActionId("");
    }
  };

  const saveProposalToLocalHistory = (proposal: CommercialProposal) => {
    const cartItems = proposal.items.map((item) => ({
      productId: item.productId || item.sku,
      quantity: item.quantity,
      minOrder: 1,
    }));
    saveLastOrder(cartItems, {
      customer: proposal.customer,
      total: proposal.total,
      items: proposal.items.map((item) => ({
        productId: item.productId || item.sku,
        sku: item.sku,
        article: item.sku,
      })),
    });
    setOrders(loadOrderHistory());
  };

  return (
    <PageShell variant="agent" title="Кабинет">
      <div className="px-3 py-3">
        <section className="rounded-lg bg-slate-900 p-4 text-white">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            B2B кабинет
          </p>
          <h1 className="mt-1 text-lg font-bold">Ваш рабочий набор</h1>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <Metric href="/orders" label="заказов" value={orders.length} />
            <Metric
              href="/favorites"
              label="избранных"
              value={favoriteIds.length}
            />
            <Metric href="/recent" label="просмотров" value={recent.length} />
          </div>
        </section>

        <section className="mt-3 rounded-lg bg-white p-3 ring-1 ring-slate-200">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            {"\u041f\u0440\u043e\u0444\u0438\u043b\u044c"}
          </p>
          {client ? (
            <div className="mt-1">
              <p className="text-base font-bold text-slate-900">{client.name}</p>
              <p className="text-xs font-medium text-slate-500">{client.phone}</p>
            </div>
          ) : (
            <p className="mt-1 text-sm text-slate-600">
              {"\u0412\u043e\u0439\u0434\u0438\u0442\u0435, \u0447\u0442\u043e\u0431\u044b \u0432\u0438\u0434\u0435\u0442\u044c \u0441\u0432\u043e\u0438 \u0444\u0438\u043d\u0430\u043b\u044c\u043d\u044b\u0435 B2B-\u0446\u0435\u043d\u044b."}
            </p>
          )}
          <div className="mt-3 grid grid-cols-2 gap-2">
            {client ? (
              <button
                type="button"
                onClick={logoutClient}
                className="rounded-lg bg-slate-100 px-3 py-3 text-center text-sm font-bold text-slate-800 ring-1 ring-slate-200 active:bg-slate-200"
              >
                {"\u0412\u044b\u0439\u0442\u0438"}
              </button>
            ) : (
              <Link
                href="/login"
                className="rounded-lg bg-brand-600 px-3 py-3 text-center text-sm font-bold text-white active:bg-brand-700"
              >
                {"\u0412\u043e\u0439\u0442\u0438"}
              </Link>
            )}
            <Link
              href="/admin/login"
              className="rounded-lg bg-white px-3 py-3 text-center text-sm font-bold text-slate-700 ring-1 ring-slate-200 active:bg-slate-50"
            >
              {"\u041c\u0435\u043d\u0435\u0434\u0436\u0435\u0440"}
            </Link>
          </div>
          {client && (
            <div className="mt-2 grid grid-cols-1">
              <Link
                href="#client-proposals"
                className="rounded-lg bg-emerald-50 px-3 py-3 text-center text-sm font-bold text-emerald-800 ring-1 ring-emerald-200 active:bg-emerald-100"
              >
                Предложения{proposals.length > 0 ? ` · ${proposals.length}` : ""}
              </Link>
            </div>
          )}
        </section>

        {client && (
          <section
            id="client-proposals"
            className="mt-3 scroll-mt-20 rounded-lg bg-white p-3 ring-1 ring-slate-200"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-slate-900">
                {"\u041f\u0440\u0435\u0434\u043b\u043e\u0436\u0435\u043d\u0438\u044f \u043c\u0435\u043d\u0435\u0434\u0436\u0435\u0440\u0430"}
              </h2>
              {proposals.length > 0 && (
                <span className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600">
                  {proposals.length}
                </span>
              )}
            </div>

            {proposalNotice && (
              <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800 ring-1 ring-emerald-200">
                {"\u041d\u043e\u0432\u043e\u0435 \u043f\u0440\u0435\u0434\u043b\u043e\u0436\u0435\u043d\u0438\u0435 \u043e\u0442 \u043c\u0435\u043d\u0435\u0434\u0436\u0435\u0440\u0430"}
              </div>
            )}

            {proposalMessage && (
              <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 ring-1 ring-slate-200">
                {proposalMessage}
              </p>
            )}

            {proposalLoading ? (
              <div className="mt-3 h-24 animate-pulse rounded-lg bg-slate-100" />
            ) : proposals.length === 0 ? (
              <p className="mt-3 rounded-lg bg-slate-50 px-3 py-6 text-center text-xs text-slate-500">
                {"\u041f\u043e\u043a\u0430 \u043d\u0435\u0442 \u043a\u043e\u043c\u043c\u0435\u0440\u0447\u0435\u0441\u043a\u0438\u0445 \u043f\u0440\u0435\u0434\u043b\u043e\u0436\u0435\u043d\u0438\u0439"}
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {proposals.map((proposal) => (
                  <ClientProposalCard
                    key={proposal.id}
                    proposal={proposal}
                    actionId={proposalActionId}
                    editing={editingProposalId === proposal.id}
                    draftItems={proposalDraftItems[proposal.id] ?? proposal.items}
                    draftComment={proposalDraftComments[proposal.id] ?? ""}
                    onStartEdit={() => startEditProposal(proposal)}
                    onCancelEdit={() => setEditingProposalId("")}
                    onQuantityChange={(index, quantity) =>
                      updateProposalDraftQuantity(proposal.id, index, quantity)
                    }
                    onRemoveItem={(index) =>
                      removeProposalDraftItem(proposal.id, index)
                    }
                    onCommentChange={(comment) =>
                      setProposalDraftComments((current) => ({
                        ...current,
                        [proposal.id]: comment,
                      }))
                    }
                    onAccept={() => submitProposalAction(proposal, "accept")}
                    onReject={() => submitProposalAction(proposal, "reject")}
                    onSubmitEdit={() => submitProposalAction(proposal, "edit")}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        <section className="mt-3 rounded-lg bg-white p-3 ring-1 ring-slate-200">
          <label htmlFor="customer-notes" className="text-sm font-bold text-slate-900">
            Персональные заметки
          </label>
          <textarea
            id="customer-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Контакты, условия доставки, что проверить перед заказом..."
            className="mt-2 min-h-24 w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-500 focus:bg-white"
          />
        </section>

        <SectionTitle title="История заказов" actionHref="/orders" action="Все" />
        {orders.length === 0 ? (
          <EmptyState text="После отправки заявки она появится здесь." />
        ) : (
          <div className="space-y-2">
            {orders.slice(0, 3).map((order, index) => (
              <OrderCard
                key={`${order.id ?? order.savedAt}-${index}`}
                order={order}
                index={orders.length - index}
                products={products}
                onRepeat={() => repeatOrder(order)}
              />
            ))}
          </div>
        )}

        <SectionTitle title="Избранные товары" actionHref="/favorites" action="Все" />
        {favoriteProducts.length === 0 ? (
          <EmptyState text="Нажмите звезду в каталоге, чтобы сохранить товар." />
        ) : (
          <ProductStrip
            products={favoriteProducts}
            onRemove={toggleFavorite}
            removable
          />
        )}

        <SectionTitle title="Последние просмотренные" actionHref="/recent" action="Все" />
        {recentProducts.length === 0 ? (
          <EmptyState text="Откройте карточку товара, и она сохранится здесь." />
        ) : (
          <ProductStrip products={recentProducts} />
        )}

        {Object.keys(productNotes).length > 0 && (
          <>
            <SectionTitle title="Заметки по товарам" />
            <div className="space-y-2">
              {Object.entries(productNotes).map(([productId, note]) => {
                const product = products.get(productId);
                return (
                  <Link
                    key={productId}
                    href={`/product/${productId}`}
                    className="block rounded-lg bg-white p-3 ring-1 ring-slate-200 active:bg-slate-50"
                  >
                    <p className="font-mono text-xs font-bold text-slate-900">
                      {product?.sku ?? "Товар"}
                    </p>
                    <p className="mt-1 line-clamp-2 text-sm text-slate-600">
                      {note}
                    </p>
                  </Link>
                );
              })}
            </div>
          </>
        )}

        {!hydrated || loadingProducts ? (
          <p className="py-4 text-center text-xs text-slate-400">
            Обновляем кабинет...
          </p>
        ) : null}
      </div>
    </PageShell>
  );
}

function Metric({
  href,
  label,
  value,
}: {
  href: string;
  label: string;
  value: number;
}) {
  return (
    <Link
      href={href}
      className="cursor-pointer rounded-lg bg-white/10 px-2 py-2 transition hover:bg-white/20 active:scale-[0.98] active:bg-white/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/80"
      aria-label={`Открыть ${label}`}
    >
      <p className="text-lg font-bold tabular-nums">{value}</p>
      <p className="text-[10px] text-slate-300">{label}</p>
    </Link>
  );
}

function ClientProposalCard({
  proposal,
  actionId,
  editing,
  draftItems,
  draftComment,
  onStartEdit,
  onCancelEdit,
  onQuantityChange,
  onRemoveItem,
  onCommentChange,
  onAccept,
  onReject,
  onSubmitEdit,
}: {
  proposal: CommercialProposal;
  actionId: string;
  editing: boolean;
  draftItems: ManagerOrderItem[];
  draftComment: string;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onQuantityChange: (index: number, quantity: number) => void;
  onRemoveItem: (index: number) => void;
  onCommentChange: (comment: string) => void;
  onAccept: () => void;
  onReject: () => void;
  onSubmitEdit: () => void;
}) {
  const final =
    proposal.status === PROPOSAL_STATUS_ACCEPTED ||
    proposal.status === PROPOSAL_STATUS_REJECTED;
  const busy = actionId === proposal.id;
  const visibleItems = editing ? draftItems : proposal.items;

  return (
    <article className="rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-xs font-bold text-slate-500">
            {proposal.proposalId}
          </p>
          <p className="mt-1 text-sm font-bold text-slate-900">
            {proposal.status}
          </p>
        </div>
        <p className="shrink-0 text-sm font-bold tabular-nums text-slate-900">
          {formatPrice(
            visibleItems.reduce((sum, item) => sum + item.price * item.quantity, 0)
          )}
        </p>
      </div>

      {proposal.managerComment && (
        <p className="mt-2 rounded-md bg-white px-2 py-2 text-xs text-slate-600 ring-1 ring-slate-100">
          {proposal.managerComment}
        </p>
      )}

      <div className="mt-2 space-y-1">
        {visibleItems.map((item, index) => (
          <div
            key={`${proposal.id}-${item.sku}-${index}`}
            className="rounded-md bg-white px-2 py-2 ring-1 ring-slate-100"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-mono text-xs font-bold text-slate-900">
                  {item.sku}
                </p>
                <p className="mt-0.5 line-clamp-2 text-xs text-slate-600">
                  {item.name}
                </p>
                <p className="mt-0.5 text-xs font-bold tabular-nums text-slate-900">
                  {formatPrice(item.price)}
                </p>
              </div>
              {editing ? (
                <div className="grid w-24 gap-1">
                  <input
                    value={item.quantity}
                    onChange={(event) =>
                      onQuantityChange(index, Number(event.target.value))
                    }
                    inputMode="decimal"
                    className="h-9 rounded-md border-0 bg-slate-50 px-2 text-right text-sm font-bold tabular-nums ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-600"
                  />
                  <button
                    type="button"
                    onClick={() => onRemoveItem(index)}
                    className="rounded-md bg-red-50 px-2 py-1 text-[11px] font-bold text-red-600 ring-1 ring-red-100"
                  >
                    {"\u0423\u0434\u0430\u043b\u0438\u0442\u044c"}
                  </button>
                </div>
              ) : (
                <div className="shrink-0 text-right">
                  <p className="text-xs font-semibold tabular-nums text-slate-500">
                    {item.quantity} {item.unit}
                  </p>
                  <p className="mt-0.5 text-xs font-bold tabular-nums text-slate-900">
                    {formatPrice(item.total)}
                  </p>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <textarea
          value={draftComment}
          onChange={(event) => onCommentChange(event.target.value)}
          rows={3}
          className="mt-2 w-full resize-none rounded-lg border-0 bg-white px-3 py-2 text-sm text-slate-900 ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-600"
          placeholder="Комментарий для менеджера"
        />
      )}

      <div className="mt-2 grid grid-cols-3 gap-2">
        {editing ? (
          <>
            <button
              type="button"
              onClick={onSubmitEdit}
              disabled={busy || draftItems.length === 0}
              className="col-span-2 rounded-lg bg-brand-600 px-2 py-2.5 text-xs font-bold text-white active:bg-brand-700 disabled:bg-slate-300"
            >
              {"\u041e\u0442\u043f\u0440\u0430\u0432\u0438\u0442\u044c"}
            </button>
            <button
              type="button"
              onClick={onCancelEdit}
              disabled={busy}
              className="rounded-lg bg-white px-2 py-2.5 text-xs font-bold text-slate-700 ring-1 ring-slate-200 active:bg-slate-50 disabled:text-slate-400"
            >
              {"\u041e\u0442\u043c\u0435\u043d\u0430"}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={onAccept}
              disabled={busy || final}
              className="rounded-lg bg-emerald-600 px-2 py-2.5 text-xs font-bold text-white active:bg-emerald-700 disabled:bg-slate-300"
            >
              {"\u041f\u0440\u0438\u043d\u044f\u0442\u044c"}
            </button>
            <button
              type="button"
              onClick={onStartEdit}
              disabled={busy || final}
              className="rounded-lg bg-white px-2 py-2.5 text-xs font-bold text-slate-700 ring-1 ring-slate-200 active:bg-slate-50 disabled:text-slate-400"
            >
              {"\u0420\u0435\u0434\u0430\u043a\u0442\u0438\u0440\u043e\u0432\u0430\u0442\u044c"}
            </button>
            <button
              type="button"
              onClick={onReject}
              disabled={busy || final}
              className="rounded-lg bg-red-50 px-2 py-2.5 text-xs font-bold text-red-600 ring-1 ring-red-100 active:bg-red-100 disabled:bg-slate-100 disabled:text-slate-400"
            >
              {"\u041e\u0442\u043a\u043b\u043e\u043d\u0438\u0442\u044c"}
            </button>
          </>
        )}
      </div>
    </article>
  );
}

function SectionTitle({
  title,
  action,
  actionHref,
}: {
  title: string;
  action?: string;
  actionHref?: string;
}) {
  return (
    <div className="mt-5 mb-2 flex items-center justify-between gap-2">
      <h2 className="text-sm font-bold text-slate-900">{title}</h2>
      {action && actionHref && (
        <Link href={actionHref} className="text-xs font-bold text-brand-600">
          {action}
        </Link>
      )}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-lg bg-white px-3 py-4 text-center text-sm text-slate-500 ring-1 ring-slate-200">
      {text}
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
  const names = order.items
    .slice(0, 3)
    .map((item) => products.get(item.productId)?.sku ?? item.sku ?? item.article ?? "Товар")
    .join(", ");

  return (
    <article className="rounded-lg bg-white p-3 ring-1 ring-slate-200">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-900">Заказ #{index}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {formatDate(order.savedAt)} · {order.items.length} арт.
          </p>
          <p className="mt-1 truncate text-xs text-slate-400">{names}</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold tabular-nums text-slate-900">
            {total > 0 ? formatPrice(total) : "—"}
          </p>
          <button
            type="button"
            onClick={onRepeat}
            className="mt-2 rounded-md bg-brand-600 px-3 py-2 text-xs font-bold text-white active:bg-brand-700"
          >
            Повторить
          </button>
        </div>
      </div>
    </article>
  );
}

function ProductStrip({
  products,
  removable = false,
  onRemove,
}: {
  products: Product[];
  removable?: boolean;
  onRemove?: (productId: string) => void;
}) {
  return (
    <div className="space-y-2">
      {products.slice(0, 8).map((product) => (
        <article
          key={product.id}
          className="flex gap-2 rounded-lg bg-white p-2 ring-1 ring-slate-200"
        >
          <Link href={`/product/${product.id}`} className="flex min-w-0 flex-1 gap-2">
            <ProductImage product={product} size="list" />
            <div className="min-w-0 flex-1">
              <p className="font-mono text-sm font-bold text-slate-900">
                {product.sku}
              </p>
              <p className="line-clamp-1 text-xs text-slate-600">{product.name}</p>
              <p className="mt-1 text-xs font-bold tabular-nums text-slate-900">
                {formatPrice(product.price)}
              </p>
            </div>
          </Link>
          <div className="flex shrink-0 items-center gap-1">
            {removable && onRemove && (
              <button
                type="button"
                onClick={() => onRemove(product.id)}
                className="flex h-9 w-9 items-center justify-center rounded-md bg-amber-100 text-amber-600"
                aria-label="Убрать из избранного"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 17.3 7.64 19.6a.6.6 0 0 1-.87-.63l.83-4.86-3.53-3.44a.6.6 0 0 1 .33-1.02l4.88-.71 2.2-4.42a.6.6 0 0 1 1.04 0l2.18 4.42 4.88.71a.6.6 0 0 1 .33 1.02l-3.53 3.44.83 4.86a.6.6 0 0 1-.87.63L12 17.3Z" />
                </svg>
              </button>
            )}
            <QuickAddButton productId={product.id} minOrder={product.minOrder} />
          </div>
        </article>
      ))}
    </div>
  );
}
