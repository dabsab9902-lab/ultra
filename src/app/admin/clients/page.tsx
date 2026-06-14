"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { clearAdminSession } from "@/lib/admin-session";
import {
  encodeClientAccess,
  readLocalClients,
  upsertLocalClient,
  writeLocalClients,
} from "@/lib/client-local-store";
import type { ClientDiscount, ClientRecord } from "@/lib/clients";

interface NewClientDraft {
  name: string;
  phone: string;
  code: string;
  active: boolean;
}

interface BrandOption {
  name: string;
  count: number;
}

interface ClientsStorageInfo {
  mode: "remote" | "local-file" | "vercel-tmp";
  durable: boolean;
  backupRequired: boolean;
  label: string;
  location: string;
}

const EMPTY_CLIENT: NewClientDraft = {
  name: "",
  phone: "",
  code: "",
  active: true,
};

export default function AdminClientsPage() {
  const router = useRouter();
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");
  const [serverBacked, setServerBacked] = useState(true);
  const [draft, setDraft] = useState(EMPTY_CLIENT);
  const [accessText, setAccessText] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const [brandOptions, setBrandOptions] = useState<BrandOption[]>([]);
  const [importing, setImporting] = useState(false);
  const [storageInfo, setStorageInfo] = useState<ClientsStorageInfo | null>(null);
  const [syncStatus, setSyncStatus] = useState("");

  const loadClients = useCallback(async () => {
    setLoading(true);
    setError("");
    setSyncStatus("");
    try {
      const response = await fetch("/api/clients", { cache: "no-store" });
      if (response.status === 401) {
        router.replace("/admin/login");
        return;
      }
      if (!response.ok) throw new Error("network");
      const data = (await response.json()) as {
        clients?: ClientRecord[];
        storage?: ClientsStorageInfo;
      };
      const remoteClients = Array.isArray(data.clients) ? data.clients : [];
      if (data.storage) setStorageInfo(data.storage);
      let nextClients = remoteClients;
      const localClients = readLocalClients();
      const localOnlyClients = localClients.filter(
        (client) => !remoteClients.some((remote) => sameClient(remote, client))
      );

      if (localOnlyClients.length > 0) {
        const importResult = await importClientsToServer(localOnlyClients);
        if (importResult?.clients) {
          nextClients = importResult.clients;
          if (importResult.storage) setStorageInfo(importResult.storage);
          setSyncStatus(
            `В общий список восстановлено локальных клиентов: ${
              importResult.created + importResult.updated
            }`
          );
        } else {
          setError(
            "Есть локальные клиенты, которых нет в общем хранилище. Используйте экспорт/импорт или проверьте серверное сохранение."
          );
        }
      }

      writeLocalClients(nextClients);
      setServerBacked(true);
      setClients(nextClients);
    } catch {
      const localClients = readLocalClients();
      if (localClients.length > 0) {
        setClients(localClients);
        setServerBacked(false);
        setError(
          "Сервер клиентов недоступен. Показана только локальная резервная копия этого браузера; карточки и вход с другого устройства могут быть недоступны."
        );
        return;
      }
      setServerBacked(false);
      setError("Не удалось загрузить клиентов из общего хранилища");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/products/brands", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { brands?: BrandOption[] } | null) => {
        if (!cancelled && Array.isArray(data?.brands)) {
          setBrandOptions(data.brands);
        }
      })
      .catch(() => {
        if (!cancelled) setBrandOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const createClient = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft.name.trim() || !draft.phone.trim() || !draft.code.trim()) {
      setError("Заполните имя, телефон и код входа");
      return;
    }

    setSavingId("new");
    setError("");
    try {
      const response = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, discounts: [] }),
      });
      if (response.status === 401) {
        router.replace("/admin/login");
        return;
      }
      if (!response.ok) throw new Error("network");
      const data = (await response.json()) as {
        client?: ClientRecord;
        storage?: ClientsStorageInfo;
      };
      if (data.storage) setStorageInfo(data.storage);
      if (data.client) {
        upsertLocalClient(data.client);
        setClients((current) =>
          [data.client!, ...current.filter((item) => !sameClient(item, data.client!))]
        );
        setAccessText(buildClientAccessText(data.client));
        setCopyStatus("");
        setDraft(EMPTY_CLIENT);
      }
    } catch {
      setError(
        "Не удалось сохранить клиента в общем хранилище. Клиент не создан локально, чтобы он не пропал на другом устройстве."
      );
    } finally {
      setSavingId("");
    }
  };

  const saveClient = async (client: ClientRecord) => {
    setSavingId(client.id);
    setError("");
    try {
      const response = await fetch("/api/clients", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(client),
      });
      if (response.status === 401) {
        router.replace("/admin/login");
        return;
      }
      if (!response.ok) throw new Error("network");
      const data = (await response.json()) as {
        client?: ClientRecord;
        storage?: ClientsStorageInfo;
      };
      if (data.storage) setStorageInfo(data.storage);
      if (data.client) {
        upsertLocalClient(data.client);
        setClients((current) =>
          current.map((item) => (item.id === client.id ? data.client! : item))
        );
      }
    } catch {
      setError(
        "Не удалось сохранить изменения в общем хранилище. Локальная копия не обновлена, чтобы не разойтись с сервером."
      );
    } finally {
      setSavingId("");
    }
  };

  const updateLocalClient = (client: ClientRecord) => {
    setClients((current) =>
      current.map((item) => (item.id === client.id ? client : item))
    );
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

  const exportClients = () => {
      const payload = {
        version: 1,
        exportedAt: new Date().toISOString(),
        storage: storageInfo,
        clients,
      };
    const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ultra-svet-clients-${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const importClientsFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setImporting(true);
    setError("");
    try {
      const parsed = JSON.parse(await file.text()) as
        | { clients?: ClientRecord[] }
        | ClientRecord[];
      const importedClients = Array.isArray(parsed) ? parsed : parsed.clients;
      if (!Array.isArray(importedClients) || importedClients.length === 0) {
        throw new Error("empty");
      }

      const result = await importClientsToServer(importedClients);
      if (!result?.clients) throw new Error("network");

      if (result.storage) setStorageInfo(result.storage);
      writeLocalClients(result.clients);
      setServerBacked(true);
      setClients(result.clients);
      setSyncStatus(
        `Импорт клиентов завершен: добавлено ${result.created}, обновлено ${result.updated}, пропущено ${result.skipped}`
      );
    } catch {
      setError("Не удалось импортировать клиентов. Проверьте JSON-файл и серверное хранилище.");
    } finally {
      setImporting(false);
    }
  };

  return (
    <PageShell variant="agent" title="Клиенты" hideNav>
      <div className="sticky top-0 z-30 border-b border-slate-200 bg-slate-100 safe-top">
        <div className="mx-auto max-w-lg px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Менеджер
          </p>
          <div className="mt-1 flex items-center justify-between gap-3">
            <h1 className="text-lg font-bold text-slate-900">Клиенты</h1>
            <div className="flex shrink-0 gap-2">
              <Link
                href="/admin"
                className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-slate-700 ring-1 ring-slate-200 active:bg-slate-50"
              >
                {"\u041f\u0430\u043d\u0435\u043b\u044c"}
              </Link>
              <Link
                href="/admin/offline-clients"
                className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-slate-700 ring-1 ring-slate-200 active:bg-slate-50"
              >
                1С
              </Link>
              <Link
                href="/admin/orders"
                className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-slate-700 ring-1 ring-slate-200 active:bg-slate-50"
              >
                Заказы
              </Link>
              <Link
                href="/admin/offers"
                className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-slate-700 ring-1 ring-slate-200 active:bg-slate-50"
              >
                КП
              </Link>
              <button
                type="button"
                onClick={logout}
                className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-white active:bg-slate-700"
              >
                Выйти
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="px-3 py-3">
        {error && (
          <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700 ring-1 ring-red-200">
            {error}
          </div>
        )}

        {syncStatus && (
          <div className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
            {syncStatus}
          </div>
        )}

        {!serverBacked && (
          <div className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 ring-1 ring-amber-200">
            Сейчас общий список клиентов недоступен. Новых клиентов лучше не создавать, пока не восстановится серверное хранилище.
          </div>
        )}

        <section className="mb-3 rounded-lg bg-white p-3 ring-1 ring-slate-200">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-700">
                {"\u0425\u0440\u0430\u043d\u0435\u043d\u0438\u0435 \u043a\u043b\u0438\u0435\u043d\u0442\u043e\u0432"}
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                {getStorageDescription(storageInfo)}
              </p>
            </div>
            <span
              className={`shrink-0 rounded-md px-2 py-1 text-[10px] font-bold ring-1 ${getStorageBadgeClass(storageInfo)}`}
            >
              {getStorageBadgeText(storageInfo)}
            </span>
          </div>
          {storageInfo?.location && (
            <p className="mt-2 truncate rounded-md bg-slate-50 px-2 py-1.5 text-[10px] font-medium text-slate-500 ring-1 ring-slate-100">
              {storageInfo.location}
            </p>
          )}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={exportClients}
              disabled={clients.length === 0}
              className="rounded-lg bg-slate-100 px-3 py-2.5 text-xs font-bold text-slate-700 ring-1 ring-slate-200 active:bg-slate-200 disabled:text-slate-400"
            >
              {"\u042d\u043a\u0441\u043f\u043e\u0440\u0442 \u043a\u043b\u0438\u0435\u043d\u0442\u043e\u0432"}
            </button>
            <label className="flex cursor-pointer items-center justify-center rounded-lg bg-slate-900 px-3 py-2.5 text-xs font-bold text-white active:bg-slate-700">
              {importing
                ? "\u0418\u043c\u043f\u043e\u0440\u0442..."
                : "\u0418\u043c\u043f\u043e\u0440\u0442 \u043a\u043b\u0438\u0435\u043d\u0442\u043e\u0432"}
              <input
                type="file"
                accept="application/json,.json"
                onChange={importClientsFile}
                disabled={importing}
                className="sr-only"
              />
            </label>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
            {"\u042d\u043a\u0441\u043f\u043e\u0440\u0442 \u0441\u043e\u0445\u0440\u0430\u043d\u044f\u0435\u0442 \u0444\u0430\u0439\u043b \u043a\u043b\u0438\u0435\u043d\u0442\u043e\u0432; \u0438\u043c\u043f\u043e\u0440\u0442 \u0432\u043e\u0441\u0441\u0442\u0430\u043d\u0430\u0432\u043b\u0438\u0432\u0430\u0435\u0442 \u0438\u0445 \u0432 \u043e\u0431\u0449\u0435\u0435 \u0445\u0440\u0430\u043d\u0438\u043b\u0438\u0449\u0435."}
          </p>
        </section>

        {false && (
        <section className="mb-3 rounded-lg bg-white p-3 ring-1 ring-slate-200">
          <p className="text-xs font-bold text-slate-700">Резерв клиентов</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={exportClients}
              disabled={clients.length === 0}
              className="rounded-lg bg-slate-100 px-3 py-2.5 text-xs font-bold text-slate-700 ring-1 ring-slate-200 active:bg-slate-200 disabled:text-slate-400"
            >
              Экспорт
            </button>
            <label className="flex cursor-pointer items-center justify-center rounded-lg bg-slate-900 px-3 py-2.5 text-xs font-bold text-white active:bg-slate-700">
              {importing ? "Импорт..." : "Импорт"}
              <input
                type="file"
                accept="application/json,.json"
                onChange={importClientsFile}
                disabled={importing}
                className="sr-only"
              />
            </label>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
            Для демо это страховка: экспорт сохраняет общий список в файл, импорт восстанавливает его в серверное хранилище.
          </p>
        </section>
        )}

        <form
          onSubmit={createClient}
          className="rounded-lg bg-white p-3 ring-1 ring-slate-200"
        >
          <h2 className="text-sm font-bold text-slate-900">Новый клиент</h2>
          <div className="mt-3 grid gap-2">
            <input
              value={draft.name}
              onChange={(event) =>
                setDraft((current) => ({ ...current, name: event.target.value }))
              }
              className="h-10 rounded-lg border-0 bg-slate-50 px-3 text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-600"
              placeholder="Имя клиента"
            />
            <input
              value={draft.phone}
              onChange={(event) =>
                setDraft((current) => ({ ...current, phone: event.target.value }))
              }
              className="h-10 rounded-lg border-0 bg-slate-50 px-3 text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-600"
              placeholder="Телефон"
              inputMode="tel"
            />
            <input
              value={draft.code}
              onChange={(event) =>
                setDraft((current) => ({ ...current, code: event.target.value }))
              }
              className="h-10 rounded-lg border-0 bg-slate-50 px-3 text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-600"
              placeholder="Пароль или код входа"
            />
            <label className="flex min-h-10 items-center gap-2 rounded-lg bg-slate-50 px-3 text-sm font-bold text-slate-700 ring-1 ring-slate-200">
              <input
                type="checkbox"
                checked={draft.active}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    active: event.target.checked,
                  }))
                }
                className="h-4 w-4 accent-brand-600"
              />
              {"\u0410\u043a\u0442\u0438\u0432\u0435\u043d"}
            </label>
          </div>
          <button
            type="submit"
            disabled={savingId === "new"}
            className="mt-3 w-full rounded-lg bg-brand-600 py-3 text-sm font-bold text-white active:bg-brand-700 disabled:bg-slate-300"
          >
            Создать клиента
          </button>
        </form>

        {accessText && (
          <section className="mt-3 rounded-lg bg-emerald-50 p-3 ring-1 ring-emerald-200">
            <p className="text-sm font-bold text-emerald-900">
              {"\u0414\u043e\u0441\u0442\u0443\u043f \u043a\u043b\u0438\u0435\u043d\u0442\u0430 \u0433\u043e\u0442\u043e\u0432"}
            </p>
            <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-white p-3 text-xs leading-relaxed text-slate-700 ring-1 ring-emerald-100">
              {accessText}
            </pre>
            <button
              type="button"
              onClick={async () => {
                const copied = await copyTextToClipboard(accessText);
                setCopyStatus(
                  copied
                    ? "\u0414\u043e\u0441\u0442\u0443\u043f \u0441\u043a\u043e\u043f\u0438\u0440\u043e\u0432\u0430\u043d"
                    : "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0441\u043a\u043e\u043f\u0438\u0440\u043e\u0432\u0430\u0442\u044c"
                );
              }}
              className="mt-2 w-full rounded-lg bg-emerald-700 py-3 text-sm font-bold text-white active:bg-emerald-800"
            >
              {"\u0421\u043a\u043e\u043f\u0438\u0440\u043e\u0432\u0430\u0442\u044c \u0434\u043e\u0441\u0442\u0443\u043f \u043a\u043b\u0438\u0435\u043d\u0442\u0443"}
            </button>
            {copyStatus && (
              <p className="mt-2 text-xs font-bold text-emerald-800">
                {copyStatus}
              </p>
            )}
          </section>
        )}

        <div className="mt-3 space-y-2">
          {loading ? (
            Array.from({ length: 3 }).map((_, index) => (
              <div
                key={index}
                className="h-48 animate-pulse rounded-lg bg-white ring-1 ring-slate-200"
              />
            ))
          ) : clients.length === 0 ? (
            <div className="rounded-lg bg-white px-4 py-8 text-center ring-1 ring-slate-200">
              <p className="text-sm font-bold text-slate-800">Клиентов пока нет</p>
              <p className="mt-1 text-xs text-slate-500">
                Создайте клиента и добавьте скидки по брендам.
              </p>
            </div>
          ) : (
            clients.map((client) => (
              <ClientCard
                key={client.id}
                client={client}
                brandOptions={brandOptions}
                saving={savingId === client.id}
                serverBacked={serverBacked}
                onChange={updateLocalClient}
                onSave={saveClient}
              />
            ))
          )}
        </div>
      </div>
    </PageShell>
  );
}

