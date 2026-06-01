"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { InfiniteScrollTrigger } from "@/components/InfiniteScrollTrigger";
import { PageShell } from "@/components/PageShell";
import { ProductImage } from "@/components/ProductImage";
import { SearchBar } from "@/components/SearchBar";
import { clearAdminSession } from "@/lib/admin-session";
import type { ClientRecord } from "@/lib/clients";
import {
  PROPOSAL_STATUS_ACCEPTED,
  PROPOSAL_STATUS_CLIENT_CHANGED,
  type CommercialProposal,
} from "@/lib/commercial-proposals";
import { formatPrice } from "@/lib/format";
import type { ManagerOrderItem } from "@/lib/manager-orders";
import type { CatalogFilters, Category, Product } from "@/lib/types";
import { useInfiniteProducts } from "@/hooks/useInfiniteProducts";

const CATEGORY_TREE_STATE_KEY = "ultra-svet-admin-offer-tree:v1";

type CategorySelection = Pick<
  Category,
  "path" | "brand" | "series" | "design" | "productType" | "cableMark"
>;

export default function AdminOffersPage() {
  const router = useRouter();
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [proposals, setProposals] = useState<CommercialProposal[]>([]);
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);
  const [managerComment, setManagerComment] = useState("");
  const [draftItems, setDraftItems] = useState<ManagerOrderItem[]>([]);
  const [quantityByProduct, setQuantityByProduct] = useState<Record<string, string>>(
    {}
  );
  const [searchInput, setSearchInput] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");
  const [activePath, setActivePath] = useState<string[]>([]);
  const [activeBrand, setActiveBrand] = useState("");
  const [activeSeries, setActiveSeries] = useState("");
  const [activeDesign, setActiveDesign] = useState("");
  const [activeProductType, setActiveProductType] = useState("");
  const [activeCableMark, setActiveCableMark] = useState("");
  const [priceMinInput, setPriceMinInput] = useState("");
  const [priceMaxInput, setPriceMaxInput] = useState("");
  const [inStockOnly, setInStockOnly] = useState(false);
  const [activeSpecs, setActiveSpecs] = useState<Record<string, string>>({});
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const activeClients = useMemo(
    () => clients.filter((client) => client.active),
    [clients]
  );
  const selectedClients = useMemo(
    () => clients.filter((client) => selectedClientIds.includes(client.id)),
    [clients, selectedClientIds]
  );
  const pricingClientId =
    selectedClientIds.length === 1 ? selectedClientIds[0] : undefined;
  const catalogEnabled = Boolean(submittedSearch || activePath.length > 0);
  const activeFilterCount = [
    activeBrand,
    activeSeries,
    activeDesign,
    activeProductType,
    activeCableMark,
    priceMinInput,
    priceMaxInput,
    inStockOnly ? "stock" : "",
    ...Object.values(activeSpecs),
  ].filter(Boolean).length;

  const {
    items,
    total,
    loading,
    initialLoading,
    hasMore,
    error: productError,
    loadMore,
    filters,
  } = useInfiniteProducts({
    q: submittedSearch,
    category: "all",
    categoryPath: activePath,
    brand: activeBrand || undefined,
    series: activeSeries || undefined,
    design: activeDesign || undefined,
    productType: activeProductType || undefined,
    cableMark: activeCableMark || undefined,
    priceMin: parseOptionalNumber(priceMinInput),
    priceMax: parseOptionalNumber(priceMaxInput),
    inStock: inStockOnly ? true : undefined,
    specs: Object.keys(activeSpecs).length ? activeSpecs : undefined,
    clientId: pricingClientId,
    enabled: catalogEnabled,
  });

  const draftTotal = useMemo(
    () => roundMoney(draftItems.reduce((sum, item) => sum + item.total, 0)),
    [draftItems]
  );

  const loadMeta = useCallback(async () => {
    setLoadingMeta(true);
    setError("");
    try {
      const [clientsResponse, categoriesResponse, proposalsResponse] =
        await Promise.all([
          fetch("/api/clients", { cache: "no-store" }),
          fetch("/api/products/categories", { cache: "no-store" }),
          fetch("/api/proposals", { cache: "no-store" }),
        ]);

      if (
        clientsResponse.status === 401 ||
        categoriesResponse.status === 401 ||
        proposalsResponse.status === 401
      ) {
        router.replace("/admin/login");
        return;
      }
      if (!clientsResponse.ok || !categoriesResponse.ok || !proposalsResponse.ok) {
        throw new Error("network");
      }

      const clientsData = (await clientsResponse.json()) as {
        clients?: ClientRecord[];
      };
      const proposalsData = (await proposalsResponse.json()) as {
        proposals?: CommercialProposal[];
      };
      setClients(Array.isArray(clientsData.clients) ? clientsData.clients : []);
      setCategories((await categoriesResponse.json()) as Category[]);
      setProposals(
        Array.isArray(proposalsData.proposals) ? proposalsData.proposals : []
      );
    } catch {
      setError("Не удалось загрузить данные для коммерческих предложений");
    } finally {
      setLoadingMeta(false);
    }
  }, [router]);

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  const logout = async () => {
    try {
      await fetch("/api/admin/logout", { method: "POST" });
    } finally {
      clearAdminSession();
      router.replace("/admin/login");
      router.refresh();
    }
  };

  const toggleClient = (clientId: string) => {
    setSelectedClientIds((current) =>
      current.includes(clientId)
        ? current.filter((id) => id !== clientId)
        : [...current, clientId]
    );
  };

  const selectAllClients = () => {
    setSelectedClientIds(activeClients.map((client) => client.id));
  };

  const submitSearch = () => {
    setSubmittedSearch(searchInput.trim());
  };

  const selectCategory = (selection: CategorySelection) => {
    setActivePath(selection.path ?? []);
    setActiveBrand(selection.brand ?? "");
    setActiveSeries(selection.series ?? "");
    setActiveDesign(selection.design ?? "");
    setActiveProductType(selection.productType ?? "");
    setActiveCableMark(selection.cableMark ?? "");
    setSubmittedSearch("");
    setSearchInput("");
    setActiveSpecs({});
    setPriceMinInput("");
    setPriceMaxInput("");
  };

  const resetProductScope = () => {
    setActivePath([]);
    setActiveBrand("");
    setActiveSeries("");
    setActiveDesign("");
    setActiveProductType("");
    setActiveCableMark("");
    setSubmittedSearch("");
    setSearchInput("");
    clearFilters();
  };

  const clearFilters = () => {
    setActiveBrand("");
    setActiveSeries("");
    setActiveDesign("");
    setActiveProductType("");
    setActiveCableMark("");
    setPriceMinInput("");
    setPriceMaxInput("");
    setInStockOnly(false);
    setActiveSpecs({});
  };

  const setSpec = (key: string, value: string) => {
    setActiveSpecs((current) => {
      const next = { ...current };
      if (value) next[key] = value;
      else delete next[key];
      return next;
    });
  };

  const addProduct = (product: Product) => {
    const quantity = parseQuantity(quantityByProduct[product.id] ?? "1");
    const item = buildOfferItem(product, quantity);
    setDraftItems((current) => {
      const existingIndex = current.findIndex(
        (row) => (row.productId || row.sku) === (item.productId || item.sku)
      );
      if (existingIndex < 0) return [...current, item];

      return current.map((row, index) => {
        if (index !== existingIndex) return row;
        const nextQuantity = row.quantity + item.quantity;
        return {
          ...row,
          quantity: nextQuantity,
          price: item.price,
          total: roundMoney(item.price * nextQuantity),
        };
      });
    });
    setQuantityByProduct((current) => ({ ...current, [product.id]: "1" }));
  };

  const updateDraftQuantity = (index: number, value: string) => {
    const quantity = parseQuantity(value);
    setDraftItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              quantity,
              total: roundMoney(item.price * quantity),
            }
          : item
      )
    );
  };

  const removeDraftItem = (index: number) => {
    setDraftItems((current) =>
      current.filter((_, itemIndex) => itemIndex !== index)
    );
  };

  const sendOffers = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setMessage("");

    if (selectedClients.length === 0) {
      setError("Выберите хотя бы одного активного клиента");
      return;
    }
    if (draftItems.length === 0) {
      setError("Добавьте товары в коммерческое предложение");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientIds: selectedClients.map((client) => client.id),
          items: draftItems,
          managerComment,
        }),
      });
      if (response.status === 401) {
        router.replace("/admin/login");
        return;
      }
      const data = (await response.json()) as {
        proposals?: CommercialProposal[];
      };
      if (!response.ok) throw new Error("network");

      const created = Array.isArray(data.proposals) ? data.proposals : [];
      setProposals((current) => [...created, ...current]);
      setDraftItems([]);
      setManagerComment("");
      setMessage(`Предложение отправлено: ${created.length} клиент(ов)`);
    } catch {
      setError("Не удалось отправить коммерческое предложение");
    } finally {
      setSaving(false);
    }
  };

  const convertToOrder = async (proposal: CommercialProposal) => {
    setUpdatingId(proposal.id);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/proposals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: proposal.id, action: "convertToOrder" }),
      });
      if (response.status === 401) {
        router.replace("/admin/login");
        return;
      }
      const data = (await response.json()) as {
        proposal?: CommercialProposal;
      };
      if (!response.ok) throw new Error("network");
      if (data.proposal) {
        setProposals((current) =>
          current.map((item) =>
            item.id === data.proposal!.id ? data.proposal! : item
          )
        );
      }
      setMessage("Заказ создан из коммерческого предложения");
    } catch {
      setError("Не удалось создать заказ из предложения");
    } finally {
      setUpdatingId("");
    }
  };

  return (
    <PageShell variant="agent" title="Коммерческие предложения" hideNav>
      <AdminOffersHeader onLogout={logout} />

      <div className="px-3 py-3">
        {error && <Notice tone="red" text={error} />}
        {message && <Notice tone="green" text={message} />}

        <form onSubmit={sendOffers} className="space-y-3">
          <section className="rounded-lg bg-white p-3 ring-1 ring-slate-200">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Новое предложение
                </h2>
                <p className="text-xs text-slate-500">
                  Для каждого клиента цены будут пересчитаны персонально.
                </p>
              </div>
              <span className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-bold tabular-nums text-slate-600">
                {selectedClients.length}
              </span>
            </div>

            <ClientPicker
              clients={clients}
              selectedIds={selectedClientIds}
              onToggle={toggleClient}
              onSelectAll={selectAllClients}
              onClear={() => setSelectedClientIds([])}
            />

            <label className="mt-3 block text-xs font-bold text-slate-700">
              Комментарий менеджера
              <textarea
                value={managerComment}
                onChange={(event) => setManagerComment(event.target.value)}
                rows={3}
                className="mt-1 w-full resize-none rounded-lg border-0 bg-slate-50 px-3 py-2 text-sm text-slate-900 ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-600"
                placeholder="Условия, срок действия, доставка..."
              />
            </label>
          </section>

          <section className="rounded-lg bg-white p-3 ring-1 ring-slate-200">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Товары в предложении
                </h2>
                <p className="text-xs text-slate-500">
                  {draftItems.length} поз. · {formatPrice(draftTotal)}
                </p>
              </div>
              <button
                type="submit"
                disabled={saving || selectedClients.length === 0 || draftItems.length === 0}
                className="rounded-lg bg-brand-600 px-3 py-2 text-xs font-bold text-white active:bg-brand-700 disabled:bg-slate-300 disabled:text-slate-500"
              >
                {saving ? "Отправка..." : "Отправить"}
              </button>
            </div>

            {draftItems.length === 0 ? (
              <p className="mt-3 rounded-lg bg-slate-50 px-3 py-6 text-center text-xs text-slate-500">
                Выберите товары через дерево каталога или поиск.
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {draftItems.map((item, index) => (
                  <DraftItemRow
                    key={`${item.productId ?? item.sku}-${index}`}
                    item={item}
                    onQuantityChange={(value) => updateDraftQuantity(index, value)}
                    onRemove={() => removeDraftItem(index)}
                  />
                ))}
              </div>
            )}
          </section>
        </form>

        <section className="mt-3 rounded-lg bg-white p-3 ring-1 ring-slate-200">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Подбор товаров</h2>
              <p className="text-xs text-slate-500">
                {pricingClientId
                  ? "Показаны цены выбранного клиента."
                  : "Для нескольких клиентов цена пересчитается при отправке."}
              </p>
            </div>
            {(activePath.length > 0 || submittedSearch) && (
              <button
                type="button"
                onClick={resetProductScope}
                className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 active:bg-slate-200"
              >
                Сброс
              </button>
            )}
          </div>

          <div className="mt-3">
            <SearchBar
              value={searchInput}
              onChange={setSearchInput}
              placeholder="Артикул или название"
              onSubmit={submitSearch}
              showClear
            />
          </div>

          <div className="mt-3">
            <OfferCategoryTree
              categories={categories}
              activePath={activePath}
              activeBrand={activeBrand}
              activeSeries={activeSeries}
              activeDesign={activeDesign}
              activeProductType={activeProductType}
              activeCableMark={activeCableMark}
              onSelect={selectCategory}
            />
          </div>

          {(activePath.length > 0 || submittedSearch) && (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setFiltersOpen(true)}
                className={`rounded-lg px-3 py-2 text-xs font-bold ${
                  activeFilterCount > 0
                    ? "bg-brand-600 text-white"
                    : "bg-slate-100 text-slate-700"
                }`}
              >
                Фильтр{activeFilterCount > 0 ? ` · ${activeFilterCount}` : ""}
              </button>
            </div>
          )}
        </section>

        <section className="mt-3 overflow-hidden rounded-lg bg-white ring-1 ring-slate-200">
          <div className="border-b border-slate-100 px-3 py-2">
            <p className="text-sm font-bold text-slate-900">
              {catalogEnabled ? `${total} товаров` : "Выберите категорию или поиск"}
            </p>
            {activePath.length > 0 && (
              <p className="mt-0.5 truncate text-xs text-slate-500">
                {activePath.join(" / ")}
                {activeBrand ? ` / ${activeBrand}` : ""}
                {activeSeries ? ` / ${activeSeries}` : ""}
                {activeDesign ? ` / ${activeDesign}` : ""}
                {activeProductType ? ` / ${activeProductType}` : ""}
                {activeCableMark ? ` / ${activeCableMark}` : ""}
              </p>
            )}
          </div>

          {!catalogEnabled ? (
            <p className="px-3 py-8 text-center text-xs text-slate-500">
              Категории закрыты по умолчанию: откройте нужную ветку и добавляйте
              товары в предложение.
            </p>
          ) : productError ? (
            <p className="px-3 py-8 text-center text-xs text-red-600">
              {productError}
            </p>
          ) : initialLoading ? (
            <div className="space-y-0">
              {Array.from({ length: 5 }).map((_, index) => (
                <div
                  key={index}
                  className="h-28 animate-pulse border-b border-slate-100 bg-slate-50"
                />
              ))}
            </div>
          ) : items.length === 0 ? (
            <p className="px-3 py-8 text-center text-xs text-slate-500">
              Ничего не найдено.
            </p>
          ) : (
            <div>
              {items.map((product) => (
                <OfferProductRow
                  key={product.id}
                  product={product}
                  quantity={quantityByProduct[product.id] ?? "1"}
                  draftQuantity={draftItems
                    .filter((item) => item.productId === product.id)
                    .reduce((sum, item) => sum + item.quantity, 0)}
                  onQuantityChange={(value) =>
                    setQuantityByProduct((current) => ({
                      ...current,
                      [product.id]: value,
                    }))
                  }
                  onAdd={() => addProduct(product)}
                />
              ))}
              <InfiniteScrollTrigger
                hasMore={hasMore}
                loading={loading}
                onLoadMore={loadMore}
              />
            </div>
          )}
        </section>

        <section className="mt-3 rounded-lg bg-white p-3 ring-1 ring-slate-200">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-slate-900">
              Отправленные предложения
            </h2>
            <button
              type="button"
              onClick={loadMeta}
              className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 active:bg-slate-200"
            >
              Обновить
            </button>
          </div>
          {loadingMeta ? (
            <div className="mt-3 h-28 animate-pulse rounded-lg bg-slate-100" />
          ) : proposals.length === 0 ? (
            <p className="mt-3 rounded-lg bg-slate-50 px-3 py-6 text-center text-xs text-slate-500">
              Пока нет коммерческих предложений.
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {proposals.map((proposal) => (
                <OfferProposalCard
                  key={proposal.id}
                  proposal={proposal}
                  updating={updatingId === proposal.id}
                  onConvert={() => convertToOrder(proposal)}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      <FilterSheet
        open={filtersOpen}
        filters={filters}
        activeBrand={activeBrand}
        activeSpecs={activeSpecs}
        priceMin={priceMinInput}
        priceMax={priceMaxInput}
        inStockOnly={inStockOnly}
        activeFilterCount={activeFilterCount}
        onClose={() => setFiltersOpen(false)}
        onBrand={setActiveBrand}
        onSpec={setSpec}
        onPriceMin={setPriceMinInput}
        onPriceMax={setPriceMaxInput}
        onInStock={setInStockOnly}
        onClear={clearFilters}
      />
    </PageShell>
  );
}

function AdminOffersHeader({ onLogout }: { onLogout: () => void }) {
  return (
    <div className="sticky top-0 z-30 border-b border-slate-200 bg-slate-100 safe-top">
      <div className="mx-auto max-w-lg px-3 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          Менеджер
        </p>
        <div className="mt-1 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold text-slate-900">
              Коммерческие предложения
            </h1>
          </div>
          <div className="flex shrink-0 gap-2">
            <Link
              href="/admin/orders"
              className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-slate-700 ring-1 ring-slate-200 active:bg-slate-50"
            >
              Заказы
            </Link>
            <Link
              href="/admin/clients"
              className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-slate-700 ring-1 ring-slate-200 active:bg-slate-50"
            >
              Клиенты
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

function ClientPicker({
  clients,
  selectedIds,
  onToggle,
  onSelectAll,
  onClear,
}: {
  clients: ClientRecord[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState("");
  const visibleClients = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ru");
    const rows = clients.filter((client) => client.active);
    if (!normalized) return rows;
    return rows.filter(
      (client) =>
        client.name.toLocaleLowerCase("ru").includes(normalized) ||
        client.phone.toLocaleLowerCase("ru").includes(normalized)
    );
  }, [clients, query]);

  return (
    <div className="mt-3">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onSelectAll}
          className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white active:bg-slate-700"
        >
          Все клиенты
        </button>
        <button
          type="button"
          onClick={onClear}
          className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 active:bg-slate-200"
        >
          Снять
        </button>
      </div>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        className="mt-2 h-10 w-full rounded-lg border-0 bg-slate-50 px-3 text-sm text-slate-900 ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-600"
        placeholder="Поиск клиента"
      />
      <div className="mt-2 max-h-44 space-y-1 overflow-y-auto pr-1">
        {visibleClients.map((client) => {
          const checked = selectedIds.includes(client.id);
          return (
            <label
              key={client.id}
              className={`flex min-h-[44px] items-center gap-2 rounded-lg px-3 py-2 text-sm ring-1 ${
                checked
                  ? "bg-brand-50 text-brand-800 ring-brand-200"
                  : "bg-slate-50 text-slate-800 ring-slate-200"
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggle(client.id)}
                className="h-4 w-4 accent-brand-600"
              />
              <span className="min-w-0">
                <span className="block truncate font-bold">{client.name}</span>
                <span className="block truncate text-[11px] text-slate-500">
                  {client.phone}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function OfferCategoryTree({
  categories,
  activePath,
  activeBrand,
  activeSeries,
  activeDesign,
  activeProductType,
  activeCableMark,
  onSelect,
}: {
  categories: Category[];
  activePath: string[];
  activeBrand: string;
  activeSeries: string;
  activeDesign: string;
  activeProductType: string;
  activeCableMark: string;
  onSelect: (selection: CategorySelection) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(CATEGORY_TREE_STATE_KEY);
      const keys = raw ? (JSON.parse(raw) as string[]) : [];
      setExpanded(new Set(Array.isArray(keys) ? keys : []));
    } catch {
      setExpanded(new Set());
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.sessionStorage.setItem(
        CATEGORY_TREE_STATE_KEY,
        JSON.stringify(Array.from(expanded))
      );
    } catch {
      /* optional session cache */
    }
  }, [expanded, hydrated]);

  const toggle = (key: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="space-y-2">
      {expanded.size > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(new Set())}
          className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 active:bg-slate-200"
        >
          Свернуть дерево
        </button>
      )}
      <div className="max-h-[48vh] space-y-2 overflow-y-auto pr-1">
        {categories.map((category) => (
          <OfferCategoryNode
            key={categoryKey(category)}
            category={category}
            expanded={expanded}
            activePath={activePath}
            activeBrand={activeBrand}
            activeSeries={activeSeries}
            activeDesign={activeDesign}
            activeProductType={activeProductType}
            activeCableMark={activeCableMark}
            onToggle={toggle}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}

function OfferCategoryNode({
  category,
  expanded,
  activePath,
  activeBrand,
  activeSeries,
  activeDesign,
  activeProductType,
  activeCableMark,
  onToggle,
  onSelect,
}: {
  category: Category;
  expanded: Set<string>;
  activePath: string[];
  activeBrand: string;
  activeSeries: string;
  activeDesign: string;
  activeProductType: string;
  activeCableMark: string;
  onToggle: (key: string) => void;
  onSelect: (selection: CategorySelection) => void;
}) {
  const key = categoryKey(category);
  const path = category.path ?? [category.name];
  const children = category.children ?? [];
  const hasChildren = children.length > 0;
  const isOpen = expanded.has(key);
  const selected =
    samePath(activePath, path) &&
    activeBrand === (category.brand ?? "") &&
    activeSeries === (category.series ?? "") &&
    activeDesign === (category.design ?? "") &&
    activeProductType === (category.productType ?? "") &&
    activeCableMark === (category.cableMark ?? "");

  if (!hasChildren) {
    return (
      <button
        type="button"
        onClick={() => onSelect(category)}
        className={`flex min-h-[46px] w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left ring-1 active:bg-slate-50 ${
          selected
            ? "bg-brand-50 ring-brand-200"
            : "bg-white ring-slate-200"
        }`}
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold text-slate-900">
            {category.name}
          </span>
          <span className="block text-[11px] text-slate-500">
            {categoryKindLabel(category) || path.slice(0, -1).join(" / ")}
          </span>
        </span>
        <span className="shrink-0 rounded bg-slate-100 px-2 py-1 text-[11px] font-bold tabular-nums text-slate-500">
          {countLabel(category.count)}
        </span>
      </button>
    );
  }

  const categoryChildren = children.filter((child) => child.kind !== "brand");
  const brandChildren = children.filter((child) => child.kind === "brand");

  return (
    <section className="overflow-hidden rounded-lg bg-white ring-1 ring-slate-200">
      <button
        type="button"
        onClick={() => onToggle(key)}
        className="flex min-h-[54px] w-full items-center justify-between gap-3 px-3 py-2.5 text-left active:bg-slate-50"
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold text-slate-900">
            {category.name}
          </span>
          <span className="block text-[11px] tabular-nums text-slate-500">
            {countLabel(category.count)} ·{" "}
            {brandChildren.length && categoryChildren.length === 0
              ? `${brandChildren.length} брендов`
              : `${categoryChildren.length} разделов`}
          </span>
        </span>
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 transition-transform ${
            isOpen ? "rotate-90" : ""
          }`}
        >
          <ChevronIcon />
        </span>
      </button>
      {isOpen && (
        <div className="space-y-2 border-t border-slate-100 bg-slate-50 p-2">
          <button
            type="button"
            onClick={() => onSelect(category)}
            className={`flex min-h-[42px] w-full items-center justify-between gap-2 rounded-lg px-3 text-left text-sm font-bold ring-1 active:bg-brand-50 ${
              selected
                ? "bg-brand-50 text-brand-800 ring-brand-200"
                : "bg-white text-brand-700 ring-slate-200"
            }`}
          >
            <span className="truncate">{allProductsLabel(category.name)}</span>
            <span className="text-xs tabular-nums">{countLabel(category.count)}</span>
          </button>
          {children.map((child) => (
            <OfferCategoryNode
              key={categoryKey(child)}
              category={child}
              expanded={expanded}
              activePath={activePath}
              activeBrand={activeBrand}
              activeSeries={activeSeries}
              activeDesign={activeDesign}
              activeProductType={activeProductType}
              activeCableMark={activeCableMark}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function FilterSheet({
  open,
  filters,
  activeBrand,
  activeSpecs,
  priceMin,
  priceMax,
  inStockOnly,
  activeFilterCount,
  onClose,
  onBrand,
  onSpec,
  onPriceMin,
  onPriceMax,
  onInStock,
  onClear,
}: {
  open: boolean;
  filters: CatalogFilters | null;
  activeBrand: string;
  activeSpecs: Record<string, string>;
  priceMin: string;
  priceMax: string;
  inStockOnly: boolean;
  activeFilterCount: number;
  onClose: () => void;
  onBrand: (value: string) => void;
  onSpec: (key: string, value: string) => void;
  onPriceMin: (value: string) => void;
  onPriceMax: (value: string) => void;
  onInStock: (value: boolean) => void;
  onClear: () => void;
}) {
  if (!open) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Закрыть фильтр"
        className="fixed inset-0 z-[60] bg-slate-900/35"
        onClick={onClose}
      />
      <div className="fixed inset-x-0 bottom-0 z-[61] mx-auto max-h-[82vh] max-w-lg overflow-y-auto rounded-t-2xl bg-white p-3 shadow-2xl ring-1 ring-slate-200">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-slate-900">Фильтр</p>
            <p className="text-[11px] text-slate-500">
              Значения строятся из текущей категории.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-600 active:bg-slate-200"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="col-span-2 text-[11px] font-semibold text-slate-600">
            Бренд
            <select
              value={activeBrand}
              onChange={(event) => onBrand(event.target.value)}
              className="mt-1 h-10 w-full rounded-lg border-0 bg-slate-50 px-2 text-sm font-semibold text-slate-800 ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-600"
            >
              <option value="">Все бренды</option>
              {(filters?.brands ?? []).map((brand) => (
                <option key={brand.value} value={brand.value}>
                  {brand.value} ({brand.count})
                </option>
              ))}
            </select>
          </label>

          {(filters?.specs ?? []).map((group) => (
            <label
              key={group.key}
              className="col-span-2 text-[11px] font-semibold text-slate-600"
            >
              {group.key}
              <select
                value={activeSpecs[group.key] ?? ""}
                onChange={(event) => onSpec(group.key, event.target.value)}
                className="mt-1 h-10 w-full rounded-lg border-0 bg-slate-50 px-2 text-sm font-semibold text-slate-800 ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-600"
              >
                <option value="">Все значения</option>
                {group.values.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.value} ({item.count})
                  </option>
                ))}
              </select>
            </label>
          ))}

          <label className="text-[11px] font-semibold text-slate-600">
            Цена от
            <input
              value={priceMin}
              onChange={(event) => onPriceMin(event.target.value)}
              inputMode="decimal"
              placeholder={filters?.price.min ? String(filters.price.min) : "0"}
              className="mt-1 h-10 w-full rounded-lg border-0 bg-slate-50 px-2 text-sm font-semibold text-slate-800 ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-600"
            />
          </label>

          <label className="text-[11px] font-semibold text-slate-600">
            Цена до
            <input
              value={priceMax}
              onChange={(event) => onPriceMax(event.target.value)}
              inputMode="decimal"
              placeholder={filters?.price.max ? String(filters.price.max) : "0"}
              className="mt-1 h-10 w-full rounded-lg border-0 bg-slate-50 px-2 text-sm font-semibold text-slate-800 ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-600"
            />
          </label>
        </div>

        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onInStock(!inStockOnly)}
            className={`rounded-md px-2.5 py-2 text-xs font-bold ${
              inStockOnly
                ? "bg-emerald-600 text-white"
                : "bg-slate-100 text-slate-700"
            }`}
          >
            В наличии{filters ? ` · ${filters.availability.inStock}` : ""}
          </button>
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={onClear}
              className="rounded-md bg-slate-100 px-2.5 py-2 text-xs font-bold text-slate-600"
            >
              Сбросить
            </button>
          )}
        </div>
      </div>
    </>
  );
}

function OfferProductRow({
  product,
  quantity,
  draftQuantity,
  onQuantityChange,
  onAdd,
}: {
  product: Product;
  quantity: string;
  draftQuantity: number;
  onQuantityChange: (value: string) => void;
  onAdd: () => void;
}) {
  return (
    <article className="border-b border-slate-100 bg-white px-3 py-2 last:border-b-0">
      <div className="flex items-start gap-2">
        <ProductImage product={product} size="list" />
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-sm font-bold leading-snug text-slate-900">
            {product.name}
          </h3>
          <p className="mt-1 truncate font-mono text-[11px] font-semibold text-slate-500">
            {product.sku}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-bold tabular-nums text-slate-900">
              {formatPrice(product.price)}
            </span>
            {draftQuantity > 0 && (
              <span className="rounded-md bg-emerald-100 px-2 py-1 text-[11px] font-bold text-emerald-700">
                В КП: {draftQuantity} {product.unit}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-end gap-2 pl-[66px]">
        <input
          value={quantity}
          onChange={(event) => onQuantityChange(event.target.value)}
          inputMode="numeric"
          className="h-10 w-20 rounded-lg border-0 bg-slate-50 px-2 text-center text-sm font-bold tabular-nums text-slate-900 ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-600"
        />
        <button
          type="button"
          onClick={onAdd}
          className="h-10 rounded-lg bg-brand-600 px-3 text-sm font-bold text-white active:bg-brand-700"
        >
          Добавить
        </button>
      </div>
    </article>
  );
}

function DraftItemRow({
  item,
  onQuantityChange,
  onRemove,
}: {
  item: ManagerOrderItem;
  onQuantityChange: (value: string) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-lg bg-slate-50 p-2 ring-1 ring-slate-200">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-xs font-bold text-slate-900">{item.sku}</p>
          <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-slate-600">
            {item.name}
          </p>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-slate-500 ring-1 ring-slate-200 active:bg-slate-100"
        >
          <CloseIcon />
        </button>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <input
          value={String(item.quantity)}
          onChange={(event) => onQuantityChange(event.target.value)}
          inputMode="numeric"
          className="h-9 w-20 rounded-lg border-0 bg-white px-2 text-center text-sm font-bold tabular-nums text-slate-900 ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-600"
        />
        <p className="text-right text-sm font-bold tabular-nums text-slate-900">
          {formatPrice(item.total)}
        </p>
      </div>
    </div>
  );
}

function OfferProposalCard({
  proposal,
  updating,
  onConvert,
}: {
  proposal: CommercialProposal;
  updating: boolean;
  onConvert: () => void;
}) {
  const canConvert =
    !proposal.acceptedOrderId &&
    (proposal.status === PROPOSAL_STATUS_ACCEPTED ||
      proposal.status === PROPOSAL_STATUS_CLIENT_CHANGED);

  return (
    <article className="rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[11px] font-bold text-slate-500">
            {proposal.proposalId}
          </p>
          <h3 className="mt-1 truncate text-sm font-bold text-slate-900">
            {proposal.clientName || proposal.customer.name}
          </h3>
          <p className="text-xs text-slate-500">{formatDate(proposal.date)}</p>
        </div>
        <span className="shrink-0 rounded-md bg-white px-2 py-1 text-[11px] font-bold text-slate-700 ring-1 ring-slate-200">
          {proposal.status}
        </span>
      </div>

      <div className="mt-2 space-y-1">
        {proposal.items.slice(0, 4).map((item, index) => (
          <div key={`${proposal.id}-${item.sku}-${index}`} className="text-xs">
            <span className="font-mono font-bold text-slate-800">{item.sku}</span>{" "}
            <span className="text-slate-600">{item.quantity} {item.unit}</span>
          </div>
        ))}
        {proposal.items.length > 4 && (
          <p className="text-xs text-slate-500">Еще {proposal.items.length - 4} поз.</p>
        )}
      </div>

      {proposal.clientComment && (
        <p className="mt-2 rounded-md bg-sky-50 px-2 py-1.5 text-xs text-sky-800 ring-1 ring-sky-100">
          Клиент: {proposal.clientComment}
        </p>
      )}
      {proposal.changeSummary?.length ? (
        <ul className="mt-2 list-inside list-disc rounded-md bg-white px-2 py-1.5 text-xs text-slate-600 ring-1 ring-slate-100">
          {proposal.changeSummary.slice(0, 3).map((change, index) => (
            <li key={`${proposal.id}-change-${index}`}>{change}</li>
          ))}
        </ul>
      ) : null}

      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-sm font-bold tabular-nums text-slate-900">
          {formatPrice(proposal.total)}
        </p>
        {canConvert && (
          <button
            type="button"
            onClick={onConvert}
            disabled={updating}
            className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white active:bg-slate-700 disabled:bg-slate-300"
          >
            {updating ? "Создаем..." : "В заказ"}
          </button>
        )}
      </div>
    </article>
  );
}

function Notice({ text, tone }: { text: string; tone: "red" | "green" }) {
  return (
    <div
      className={`mb-3 rounded-lg px-3 py-2 text-xs font-bold ring-1 ${
        tone === "red"
          ? "bg-red-50 text-red-700 ring-red-200"
          : "bg-emerald-50 text-emerald-700 ring-emerald-200"
      }`}
    >
      {text}
    </div>
  );
}

function buildOfferItem(product: Product, quantity: number): ManagerOrderItem {
  return {
    productId: product.id,
    sku: product.sku,
    name: product.name,
    quantity,
    unit: product.unit,
    price: product.price,
    total: roundMoney(product.price * quantity),
  };
}

function parseQuantity(value: string) {
  const parsed = Number(value.replace(",", "."));
  if (!Number.isFinite(parsed) || parsed <= 0) return 1;
  return Math.max(1, Math.floor(parsed));
}

function parseOptionalNumber(value: string) {
  if (!value.trim()) return undefined;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function countLabel(value = 0) {
  return value.toLocaleString("ru-RU");
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

function categoryKey(category: Category) {
  return category.pathKey || category.id || category.name;
}

function samePath(first: string[], second: string[]) {
  return (
    first.length === second.length &&
    first.every((entry, index) => entry === second[index])
  );
}

function allProductsLabel(name: string) {
  const lower = name.toLocaleLowerCase("ru");
  if (lower.includes("автомат")) return "Все автоматы";
  if (lower.includes("розет")) return "Все розетки";
  if (lower.includes("кабел")) return "Все кабели";
  if (lower.includes("світиль") || lower.includes("светиль")) {
    return "Все светильники";
  }
  return "Все товары";
}

function ChevronIcon() {
  return (
    <svg
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m9 5 7 7-7 7" />
    </svg>
  );
}

function categoryKindLabel(category: Category) {
  if (category.kind === "brand") return "Бренд";
  if (category.kind === "series") return "Серия";
  if (category.kind === "design") return "Цвет / дизайн";
  if (category.kind === "productType") return "Тип товара";
  if (category.kind === "cableMark") return "Маркировка";
  return "";
}

function CloseIcon() {
  return (
    <svg
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
    </svg>
  );
}
