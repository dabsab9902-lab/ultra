"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import type { AgentPlusOfflineClient } from "@/lib/agentplus-offline-clients";
import {
  encodeClientAccess,
  readLocalClients,
  upsertLocalClient,
} from "@/lib/client-local-store";
import type { ClientRecord } from "@/lib/clients";
import { AdminLogoutButton } from "../../AdminLogoutButton";

type OfflineClientDetails = AgentPlusOfflineClient & {
  status?: "offline" | "online";
  onlineClientId?: string;
};

interface OfflineClientDetailsClientProps {
  id: string;
}

export function OfflineClientDetailsClient({
  id,
}: OfflineClientDetailsClientProps) {
  const router = useRouter();
  const [offlineClient, setOfflineClient] =
    useState<OfflineClientDetails | null>(null);
  const [onlineClient, setOnlineClient] = useState<ClientRecord | null>(null);
  const [accessText, setAccessText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadClient = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/offline-clients/${encodeURIComponent(id)}`, {
        cache: "no-store",
      });
      if (response.status === 401) {
        router.replace("/admin/login");
        return;
      }
      if (response.status === 404) {
        setError("Офлайн-клиент не найден");
        return;
      }
      if (!response.ok) throw new Error("offline-client");

      const data = (await response.json()) as {
        client?: OfflineClientDetails;
        onlineClient?: ClientRecord | null;
      };
      const localLinked =
        readLocalClients().find((client) => client.agentPlusClientId === id) ??
        null;
      let linkedClient = data.onlineClient ?? null;

      if (!linkedClient && localLinked) {
        const importResult = await importClientsToServer([localLinked]);
        linkedClient =
          importResult?.clients.find(
            (client) => client.agentPlusClientId === id
          ) ?? null;
      }

      setOfflineClient(data.client ?? null);
      setOnlineClient(linkedClient);
      if (linkedClient) setAccessText(buildAccessText(linkedClient));
    } catch {
      setError("Не удалось загрузить карточку клиента");
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    void loadClient();
  }, [loadClient]);

  const status = onlineClient ? "online" : offlineClient?.status ?? "offline";

  const allPhones = useMemo(() => {
    const phones = offlineClient?.phones ?? [];
    return Array.from(new Set(phones.filter(Boolean)));
  }, [offlineClient]);

  const makeOnline = async () => {
    if (!offlineClient) return;

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch(
        `/api/offline-clients/${encodeURIComponent(offlineClient.id)}/make-online`,
        { method: "POST" }
      );
      if (response.status === 401) {
        router.replace("/admin/login");
        return;
      }
      if (!response.ok) throw new Error("make-online");

      const data = (await response.json()) as {
        client?: ClientRecord;
        created?: boolean;
      };
      if (!data.client) throw new Error("make-online");

      upsertLocalClient(data.client);
      setOnlineClient(data.client);
      setAccessText(buildAccessText(data.client));
      setMessage(data.created ? "Онлайн-профиль создан" : "Онлайн-доступ уже был создан");
    } catch {
      setError(
        "Не удалось создать онлайн-доступ в общем хранилище. Локальный профиль не создан, чтобы клиент не пропал на другом устройстве."
      );
    } finally {
      setSaving(false);
    }
  };

  const copyAccess = async () => {
    const copied = await copyTextToClipboard(accessText);
    setMessage(copied ? "Доступ скопирован" : "Не удалось скопировать");
  };

  const shareAccess = async () => {
    if (!accessText.trim()) return;

    try {
      if (navigator.share) {
        await navigator.share({
          title: "Доступ к B2B каталогу Ultra Svet",
          text: accessText,
        });
        setMessage("Открыто меню отправки");
        return;
      }
    } catch {
      /* fallback to clipboard */
    }

    await copyAccess();
  };

  return (
    <PageShell variant="agent" title="Офлайн-клиент" hideNav>
      <div className="sticky top-0 z-30 border-b border-slate-200 bg-slate-100 safe-top">
        <div className="mx-auto max-w-lg px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Менеджер
          </p>
          <div className="mt-1 flex items-center justify-between gap-3">
            <h1 className="text-lg font-bold text-slate-900">Клиент 1С</h1>
            <div className="flex shrink-0 gap-2">
              <Link
                href="/admin/offline-clients"
                className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-slate-700 ring-1 ring-slate-200 active:bg-slate-50"
              >
                Назад
              </Link>
              <AdminLogoutButton />
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3 px-3 py-3">
        {loading ? (
          <div className="h-64 animate-pulse rounded-lg bg-white ring-1 ring-slate-200" />
        ) : error ? (
          <div className="rounded-lg bg-red-50 px-3 py-3 text-sm font-medium text-red-700 ring-1 ring-red-200">
            {error}
          </div>
        ) : offlineClient ? (
          <>
            <section className="rounded-lg bg-white p-3 ring-1 ring-slate-200">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    Контрагент AgentPlus / 1С
                  </p>
                  <h2 className="mt-1 text-lg font-bold text-slate-900">
                    {offlineClient.name}
                  </h2>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${
                    status === "online"
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {status === "online" ? "онлайн" : "офлайн"}
                </span>
              </div>

              <div className="mt-3 grid gap-2 text-sm text-slate-700">
                <InfoRow label="GUID" value={offlineClient.id} />
                <InfoRow label="Телефон" value={allPhones.join(", ") || "Не указан"} />
                <InfoRow
                  label="Группа"
                  value={
                    offlineClient.groupPath.length
                      ? offlineClient.groupPath.join(" / ")
                      : offlineClient.group || "Не указана"
                  }
                />
                <InfoRow
                  label="Договор"
                  value={offlineClient.contracts.join(", ") || "Не указан"}
                />
                <InfoRow
                  label="Долг"
                  value={
                    Number(offlineClient.debt) > 0
                      ? `${formatMoney(Number(offlineClient.debt))}${
                          offlineClient.debtDate ? `, ${offlineClient.debtDate}` : ""
                        }`
                      : "Нет данных"
                  }
                />
              </div>
            </section>

            <section className="rounded-lg bg-white p-3 ring-1 ring-slate-200">
              <p className="text-sm font-bold text-slate-900">Онлайн-доступ</p>
              <p className="mt-1 text-xs text-slate-500">
                Профиль создается отдельно от офлайн-базы и связывается по GUID
                клиента AgentPlus.
              </p>

              <button
                type="button"
                onClick={makeOnline}
                disabled={saving}
                className="mt-3 w-full rounded-lg bg-emerald-700 py-3 text-sm font-bold text-white active:bg-emerald-800 disabled:bg-slate-300 disabled:text-slate-500"
              >
                {saving
                  ? "Создаем..."
                  : onlineClient
                    ? "Показать доступ"
                    : "Сделать онлайн"}
              </button>

              {accessText && (
                <div className="mt-3 rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
                  <pre className="whitespace-pre-wrap break-words text-xs font-medium leading-5 text-slate-800">
                    {accessText}
                  </pre>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={copyAccess}
                      className="rounded-lg bg-slate-900 py-3 text-xs font-bold text-white active:bg-slate-700"
                    >
                      Скопировать доступ
                    </button>
                    <button
                      type="button"
                      onClick={shareAccess}
                      className="rounded-lg bg-brand-600 py-3 text-xs font-bold text-white active:bg-brand-700"
                    >
                      Отправить
                    </button>
                  </div>
                </div>
              )}

              {onlineClient?.agentPlusClientId && (
                <div className="mt-2 rounded-lg bg-emerald-50 p-3 ring-1 ring-emerald-100">
                  <p className="text-xs font-medium text-emerald-700">
                    Связан с онлайн-клиентом: {onlineClient.name}
                  </p>
                  <Link
                    href={`/admin/clients/${onlineClient.id}`}
                    className="mt-2 flex min-h-10 items-center justify-center rounded-lg bg-white px-3 text-xs font-bold text-emerald-800 ring-1 ring-emerald-200 active:bg-emerald-100"
                  >
                    Настроить скидки по брендам
                  </Link>
                </div>
              )}
              {message && (
                <p className="mt-2 text-xs font-bold text-emerald-700">{message}</p>
              )}
            </section>
          </>
        ) : null}
      </div>
    </PageShell>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </p>
      <p className="break-words font-medium text-slate-800">{value}</p>
    </div>
  );
}

function buildAccessText(client: ClientRecord) {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
  const loginUrl = `${origin}/login?access=${encodeClientAccess(client)}`;

  return [
    "Ваш доступ к B2B каталогу Ultra Svet:",
    `Ссылка: ${loginUrl}`,
    `Логин: ${client.phone}`,
    `Пароль: ${client.code}`,
  ].join("\n");
}

async function importClientsToServer(clients: ClientRecord[]) {
  try {
    const response = await fetch("/api/clients/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clients }),
    });
    if (!response.ok) return null;
    return (await response.json()) as { clients: ClientRecord[] };
  } catch {
    return null;
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
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("uk-UA", {
    style: "currency",
    currency: "UAH",
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value);
}
