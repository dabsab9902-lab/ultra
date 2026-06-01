import Link from "next/link";
import { PageShell } from "@/components/PageShell";

export default function OfflinePage() {
  return (
    <PageShell variant="agent" title="Ultra Svet" hideNav>
      <div className="px-3 py-10">
        <div className="rounded-lg bg-white p-5 text-center ring-1 ring-slate-200">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
            <svg
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 3l18 18M8.5 8.5a7.5 7.5 0 0 1 10.1 2.1M5.5 11.5a11 11 0 0 1 5-3.1m-2 7.1a5 5 0 0 1 7 0M12 19h.01"
              />
            </svg>
          </div>
          <h1 className="mt-4 text-lg font-bold text-slate-900">
            Нет соединения
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Откройте каталог: сохраненные товары, поиск и просмотренные
            изображения останутся доступны офлайн.
          </p>
          <Link
            href="/catalog"
            className="mt-5 flex w-full items-center justify-center rounded-lg bg-brand-600 py-3 text-sm font-bold text-white active:bg-brand-700"
          >
            Перейти в каталог
          </Link>
        </div>
      </div>
    </PageShell>
  );
}
