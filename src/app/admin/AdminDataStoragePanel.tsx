"use client";

import { ChangeEvent, useCallback, useEffect, useState } from "react";
import type { ClientRecord } from "@/lib/clients";
import type { CommercialProposal } from "@/lib/commercial-proposals";
import type { ManagerOrder } from "@/lib/manager-orders";

interface StorageInfo {
  mode: string;
  durable: boolean;
  backupRequired: boolean;
  label: string;
  location: string;
}

interface StorageState {
  clients: ClientRecord[];
  orders: ManagerOrder[];
  proposals: CommercialProposal[];
  clientsStorage: StorageInfo | null;
  ordersStorage: StorageInfo | null;
  proposalsStorage: StorageInfo | null;
}

interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  orders?: ManagerOrder[];
  proposals?: CommercialProposal[];
  storage?: StorageInfo;
}

const EMPTY_STATE: StorageState = {
  clients: [],
  orders: [],
  proposals: [],
  clientsStorage: null,
  ordersStorage: null,
  proposalsStorage: null,
};

export function AdminDataStoragePanel() {
  const [state, setState] = useState<StorageState>(EMPTY_STATE);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadState = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [clientsResponse, ordersResponse, proposalsResponse] =
        await Promise.all([
          fetch("/api/clients", { cache: "no-store" }),
          fetch("/api/orders", { cache: "no-store" }),
          fetch("/api/proposals", { cache: "no-store" }),
        ]);

      if (
        clientsResponse.status === 401 ||
        ordersResponse.status === 401 ||
        proposalsResponse.status === 401
      ) {
        setError(
          "\u0421\u0435\u0441\u0441\u0438\u044f \u043c\u0435\u043d\u0435\u0434\u0436\u0435\u0440\u0430 \u0438\u0441\u0442\u0435\u043a\u043b\u0430. \u0412\u043e\u0439\u0434\u0438\u0442\u0435 \u0432 \u0430\u0434\u043c\u0438\u043d\u043a\u0443 \u0437\u0430\u043d\u043e\u0432\u043e."
        );
        return;
      }

      if (!clientsResponse.ok || !ordersResponse.ok || !proposalsResponse.ok) {
        throw new Error("network");
      }

      const clientsData = (await clientsResponse.json()) as {
        clients?: ClientRecord[];
        storage?: StorageInfo;
      };
      const ordersData = (await ordersResponse.json()) as {
        orders?: ManagerOrder[];
        storage?: StorageInfo;
      };
      const proposalsData = (await proposalsResponse.json()) as {
        proposals?: CommercialProposal[];
        storage?: StorageInfo;
      };

      setState({
        clients: Array.isArray(clientsData.clients) ? clientsData.clients : [],
        orders: Array.isArray(ordersData.orders) ? ordersData.orders : [],
        proposals: Array.isArray(proposalsData.proposals)
          ? proposalsData.proposals
          : [],
        clientsStorage: clientsData.storage ?? null,
        ordersStorage: ordersData.storage ?? null,
        proposalsStorage: proposalsData.storage ?? null,
      });
    } catch {
      setError(
        "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043f\u0440\u043e\u0447\u0438\u0442\u0430\u0442\u044c \u0441\u0442\u0430\u0442\u0443\u0441 \u0445\u0440\u0430\u043d\u0435\u043d\u0438\u044f."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadState();
  }, [loadState]);

  const exportOrders = () => {
    downloadJson("orders", {
      version: 1,
      type: "orders",
      exportedAt: new Date().toISOString(),
      storage: state.ordersStorage,
      orders: state.orders,
    });
  };

  const exportProposals = () => {
    downloadJson("proposals", {
      version: 1,
      type: "proposals",
      exportedAt: new Date().toISOString(),
      storage: state.proposalsStorage,
      proposals: state.proposals,
    });
  };

  const importOrders = async (event: ChangeEvent<HTMLInputElement>) => {
    await importJsonFile({
      event,
      type: "orders",
      endpoint: "/api/orders/import",
      emptyError:
        "\u0412 JSON-\u0444\u0430\u0439\u043b\u0435 \u043d\u0435\u0442 \u0437\u0430\u043a\u0430\u0437\u043e\u0432.",
      successLabel: "\u0418\u043c\u043f\u043e\u0440\u0442 \u0437\u0430\u043a\u0430\u0437\u043e\u0432",
    });
  };

  const importProposals = async (event: ChangeEvent<HTMLInputElement>) => {
    await importJsonFile({
      event,
      type: "proposals",
      endpoint: "/api/proposals/import",
      emptyError:
        "\u0412 JSON-\u0444\u0430\u0439\u043b\u0435 \u043d\u0435\u0442 \u043a\u043e\u043c\u043c\u0435\u0440\u0447\u0435\u0441\u043a\u0438\u0445 \u043f\u0440\u0435\u0434\u043b\u043e\u0436\u0435\u043d\u0438\u0439.",
      successLabel: "\u0418\u043c\u043f\u043e\u0440\u0442 \u041a\u041f",
    });
  };

  const importJsonFile = async ({
    event,
    type,
    endpoint,
    emptyError,
    successLabel,
  }: {
    event: ChangeEvent<HTMLInputElement>;
    type: "orders" | "proposals";
    endpoint: string;
    emptyError: string;
    successLabel: string;
  }) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setImporting(type);
    setMessage("");
    setError("");

    try {
      const parsed = JSON.parse(await file.text()) as Record<string, unknown>;
      const items = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed[type])
          ? parsed[type]
          : [];
      if (items.length === 0) throw new Error(emptyError);

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [type]: items }),
      });
      const data = (await response.json()) as ImportResult;
      if (!response.ok) throw new Error("network");

      setMessage(
        `${successLabel}: \u0434\u043e\u0431\u0430\u0432\u043b\u0435\u043d\u043e ${data.created}, \u043e\u0431\u043d\u043e\u0432\u043b\u0435\u043d\u043e ${data.updated}, \u043f\u0440\u043e\u043f\u0443\u0449\u0435\u043d\u043e ${data.skipped}`
      );
      await loadState();
    } catch (caught) {
      setError(
        caught instanceof Error && caught.message !== "network"
          ? caught.message
          : "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0438\u043c\u043f\u043e\u0440\u0442\u0438\u0440\u043e\u0432\u0430\u0442\u044c JSON-\u0444\u0430\u0439\u043b."
      );
    } finally {
      setImporting("");
    }
  };

  const demoRisk =
    state.clientsStorage?.backupRequired ||
    state.ordersStorage?.backupRequired ||
    state.proposalsStorage?.backupRequired;

  return (
    <section className="rounded-lg bg-white p-3 ring-1 ring-slate-200">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-900">
            {"\u0425\u0440\u0430\u043d\u0435\u043d\u0438\u0435 \u0434\u0430\u043d\u043d\u044b\u0445"}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            {"\u0421\u0442\u0430\u0442\u0443\u0441 \u0445\u0440\u0430\u043d\u0435\u043d\u0438\u044f \u043a\u043b\u0438\u0435\u043d\u0442\u043e\u0432, \u0437\u0430\u043a\u0430\u0437\u043e\u0432 \u0438 \u043a\u043e\u043c\u043c\u0435\u0440\u0447\u0435\u0441\u043a\u0438\u0445 \u043f\u0440\u0435\u0434\u043b\u043e\u0436\u0435\u043d\u0438\u0439."}
          </p>
        </div>
        <button
          type="button"
          onClick={loadState}
          disabled={loading}
          className="shrink-0 rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 ring-1 ring-slate-200 active:bg-slate-200 disabled:text-slate-400"
        >
          {loading
            ? "\u041e\u0431\u043d\u043e\u0432\u043b\u044f\u0435\u043c..."
            : "\u041e\u0431\u043d\u043e\u0432\u0438\u0442\u044c"}
        </button>
      </div>

      {(demoRisk || loading) && (
        <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-bold leading-relaxed text-amber-800 ring-1 ring-amber-200">
          {"\u0414\u0435\u043c\u043e-\u0440\u0435\u0436\u0438\u043c: \u0434\u0430\u043d\u043d\u044b\u0435 \u043c\u043e\u0433\u0443\u0442 \u0431\u044b\u0442\u044c \u043f\u043e\u0442\u0435\u0440\u044f\u043d\u044b \u043f\u043e\u0441\u043b\u0435 \u043e\u0431\u043d\u043e\u0432\u043b\u0435\u043d\u0438\u044f \u0441\u0435\u0440\u0432\u0435\u0440\u0430. \u041f\u0435\u0440\u0435\u0434 \u043e\u0431\u043d\u043e\u0432\u043b\u0435\u043d\u0438\u0435\u043c \u0434\u0435\u043b\u0430\u0439\u0442\u0435 \u044d\u043a\u0441\u043f\u043e\u0440\u0442."}
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700 ring-1 ring-red-200">
          {error}
        </div>
      )}
      {message && (
        <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
          {message}
        </div>
      )}

      <div className="mt-3 grid gap-2">
        <StorageRow
          title={"\u041a\u043b\u0438\u0435\u043d\u0442\u044b"}
          count={state.clients.length}
          storage={state.clientsStorage}
        />
        <StorageRow
          title={"\u0417\u0430\u043a\u0430\u0437\u044b"}
          count={state.orders.length}
          storage={state.ordersStorage}
        />
        <StorageRow
          title={"\u041a\u041f"}
          count={state.proposals.length}
          storage={state.proposalsStorage}
        />
      </div>

      <div className="mt-3 grid gap-2">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={exportOrders}
            disabled={state.orders.length === 0}
            className="rounded-lg bg-slate-100 px-3 py-2.5 text-xs font-bold text-slate-700 ring-1 ring-slate-200 active:bg-slate-200 disabled:text-slate-400"
          >
            {"\u042d\u043a\u0441\u043f\u043e\u0440\u0442 \u0437\u0430\u043a\u0430\u0437\u043e\u0432"}
          </button>
          <ImportButton
            label={"\u0418\u043c\u043f\u043e\u0440\u0442 \u0437\u0430\u043a\u0430\u0437\u043e\u0432"}
            busy={importing === "orders"}
            onChange={importOrders}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={exportProposals}
            disabled={state.proposals.length === 0}
            className="rounded-lg bg-slate-100 px-3 py-2.5 text-xs font-bold text-slate-700 ring-1 ring-slate-200 active:bg-slate-200 disabled:text-slate-400"
          >
            {"\u042d\u043a\u0441\u043f\u043e\u0440\u0442 \u041a\u041f"}
          </button>
          <ImportButton
            label={"\u0418\u043c\u043f\u043e\u0440\u0442 \u041a\u041f"}
            busy={importing === "proposals"}
            onChange={importProposals}
          />
        </div>
      </div>
    </section>
  );
}

