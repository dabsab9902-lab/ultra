"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import type { AgentPlusOfflineClient } from "@/lib/agentplus-offline-clients";
import { mergeLocalClients, readLocalClients } from "@/lib/client-local-store";
import type { ClientRecord } from "@/lib/clients";
import { AdminLogoutButton } from "../AdminLogoutButton";

type OfflineClientRow = AgentPlusOfflineClient & {
  status?: "offline" | "online";
  onlineClientId?: string;
};

export default function AdminOfflineClientsPage() {
  const router = useRouter();
  const [clients, setClients] = useState<OfflineClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  const loadClients = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const offlineResponse = await fetch("/api/offline-clients", {
        cache: "no-store",
      });
      if (offlineResponse.status === 401) {
        router.replace("/admin/login");
        return;
      }
      if (!offlineResponse.ok) throw new Error("offline");

      const offlineData = (await offlineResponse.json()) as {
        clients?: OfflineClientRow[];
      };

      const onlineClients = await loadOnlineClients(router);
      const onlineByAgentPlusId = new Map(
        onlineClients
          .filter((client) => client.agentPlusClientId)
          .map((client) => [client.agentPlusClientId, client])
      );

      setClients(
        (offlineData.clients ?? []).map((client) => ({
          ...client,
          status: onlineByAgentPlusId.has(client.id) ? "online" : "offline",
          onlineClientId:
            onlineByAgentPlusId.get(client.id)?.id ?? client.onlineClientId,
        }))
      );
    } catch {
      setError("Не удалось загрузить офлайн-клиентов AgentPlus");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void loadClients();
  }, [loadClients]);

  const filteredClients = useMemo(() => {
    const normalizedQuery = normalizeSearch(query);
    if (!normalizedQuery) return clients;

    return clients.filter((client) =>
      [
        client.name,
        client.phone,
        client.group,
        client.contract,
        client.status,
      ]
        .filter(Boolean)
        .some((value) => normalizeSearch(String(value)).includes(normalizedQuery))
    );
  }, [clients, query]);

  const onlineCount = clients.filter((client) => client.status === "online").length;
  const withDebtCount = clients.filter((client) => Number(client.debt) > 0).length;

  return (
    <PageShell variant="agent" title="Офлайн-клиенты" hideNav>
      <div className="sticky top-0 z-30 border-b border-slate-200 bg-slate-100 safe-top">
        <div className="mx-auto max-w-lg px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Менеджер
          </p>
          <div className="mt-1 flex items-center justify-between gap-3">
            <h1 className="text-lg font-bold text-slate-900">
              Существующие клиенты
            </h1>
            <div className="flex shrink-0 gap-2">
              <Link
                href="/admin"
                className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-slate-700 ring-1 ring-slate-200 active:bg-slate-50"
              >
                Панель
              </Link>
              <AdminLogoutButton />
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3 px-3 py-3">
        {error && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700 ring-1 ring-red-200">
            {error}
          </div>
        )}

        <section className="grid grid-cols-3 gap-2">
          <StatCard label="Всего" value={clients.length} />
          <StatCard label="Онлайн" value={onlineCount} />
          <StatCard label="С долгом" value={withDebtCount} />
        </section>

        <label className="block">
          <span className="text-xs font-bold text-slate-700">Поиск клиента</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="mt-1 h-11 w-full rounded-lg border-0 bg-white px-3 text-sm text-slate-900 ring-1 ring-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-600"
            placeholder="Имя, телефон, группа, договор"
          />
        </label>

        <div className="space-y-2">
          {loading ? (
            Array.from({ length: 8 }).map((_, index) => (
              <div
                key={index}
                className="h-24 animate-pulse rounded-lg bg-white ring-1 ring-slate-200"
              />
            ))
          ) : filteredClients.length > 0 ? (
            filteredClients.map((client) => (
              <Link
                key={client.id}
                href={`/admin/offline-clients/${encodeURIComponent(client.id)}`}
                className="block rounded-lg bg-white p-3 ring-1 ring-slate-200 transition active:scale-[0.99] active:bg-slate-50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="line-clamp-2 text-sm font-bold text-slate-900">
                      {client.name}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {client.phone || "Телефон не указан"}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${
                      client.status === "online"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {client.status === "online" ? "онлайн" : "офлайн"}
                  </span>
                </div>
                <div className="mt-2 grid gap-1 text-xs text-slate-600">
                  <p>{client.group || "Группа не указана"}</p>
                  <p>{client.contract || "Договор не указан"}</p>
                  {Number(client.debt) > 0 && (
                    <p className="font-bold text-red-700">
                      Долг: {formatMoney(Number(client.debt))}
                    </p>
                  )}
                </div>
              </Link>
            ))
          ) : (
            <div className="rounded-lg bg-white px-3 py-6 text-center text-sm font-medium text-slate-500 ring-1 ring-slate-200">
              Клиенты не найдены
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-white p-3 ring-1 ring-slate-200">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-lg font-bold text-slate-900">{value}</p>
    </div>
  );
}

async function loadOnlineClients(router: ReturnType<typeof useRouter>) {
  try {
    const response = await fetch("/api/clients", { cache: "no-store" });
    if (response.status === 401) {
      router.replace("/admin/login");
      return [];
    }
    if (!response.ok) throw new Error("clients");
    const data = (await response.json()) as { clients?: ClientRecord[] };
    return mergeLocalClients(Array.isArray(data.clients) ? data.clients : []);
  } catch {
    return readLocalClients();
  }
}

function normalizeSearch(value: string) {
  return value.toLocaleLowerCase("ru").replace(/\s+/g, " ").trim();
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("uk-UA", {
    style: "currency",
    currency: "UAH",
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value);
}
