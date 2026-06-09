"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { clearAdminSession } from "@/lib/admin-session";
import {
  createLocalClient,
  encodeClientAccess,
  mergeLocalClients,
  readLocalClients,
  upsertLocalClient,
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
  const [draft, setDraft] = useState(EMPTY_CLIENT);
  const [accessText, setAccessText] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const [brandOptions, setBrandOptions] = useState<BrandOption[]>([]);

  const loadClients = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/clients", { cache: "no-store" });
      if (response.status === 401) {
        router.replace("/admin/login");
        return;
      }
      if (!response.ok) throw new Error("network");
      const data = (await response.json()) as { clients?: ClientRecord[] };
      const remoteClients = Array.isArray(data.clients) ? data.clients : [];
      const merged = mergeLocalClients(remoteClients);
      setClients(merged);
      if (remoteClients.length === 0 && merged.length > 0) {
        void syncLocalClientsToServer(merged);
      }
    } catch {
      const localClients = readLocalClients();
      if (localClients.length > 0) {
        setClients(localClients);
        setError("Клиенты загружены из локального демо-хранилища");
        return;
      }
      setError("Не удалось загрузить клиентов");
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
      const data = (await response.json()) as { client?: ClientRecord };
      if (data.client) {
        upsertLocalClient(data.client);
        setClients((current) => [data.client!, ...current]);
        setAccessText(buildClientAccessText(data.client));
        setCopyStatus("");
        setDraft(EMPTY_CLIENT);
      }
    } catch {
      const client = createLocalClient({ ...draft, discounts: [] });
      if (client) {
        setClients((current) => [client, ...current]);
        setAccessText(buildClientAccessText(client));
        setCopyStatus("");
        setDraft(EMPTY_CLIENT);
        setError("Клиент сохранен локально для демо");
        return;
      }
      setError("Не удалось создать клиента");
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
      const data = (await response.json()) as { client?: ClientRecord };
      if (data.client) {
        upsertLocalClient(data.client);
        setClients((current) =>
          current.map((item) => (item.id === client.id ? data.client! : item))
        );
      }
    } catch {
      upsertLocalClient(client);
      setClients((current) =>
        current.map((item) => (item.id === client.id ? client : item))
      );
      setError("Клиент сохранен локально для демо");
      return;
      setError("Не удалось сохранить клиента");
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
  onChange,
  onSave,
}: {
  client: ClientRecord;
  brandOptions: BrandOption[];
  saving: boolean;
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
        <Link
          href={`/admin/clients/${client.id}`}
          className="shrink-0 rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white active:bg-slate-700"
        >
          Карточка
        </Link>
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
        disabled={saving}
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

async function syncLocalClientsToServer(clients: ClientRecord[]) {
  for (const client of clients) {
    try {
      await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(client),
      });
    } catch {
      /* Best effort: local demo storage remains the source of truth. */
    }
  }
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