function ClientCard({
  client,
  brandOptions,
  saving,
  serverBacked,
  onChange,
  onSave,
}: {
  client: ClientRecord;
  brandOptions: BrandOption[];
  saving: boolean;
  serverBacked: boolean;
  onChange: (client: ClientRecord) => void;
  onSave: (client: ClientRecord) => void;
}) {
  const [brandDraft, setBrandDraft] = useState("");
  const [percentDraft, setPercentDraft] = useState("");
  const allBrandOptions = mergeBrandOptions(brandOptions, client.discounts);

  const update = (patch: Partial<ClientRecord>) => {
    onChange({ ...client, ...patch });
  };

  const updateDiscount = (index: number, patch: Partial<ClientDiscount>) => {
    update({
      discounts: client.discounts.map((discount, itemIndex) =>
        itemIndex === index ? { ...discount, ...patch } : discount
      ),
    });
  };

  const addDiscount = () => {
    const brand = brandDraft.trim();
    const percent = Number(percentDraft);
    if (!brand || !Number.isFinite(percent) || percent <= 0) return;

    update({
      discounts: [
        ...client.discounts.filter(
          (item) => item.brand.toLocaleLowerCase("ru") !== brand.toLocaleLowerCase("ru")
        ),
        { brand, percent },
      ],
    });
    setBrandDraft("");
    setPercentDraft("");
  };

  const removeDiscount = (index: number) => {
    update({
      discounts: client.discounts.filter((_, itemIndex) => itemIndex !== index),
    });
  };

  return (
    <article className="rounded-lg bg-white p-3 ring-1 ring-slate-200">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-900">{client.name}</p>
          <p className="text-xs text-slate-500">{client.phone}</p>
        </div>
        {serverBacked ? (
          <Link
            href={`/admin/clients/${client.id}`}
            className="shrink-0 rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white active:bg-slate-700"
          >
            Карточка
          </Link>
        ) : (
          <span className="shrink-0 rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold text-slate-400 ring-1 ring-slate-200">
            Только копия
          </span>
        )}
        <label className="flex shrink-0 items-center gap-2 text-xs font-bold text-slate-700">
          <input
            type="checkbox"
            checked={client.active}
            onChange={(event) => update({ active: event.target.checked })}
            className="h-4 w-4 accent-brand-600"
          />
          Активен
        </label>
      </div>

      <div className="mt-3 grid gap-2">
        <input
          value={client.name}
          onChange={(event) => update({ name: event.target.value })}
          className="h-10 rounded-lg border-0 bg-slate-50 px-3 text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-600"
          placeholder="Имя"
        />
        <input
          value={client.phone}
          onChange={(event) => update({ phone: event.target.value })}
          className="h-10 rounded-lg border-0 bg-slate-50 px-3 text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-600"
          placeholder="Телефон"
        />
        <input
          value={client.code}
          onChange={(event) => update({ code: event.target.value })}
          className="h-10 rounded-lg border-0 bg-slate-50 px-3 text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-600"
          placeholder="Пароль или код"
        />
      </div>

      <div className="mt-3 border-t border-slate-100 pt-3">
        <p className="text-xs font-bold text-slate-700">Скидки по брендам</p>
        <div className="mt-2 space-y-2">
          {client.discounts.map((discount, index) => (
            <div key={`${discount.brand}-${index}`} className="grid grid-cols-[1fr_80px_36px] gap-2">
              <select
                value={discount.brand}
                onChange={(event) =>
                  updateDiscount(index, { brand: event.target.value })
                }
                className="h-10 rounded-lg border-0 bg-slate-50 px-3 text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-600"
                aria-label="Бренд скидки"
              >
                {allBrandOptions.map((brand) => (
                  <option key={brand} value={brand}>
                    {brand}
                  </option>
                ))}
              </select>
              <input
                value={discount.percent}
                onChange={(event) =>
                  updateDiscount(index, { percent: Number(event.target.value) })
                }
                className="h-10 rounded-lg border-0 bg-slate-50 px-3 text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-600"
                inputMode="decimal"
                placeholder="%"
              />
              <button
                type="button"
                onClick={() => removeDiscount(index)}
                className="h-10 rounded-lg bg-red-50 text-sm font-bold text-red-600 ring-1 ring-red-100 active:bg-red-100"
                aria-label="Удалить скидку"
              >
                ×
              </button>
            </div>
          ))}
        </div>

        <div className="mt-2 grid grid-cols-[1fr_80px_72px] gap-2">
          <select
            value={brandDraft}
            onChange={(event) => setBrandDraft(event.target.value)}
            className="h-10 rounded-lg border-0 bg-slate-50 px-3 text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-600"
            aria-label="Выберите бренд"
          >
            <option value="">Бренд</option>
            {allBrandOptions.map((brand) => (
              <option key={brand} value={brand}>
                {brand}
              </option>
            ))}
          </select>
          <input
            value={percentDraft}
            onChange={(event) => setPercentDraft(event.target.value)}
            className="h-10 rounded-lg border-0 bg-slate-50 px-3 text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-600"
            inputMode="decimal"
            placeholder="5"
          />
          <button
            type="button"
            onClick={addDiscount}
            className="h-10 rounded-lg bg-slate-800 text-xs font-bold text-white active:bg-slate-700"
          >
            Добавить
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={() => onSave(client)}
        disabled={saving || !serverBacked}
        className="mt-3 w-full rounded-lg bg-brand-600 py-3 text-sm font-bold text-white active:bg-brand-700 disabled:bg-slate-300"
      >
        {saving ? "Сохраняем..." : "Сохранить клиента"}
      </button>
    </article>
  );
}

