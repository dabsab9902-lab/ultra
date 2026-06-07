"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type {
  AgentPlusTreeNode,
  AgentPlusTreeProductRow,
} from "@/lib/agentplus-tree";
import { formatPrice } from "@/lib/format";
import { ProductListRow } from "@/components/ProductListRow";
import { StockBadge } from "@/components/StockBadge";

const PAGE_LIMIT = 40;

interface AgentPlusTreeBrowserProps {
  mode?: "client" | "admin";
}

interface TreeResponse {
  roots: AgentPlusTreeNode[];
  totalGroups: number;
  totalProducts: number;
  matchedProducts: number;
}

interface GroupProductsResponse {
  group: AgentPlusTreeNode;
  items: AgentPlusTreeProductRow[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

interface BreadcrumbItem {
  id: string;
  name: string;
}

export function AgentPlusTreeBrowser({
  mode = "client",
}: AgentPlusTreeBrowserProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeGroupId = searchParams.get("groupId") ?? "";
  const [roots, setRoots] = useState<AgentPlusTreeNode[]>([]);
  const [items, setItems] = useState<AgentPlusTreeProductRow[]>([]);
  const [treeLoading, setTreeLoading] = useState(true);
  const [productsLoading, setProductsLoading] = useState(false);
  const [error, setError] = useState("");
  const [totalGroups, setTotalGroups] = useState(0);
  const [totalProducts, setTotalProducts] = useState(0);
  const [matchedProducts, setMatchedProducts] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [groupTotal, setGroupTotal] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setTreeLoading(true);

    fetch("/api/agentplus-tree")
      .then((response) => {
        if (!response.ok) throw new Error("tree");
        return response.json() as Promise<TreeResponse>;
      })
      .then((data) => {
        if (cancelled) return;
        setRoots(data.roots ?? []);
        setTotalGroups(data.totalGroups ?? 0);
        setTotalProducts(data.totalProducts ?? 0);
        setMatchedProducts(data.matchedProducts ?? 0);
        setError("");
      })
      .catch(() => {
        if (!cancelled) {
          setError("Не удалось загрузить дерево 1С");
        }
      })
      .finally(() => {
        if (!cancelled) setTreeLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const nodeById = useMemo(() => {
    const index = new Map<string, AgentPlusTreeNode>();
    const visit = (nodes: AgentPlusTreeNode[]) => {
      for (const node of nodes) {
        index.set(node.id, node);
        if (node.children?.length) visit(node.children);
      }
    };
    visit(roots);
    return index;
  }, [roots]);

  const activeNode = activeGroupId ? nodeById.get(activeGroupId) ?? null : null;
  const currentChildren = activeNode ? activeNode.children ?? [] : roots;
  const isProductsView = Boolean(activeNode && currentChildren.length === 0);
  const activePath = useMemo(
    () => (activeNode ? getNodeChain(activeNode, nodeById) : []),
    [activeNode, nodeById]
  );
  const breadcrumbs = useMemo<BreadcrumbItem[]>(() => {
    const root: BreadcrumbItem = {
      id: "",
      name: "Дерево 1С",
    };

    return [
      root,
      ...activePath.map((node) => ({
        id: node.id,
        name: node.name,
      })),
    ];
  }, [activePath]);

  const navigateToGroup = useCallback(
    (groupId: string) => {
      const href = groupId ? groupHref(pathname, groupId) : pathname;
      setItems([]);
      setPage(1);
      setHasMore(false);
      setProductsLoading(false);
      router.push(href, { scroll: true });
    },
    [pathname, router]
  );

  const goBackLevel = () => {
    if (!activeNode) return;
    navigateToGroup(activeNode.parentId ?? "");
  };

  const loadGroupProducts = useCallback(
    async (groupId: string, nextPage = 1) => {
      setProductsLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({
          groupId,
          page: String(nextPage),
          limit: String(PAGE_LIMIT),
        });
        const response = await fetch(`/api/agentplus-tree?${params}`, {
          cache: "no-store",
        });
        if (!response.ok) throw new Error("group");
        const data = (await response.json()) as GroupProductsResponse;
        setGroupTotal(data.total ?? 0);
        setHasMore(Boolean(data.hasMore));
        setPage(data.page ?? nextPage);
        setItems((current) =>
          nextPage === 1 ? data.items ?? [] : [...current, ...(data.items ?? [])]
        );
      } catch {
        setError("Не удалось загрузить товары группы 1С");
      } finally {
        setProductsLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!activeGroupId || !activeNode) {
      setItems([]);
      setPage(1);
      setHasMore(false);
      setGroupTotal(0);
      return;
    }

    setGroupTotal(activeNode.count ?? 0);

    if (!isProductsView) {
      setItems([]);
      setPage(1);
      setHasMore(false);
      return;
    }

    void loadGroupProducts(activeGroupId, 1);
  }, [
    activeGroupId,
    activeNode,
    isProductsView,
    loadGroupProducts,
  ]);

  const currentHref = useMemo(
    () => (activeGroupId ? groupHref(pathname, activeGroupId) : pathname),
    [activeGroupId, pathname]
  );

  const showMissingGroup =
    Boolean(activeGroupId) && !treeLoading && roots.length > 0 && !activeNode;

  return (
    <div className="space-y-3 px-3 py-3">
      <div className="rounded-lg bg-white p-3 ring-1 ring-slate-200">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          {mode === "admin" ? "Дерево менеджера" : "Дерево 1С"}
        </p>
        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
          <Stat label="Групп" value={totalGroups} />
          <Stat label="Товаров" value={totalProducts} />
          <Stat label="С фото" value={matchedProducts} />
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700 ring-1 ring-red-200">
          {error}
        </div>
      )}

      <Breadcrumbs items={breadcrumbs} onNavigate={navigateToGroup} />

      {activeNode && (
        <button
          type="button"
          onClick={goBackLevel}
          className="flex min-h-[44px] w-full items-center gap-2 rounded-lg bg-white px-3 text-sm font-bold text-slate-700 ring-1 ring-slate-200 active:bg-slate-50"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100">
            <BackIcon />
          </span>
          <span>Назад</span>
        </button>
      )}

      {treeLoading ? (
        <SkeletonList />
      ) : showMissingGroup ? (
        <div className="rounded-lg bg-white px-3 py-6 text-center text-sm text-slate-500 ring-1 ring-slate-200">
          Группа не найдена. Вернитесь в корень дерева.
        </div>
      ) : isProductsView && activeNode ? (
        <ProductsLevel
          group={activeNode}
          items={items}
          total={groupTotal}
          loading={productsLoading}
          hasMore={hasMore}
          currentHref={currentHref}
          onLoadMore={() => void loadGroupProducts(activeNode.id, page + 1)}
        />
      ) : (
        <CategoryLevel
          title={activeNode ? activeNode.name : "Группы 1С"}
          subtitle={
            activeNode
              ? `${countLabel(activeNode.count)} товаров · ${countLabel(currentChildren.length)} разделов`
              : `${countLabel(totalProducts)} товаров · ${countLabel(roots.length)} разделов`
          }
          nodes={currentChildren}
          onOpen={(node) => navigateToGroup(node.id)}
        />
      )}
    </div>
  );
}

function CategoryLevel({
  title,
  subtitle,
  nodes,
  onOpen,
}: {
  title: string;
  subtitle: string;
  nodes: AgentPlusTreeNode[];
  onOpen: (node: AgentPlusTreeNode) => void;
}) {
  return (
    <section className="space-y-2">
      <div className="rounded-lg bg-white p-3 ring-1 ring-slate-200">
        <h2 className="text-sm font-bold text-slate-900">{title}</h2>
        <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
      </div>

      {nodes.length > 0 ? (
        <div className="space-y-2">
          {nodes.map((node) => (
            <button
              key={node.id}
              type="button"
              onClick={() => onOpen(node)}
              className="flex min-h-[58px] w-full items-center justify-between gap-3 rounded-lg bg-white px-3 py-3 text-left ring-1 ring-slate-200 active:bg-slate-50"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold text-slate-900">
                  {node.name}
                </span>
                <span className="mt-0.5 block text-xs tabular-nums text-slate-500">
                  {countLabel(node.count)} товаров
                  {(node.children?.length ?? 0) > 0
                    ? ` · ${countLabel(node.children?.length ?? 0)} разделов`
                    : ` · ${countLabel(node.matchedCount)} с фото`}
                </span>
              </span>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                <ChevronIcon />
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="rounded-lg bg-white px-3 py-6 text-center text-sm text-slate-500 ring-1 ring-slate-200">
          В этой ветке нет дочерних разделов.
        </div>
      )}
    </section>
  );
}

function ProductsLevel({
  group,
  items,
  total,
  loading,
  hasMore,
  currentHref,
  onLoadMore,
}: {
  group: AgentPlusTreeNode;
  items: AgentPlusTreeProductRow[];
  total: number;
  loading: boolean;
  hasMore: boolean;
  currentHref: string;
  onLoadMore: () => void;
}) {
  return (
    <section className="space-y-2">
      <div className="rounded-lg bg-white p-3 ring-1 ring-slate-200">
        <h2 className="text-sm font-bold text-slate-900">{group.name}</h2>
        <p className="mt-1 text-xs tabular-nums text-slate-500">
          {countLabel(total)} товаров
        </p>
      </div>

      {items.length > 0 && (
        <div className="overflow-hidden rounded-lg ring-1 ring-slate-200">
          {items.map((row, index) => {
            const key =
              row.agent?.agentGuid ||
              row.product?.id ||
              `${row.agent?.groupId ?? group.id}-${index}`;

            return row.product ? (
              <ProductListRow
                key={key}
                product={row.product}
                returnHref={currentHref}
              />
            ) : (
              <AgentOnlyProductRow key={key} row={row} />
            );
          })}
        </div>
      )}

      {loading && (
        <div className="rounded-lg bg-white px-3 py-4 text-center text-sm font-medium text-slate-500 ring-1 ring-slate-200">
          Загружаем товары...
        </div>
      )}

      {!loading && items.length === 0 && (
        <div className="rounded-lg bg-white px-3 py-6 text-center text-sm text-slate-500 ring-1 ring-slate-200">
          В этой группе нет товаров.
        </div>
      )}

      {hasMore && (
        <button
          type="button"
          onClick={onLoadMore}
          disabled={loading}
          className="w-full rounded-lg bg-white py-3 text-sm font-bold text-brand-700 ring-1 ring-brand-200 active:bg-brand-50 disabled:text-slate-400"
        >
          Показать еще
        </button>
      )}
    </section>
  );
}

function Breadcrumbs({
  items,
  onNavigate,
}: {
  items: BreadcrumbItem[];
  onNavigate: (groupId: string) => void;
}) {
  return (
    <nav className="overflow-x-auto rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200">
      <ol className="flex min-w-0 items-center gap-1 whitespace-nowrap text-xs font-semibold text-slate-500">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={item.id || "root"} className="flex items-center gap-1">
              {index > 0 && <span className="text-slate-300">/</span>}
              <button
                type="button"
                onClick={() => onNavigate(item.id)}
                disabled={isLast}
                className={`rounded px-1.5 py-1 text-left active:bg-slate-100 ${
                  isLast ? "text-slate-900" : "text-brand-700"
                }`}
              >
                {item.name}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function AgentOnlyProductRow({ row }: { row: AgentPlusTreeProductRow }) {
  const agent = row.agent;
  if (!agent) return null;

  const stock = agent.stock ?? 0;
  const price =
    typeof agent.price === "number" && Number.isFinite(agent.price)
      ? agent.price
      : undefined;
  const imageSrc = agent.imageUrl || "";
  const imageStyle = imageSrc
    ? { backgroundImage: `url("${imageSrc.replace(/"/g, "%22")}")` }
    : undefined;
  const stockStatus =
    agent.stock === undefined ? "unknown" : stock > 0 ? "in_stock" : "preorder";

  return (
    <article className="border-b border-slate-200 bg-white px-3 py-2">
      <div className="flex gap-2.5">
        <div
          className={`flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-slate-100 text-xs font-bold text-slate-500 ${
            imageSrc ? "bg-contain bg-center bg-no-repeat" : ""
          }`}
          style={imageStyle}
        >
          {imageSrc ? (
            <span className="sr-only">Фото товара</span>
          ) : (
            "1С"
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-3 text-[14px] font-semibold leading-snug text-slate-900">
            {agent.name}
          </h3>
          <p className="mt-1 text-[11px] font-medium text-slate-500">
            {imageSrc
              ? "Фото добавлено из проверенного источника"
              : "Только в 1С · фото сайта не найдено"}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {price !== undefined ? (
              <span className="text-[15px] font-bold tabular-nums text-slate-900">
                {formatPrice(price)}
              </span>
            ) : (
              <span className="text-xs font-medium text-slate-500">
                Цену уточнить
              </span>
            )}
            <StockBadge
              stock={stock}
              unit={agent.unit}
              stockStatus={stockStatus}
              compact
            />
          </div>
        </div>
      </div>
    </article>
  );
}

function SkeletonList() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 8 }).map((_, index) => (
        <div
          key={index}
          className="h-[58px] animate-pulse rounded-lg bg-white ring-1 ring-slate-200"
        />
      ))}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-slate-50 px-2 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-bold tabular-nums text-slate-900">
        {countLabel(value)}
      </p>
    </div>
  );
}

function getNodeChain(
  node: AgentPlusTreeNode,
  nodeById: Map<string, AgentPlusTreeNode>
) {
  const chain: AgentPlusTreeNode[] = [];
  let current: AgentPlusTreeNode | undefined = node;
  const seen = new Set<string>();

  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    chain.unshift(current);
    current = current.parentId ? nodeById.get(current.parentId) : undefined;
  }

  return chain;
}

function groupHref(pathname: string, groupId: string) {
  return `${pathname}?groupId=${encodeURIComponent(groupId)}`;
}

function countLabel(value = 0) {
  return value.toLocaleString("ru-RU");
}

function ChevronIcon() {
  return (
    <svg
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m9 5 7 7-7 7" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m15 19-7-7 7-7" />
    </svg>
  );
}
