import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { catalog } from "@/lib/catalog";

export default function HomePage() {
  const total = catalog.getTotalCount();

  return (
    <PageShell variant="agent" title="Ultra Svet">
      <div className="px-3 pt-3">
        <div className="rounded-lg bg-slate-800 p-4 text-white">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Инструмент торгового агента
          </p>
          <h1 className="mt-1 text-lg font-bold">Ultra Svet B2B</h1>
          <p className="mt-1 text-xs text-slate-300">
            {total} артикулов · быстрый подбор · корзина сохраняется
          </p>
          <Link
            href="/catalog"
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 py-3 text-sm font-bold text-white"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            Открыть подбор
          </Link>
        </div>
        <ul className="mt-4 space-y-2 text-sm text-slate-600">
          <li className="flex gap-2 rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200">
            <span className="font-bold text-brand-600">1</span>
            Вводите артикул в поиск — крупным шрифтом
          </li>
          <li className="flex gap-2 rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200">
            <span className="font-bold text-brand-600">2</span>
            Остаток и цена в каждой строке
          </li>
          <li className="flex gap-2 rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200">
            <span className="font-bold text-brand-600">3</span>
            Введите количество и добавляйте товар сразу в заказ
          </li>
          <li className="flex gap-2 rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200">
            <span className="font-bold text-brand-600">4</span>
            «Повторить заказ» после отправки заявки
          </li>
        </ul>
      </div>
    </PageShell>
  );
}