function buildClientAccessText(client: ClientRecord) {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
  const loginUrl = `${origin}/login?access=${encodeClientAccess(client)}`;

  return [
    "\u0412\u0430\u0448 \u0434\u043e\u0441\u0442\u0443\u043f \u043a B2B \u043a\u0430\u0442\u0430\u043b\u043e\u0433\u0443 Ultra Svet:",
    `\u0441\u0441\u044b\u043b\u043a\u0430: ${loginUrl}`,
    `\u0442\u0435\u043b\u0435\u0444\u043e\u043d: ${client.phone}`,
    `\u043a\u043e\u0434 \u0434\u043e\u0441\u0442\u0443\u043f\u0430: ${client.code}`,
  ].join("\n");
}

function mergeBrandOptions(
  brands: BrandOption[],
  discounts: ClientDiscount[]
) {
  const values = new Map<string, string>();
  for (const brand of brands) {
    const name = brand.name.trim();
    if (name) values.set(name.toLocaleLowerCase("ru"), name);
  }
  for (const discount of discounts) {
    const name = discount.brand.trim();
    if (name) values.set(name.toLocaleLowerCase("ru"), name);
  }
  return Array.from(values.values()).sort((a, b) =>
    a.localeCompare(b, "ru", { numeric: true })
  );
}

