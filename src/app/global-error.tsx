"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ru">
      <body>
        <main className="flex min-h-dvh items-center justify-center bg-slate-100 px-4 text-center">
          <div className="max-w-sm rounded-lg bg-white p-5 ring-1 ring-slate-200">
            <h1 className="text-lg font-bold text-slate-900">Ошибка загрузки</h1>
            <p className="mt-2 text-sm text-slate-500">
              Приложение не смогло открыть экран. Попробуйте еще раз.
            </p>
            <button
              type="button"
              onClick={reset}
              className="mt-5 rounded-lg bg-blue-600 px-5 py-3 text-sm font-bold text-white"
            >
              Повторить
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
