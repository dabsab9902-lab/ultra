import Link from "next/link";
import { PageShell } from "@/components/PageShell";

export default function NotFound() {
  return (
    <PageShell title="Не найдено">
      <div className="px-4 py-20 text-center">
        <p className="text-5xl">404</p>
        <p className="mt-4 text-lg font-semibold">Страница не найдена</p>
        <Link
          href="/"
          className="mt-6 inline-flex rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white"
        >
          На главную
        </Link>
      </div>
    </PageShell>
  );
}