function getStorageDescription(storage: ClientsStorageInfo | null) {
  if (!storage) {
    return "\u041f\u0440\u043e\u0432\u0435\u0440\u044f\u0435\u043c, \u0433\u0434\u0435 \u0441\u0435\u0439\u0447\u0430\u0441 \u0445\u0440\u0430\u043d\u044f\u0442\u0441\u044f \u043a\u043b\u0438\u0435\u043d\u0442\u044b.";
  }

  if (storage.mode === "remote") {
    return "\u0412\u043a\u043b\u044e\u0447\u0435\u043d\u043e \u043f\u043e\u0441\u0442\u043e\u044f\u043d\u043d\u043e\u0435 KV/Upstash-\u0445\u0440\u0430\u043d\u0438\u043b\u0438\u0449\u0435: \u043a\u043b\u0438\u0435\u043d\u0442\u044b \u0441\u043e\u0445\u0440\u0430\u043d\u044f\u0442\u0441\u044f \u043f\u043e\u0441\u043b\u0435 redeploy \u0438 cold start.";
  }

  if (storage.mode === "vercel-tmp") {
    return "\u0414\u0435\u043c\u043e \u0440\u0430\u0431\u043e\u0442\u0430\u0435\u0442 \u0447\u0435\u0440\u0435\u0437 Vercel /tmp: \u043f\u043e\u0441\u043b\u0435 redeploy \u0438 cold start \u043d\u0443\u0436\u0435\u043d \u0438\u043c\u043f\u043e\u0440\u0442 \u0444\u0430\u0439\u043b\u0430-\u0440\u0435\u0437\u0435\u0440\u0432\u0430.";
  }

  return "\u041b\u043e\u043a\u0430\u043b\u044c\u043d\u044b\u0439 data/clients.json: \u043a\u043b\u0438\u0435\u043d\u0442\u044b \u0436\u0438\u0432\u0443\u0442 \u043c\u0435\u0436\u0434\u0443 \u0437\u0430\u043f\u0443\u0441\u043a\u0430\u043c\u0438 \u043d\u0430 \u044d\u0442\u043e\u043c \u0441\u0435\u0440\u0432\u0435\u0440\u0435.";
}