function StorageRow({
  title,
  count,
  storage,
}: {
  title: string;
  count: number;
  storage: StorageInfo | null;
}) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2 ring-1 ring-slate-100">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-bold text-slate-800">{title}</p>
          <p className="mt-0.5 truncate text-[10px] text-slate-500">
            {storage?.label ?? "\u041f\u0440\u043e\u0432\u0435\u0440\u043a\u0430"}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <span
            className={`inline-flex rounded-md px-2 py-1 text-[10px] font-bold ring-1 ${getBadgeClass(storage)}`}
          >
            {getBadgeText(storage)}
          </span>
          <p className="mt-1 text-[10px] font-bold tabular-nums text-slate-500">
            {count}
          </p>
        </div>
      </div>
      {storage?.location && (
        <p className="mt-1 truncate text-[10px] text-slate-400">
          {storage.location}
        </p>
      )}
    </div>
  );
}

function ImportButton({
  label,
  busy,
  onChange,
}: {
  label: string;
  busy: boolean;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-center rounded-lg bg-slate-900 px-3 py-2.5 text-xs font-bold text-white active:bg-slate-700">
      {busy ? "\u0418\u043c\u043f\u043e\u0440\u0442..." : label}
      <input
        type="file"
        accept="application/json,.json"
        onChange={onChange}
        disabled={busy}
        className="sr-only"
      />
    </label>
  );
}

function getBadgeText(storage: StorageInfo | null) {
  if (!storage) return "\u041f\u0440\u043e\u0432\u0435\u0440\u043a\u0430";
  return storage.durable
    ? "\u041f\u043e\u0441\u0442\u043e\u044f\u043d\u043d\u043e"
    : "\u0412\u0440\u0435\u043c\u0435\u043d\u043d\u043e /tmp";
}

function getBadgeClass(storage: StorageInfo | null) {
  if (!storage) return "bg-slate-100 text-slate-600 ring-slate-200";
  return storage.durable
    ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
    : "bg-amber-50 text-amber-800 ring-amber-200";
}

function downloadJson(type: "orders" | "proposals", payload: unknown) {
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `ultra-svet-${type}-${new Date()
    .toISOString()
    .slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
