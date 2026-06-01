"use client";

import { PageShell } from "@/components/PageShell";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <PageShell variant="agent" title="Ошибка">
      <div className="px-4 py-16 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-red-50 text-red-600">
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M4.93 19h14.14a1.5 1.5 0 0 0 1.3-2.25L13.3 4.5a1.5 1.5 0 0 0-2.6 0L3.63 16.75A1.5 1.5 0 0 0 4.93 19Z" />
          </svg>
        </div>
        <h1 className="mt-4 text-lg font-bold text-slate-900">
          Что-то пошло не так
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Проверьте соединение или попробуйте обновить экран.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-5 rounded-lg bg-brand-600 px-5 py-3 text-sm font-bold text-white active:bg-brand-700"
        >
          Повторить
        </button>
      </div>
    </PageShell>
  );
}