function getStorageBadgeText(storage: ClientsStorageInfo | null) {
  if (!storage) return "\u041f\u0440\u043e\u0432\u0435\u0440\u043a\u0430";
  return storage.durable
    ? "\u041f\u043e\u0441\u0442\u043e\u044f\u043d\u043d\u043e"
    : "\u041d\u0443\u0436\u0435\u043d \u0440\u0435\u0437\u0435\u0440\u0432";
}

function getStorageBadgeClass(storage: ClientsStorageInfo | null) {
  if (!storage) return "bg-slate-50 text-slate-600 ring-slate-200";
  return storage.durable
    ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
    : "bg-amber-50 text-amber-800 ring-amber-200";
}

interface ClientImportResult {
  clients: ClientRecord[];
  created: number;
  updated: number;
  skipped: number;
  storage?: ClientsStorageInfo;
}

async function importClientsToServer(clients: ClientRecord[]) {
  try {
    const response = await fetch("/api/clients/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clients }),
    });
    if (!response.ok) return null;
    return (await response.json()) as ClientImportResult;
  } catch {
    return null;
  }
}

function sameClient(first: ClientRecord, second: ClientRecord) {
  if (first.id && first.id === second.id) return true;
  if (
    first.agentPlusClientId &&
    second.agentPlusClientId &&
    first.agentPlusClientId === second.agentPlusClientId
  ) {
    return true;
  }
  return normalizeClientPhone(first.phone) === normalizeClientPhone(second.phone);
}

function normalizeClientPhone(value: string) {
  return value.replace(/[^\d+]/g, "").trim();
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
