"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { setClientSession } from "@/lib/client-pricing-session";
import {
  decodeClientAccess,
  findLocalClientByLogin,
  toClientSession,
  upsertLocalClient,
} from "@/lib/client-local-store";

export default function ClientLoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const access = new URLSearchParams(window.location.search).get("access");
    if (!access) return;
    const client = decodeClientAccess(access);
    if (!client) return;
    setPhone(client.phone);
    setCode(client.code);
    setError("");
    window.history.replaceState(window.history.state, "", "/login");
  }, []);

  const continueWithoutLogin = async () => {
    setClientSession(null);
    try {
      await fetch("/api/client/logout", { method: "POST" });
    } catch {
      /* Guest mode should remain available even if logout request fails. */
    }
    router.replace("/catalog");
    router.refresh();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!phone.trim() || !code.trim()) {
      setError("Введите телефон и код входа");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/client/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code }),
      });

      let data = response.ok
        ? ((await response.json()) as {
            client?: {
              id?: string;
              name?: string;
              phone?: string;
              active?: boolean;
              discounts?: Array<{ brand: string; percent: number }>;
            };
          })
        : null;

      if (!data?.client) {
        const localClient = findLocalClientByLogin(phone, code);
        if (!localClient) {
          setError("Клиент не найден или код неверный");
          return;
        }
        data = { client: toClientSession(localClient) };
      }

      if (!data.client?.id || !data.client.name || !data.client.phone) {
        setError("Не удалось получить данные клиента");
        return;
      }

      const now = new Date().toISOString();
      upsertLocalClient({
        id: data.client.id,
        name: data.client.name,
        phone: data.client.phone,
        code: code.trim(),
        active: data.client.active !== false,
        discounts: data.client.discounts ?? [],
        createdAt: now,
        updatedAt: now,
      });
      setClientSession({
        id: data.client.id,
        name: data.client.name,
        phone: data.client.phone,
        active: data.client.active !== false,
        discounts: data.client.discounts ?? [],
      });
      router.replace("/catalog");
      router.refresh();
    } catch {
      setError("Не удалось войти");
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageShell variant="agent" title="Вход клиента" hideNav>
      <div className="flex min-h-[70dvh] items-center px-3 py-8">
        <form
          onSubmit={handleSubmit}
          className="w-full rounded-lg bg-white p-4 ring-1 ring-slate-200"
        >
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            B2B клиент
          </p>
          <h1 className="mt-1 text-lg font-bold text-slate-900">
            Вход в каталог
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Войдите по телефону и коду, который выдал менеджер.
          </p>

          <label className="mt-4 block text-xs font-bold text-slate-700">
            Телефон
          </label>
          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            className="mt-1 h-11 w-full rounded-lg border-0 bg-slate-50 px-3 text-sm text-slate-900 ring-1 ring-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-600"
            placeholder="+380..."
          />

          <label className="mt-3 block text-xs font-bold text-slate-700">
            Пароль или код
          </label>
          <input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            type="password"
            autoComplete="current-password"
            className="mt-1 h-11 w-full rounded-lg border-0 bg-slate-50 px-3 text-sm text-slate-900 ring-1 ring-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-600"
            placeholder="Код входа"
          />

          {error && (
            <p className="mt-2 rounded-md bg-red-50 px-2 py-1.5 text-xs font-medium text-red-700 ring-1 ring-red-200">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-4 w-full rounded-lg bg-brand-600 py-3 text-sm font-bold text-white active:bg-brand-700 disabled:bg-slate-300 disabled:text-slate-500"
          >
            {loading ? "Проверяем..." : "Войти"}
          </button>

          <button
            type="button"
            onClick={continueWithoutLogin}
            className="mt-3 flex w-full justify-center rounded-lg bg-white py-3 text-sm font-bold text-slate-700 ring-1 ring-slate-200 active:bg-slate-50"
          >
            Продолжить без входа
          </button>
          <Link
            href="/admin/login"
            className="mt-3 flex w-full justify-center rounded-lg bg-slate-900 py-3 text-sm font-bold text-white active:bg-slate-700"
          >
            Вход менеджера
          </Link>
        </form>
      </div>
    </PageShell>
  );
}
