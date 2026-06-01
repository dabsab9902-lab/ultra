"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { markAdminSession } from "@/lib/admin-session";

export default function AdminLoginPage() {
  const router = useRouter();
  const [login, setLogin] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!login.trim() || !password.trim()) {
      setError("\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043b\u043e\u0433\u0438\u043d \u0438 \u043f\u0430\u0440\u043e\u043b\u044c");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ login, password }),
      });

      if (!response.ok) {
        setError("\u041d\u0435\u0432\u0435\u0440\u043d\u044b\u0439 \u043b\u043e\u0433\u0438\u043d \u0438\u043b\u0438 \u043f\u0430\u0440\u043e\u043b\u044c");
        return;
      }

      markAdminSession();
      router.replace("/admin/orders");
      router.refresh();
    } catch {
      setError("\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0432\u043e\u0439\u0442\u0438");
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageShell
      variant="agent"
      title={"\u0412\u0445\u043e\u0434 \u043c\u0435\u043d\u0435\u0434\u0436\u0435\u0440\u0430"}
      hideNav
    >
      <div className="flex min-h-[70dvh] items-center px-3 py-8">
        <form
          onSubmit={handleSubmit}
          className="w-full rounded-lg bg-white p-4 ring-1 ring-slate-200"
        >
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            {"\u041c\u0435\u043d\u0435\u0434\u0436\u0435\u0440"}
          </p>
          <h1 className="mt-1 text-lg font-bold text-slate-900">
            {"\u0412\u0445\u043e\u0434 \u0432 \u043f\u0430\u043d\u0435\u043b\u044c"}
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            {"\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043b\u043e\u0433\u0438\u043d \u0438 \u043f\u0430\u0440\u043e\u043b\u044c \u043c\u0435\u043d\u0435\u0434\u0436\u0435\u0440\u0430."}
          </p>

          <label className="mt-4 block text-xs font-bold text-slate-700">
            {"\u041b\u043e\u0433\u0438\u043d"}
          </label>
          <input
            value={login}
            onChange={(event) => setLogin(event.target.value)}
            autoComplete="username"
            className="mt-1 h-11 w-full rounded-lg border-0 bg-slate-50 px-3 text-sm text-slate-900 ring-1 ring-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-600"
            placeholder="admin"
          />

          <label className="mt-3 block text-xs font-bold text-slate-700">
            {"\u041f\u0430\u0440\u043e\u043b\u044c"}
          </label>
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            autoComplete="current-password"
            className="mt-1 h-11 w-full rounded-lg border-0 bg-slate-50 px-3 text-sm text-slate-900 ring-1 ring-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-600"
            placeholder="1234"
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
            {loading
              ? "\u041f\u0440\u043e\u0432\u0435\u0440\u044f\u0435\u043c..."
              : "\u0412\u043e\u0439\u0442\u0438"}
          </button>
        </form>
      </div>
    </PageShell>
  );
}
