import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import {
  ADMIN_SESSION_COOKIE,
  isValidAdminSession,
} from "@/lib/server/admin-auth";
import { AdminLogoutButton } from "./AdminLogoutButton";

const panelItems = [
  {
    href: "/admin/orders",
    title: "\u0417\u0430\u043a\u0430\u0437\u044b",
    text: "\u041d\u043e\u0432\u044b\u0435 \u0437\u0430\u044f\u0432\u043a\u0438, \u0441\u0442\u0430\u0442\u0443\u0441\u044b \u0438 \u0441\u0443\u043c\u043c\u044b",
  },
  {
    href: "/admin/clients",
    title: "\u041a\u043b\u0438\u0435\u043d\u0442\u044b",
    text: "\u0414\u043e\u0441\u0442\u0443\u043f\u044b, \u0441\u0442\u0430\u0442\u0443\u0441\u044b \u0438 \u043a\u043e\u0434\u044b \u0432\u0445\u043e\u0434\u0430",
  },
  {
    href: "/admin/offline-clients",
    title: "\u0421\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u044e\u0449\u0438\u0435 \u043a\u043b\u0438\u0435\u043d\u0442\u044b (\u043e\u0444\u043b\u0430\u0439\u043d)",
    text: "\u041a\u043e\u043d\u0442\u0440\u0430\u0433\u0435\u043d\u0442\u044b AgentPlus / 1\u0421, \u0434\u043e\u0433\u043e\u0432\u043e\u0440\u044b, \u0442\u0435\u043b\u0435\u0444\u043e\u043d\u044b \u0438 \u043f\u0435\u0440\u0435\u043d\u043e\u0441 \u0432 \u043e\u043d\u043b\u0430\u0439\u043d",
  },
  {
    href: "/admin/agentplus-tree",
    title: "\u0414\u0435\u0440\u0435\u0432\u043e 1\u0421",
    text: "\u0423\u0447\u0435\u0442\u043d\u044b\u0435 \u0433\u0440\u0443\u043f\u043f\u044b AgentPlus / 1\u0421, \u0446\u0435\u043d\u044b, \u043e\u0441\u0442\u0430\u0442\u043a\u0438 \u0438 \u0441\u0432\u044f\u0437\u0438 \u0441 PWA-\u0442\u043e\u0432\u0430\u0440\u0430\u043c\u0438",
  },
  {
    href: "/admin/offers",
    title: "Коммерческие предложения",
    text: "Сборка КП через дерево каталога, поиск и персональные цены",
  },
  {
    href: "/admin/clients",
    title: "\u0421\u043a\u0438\u0434\u043a\u0438 \u043f\u043e \u0431\u0440\u0435\u043d\u0434\u0430\u043c",
    text: "\u041f\u0435\u0440\u0441\u043e\u043d\u0430\u043b\u044c\u043d\u044b\u0435 \u0446\u0435\u043d\u044b \u0434\u043b\u044f B2B-\u043a\u043b\u0438\u0435\u043d\u0442\u043e\u0432",
  },
  {
    href: "/admin/clients",
    title: "\u0421\u0442\u0430\u0442\u0438\u0441\u0442\u0438\u043a\u0430",
    text: "\u041a\u0430\u0440\u0442\u043e\u0447\u043a\u0438 \u043a\u043b\u0438\u0435\u043d\u0442\u043e\u0432 \u0438 \u0438\u0445 \u0437\u0430\u043a\u0430\u0437\u044b",
  },
  {
    href: "/admin/orders",
    title: "\u0423\u0432\u0435\u0434\u043e\u043c\u043b\u0435\u043d\u0438\u044f",
    text: "\u041f\u0443\u043b\u044c\u0441 \u043d\u043e\u0432\u044b\u0445 \u0437\u0430\u043a\u0430\u0437\u043e\u0432 \u0434\u043b\u044f \u043c\u0435\u043d\u0435\u0434\u0436\u0435\u0440\u0430",
  },
];

export default async function AdminDashboardPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;

  if (!isValidAdminSession(token)) {
    redirect("/admin/login");
  }

  return (
    <PageShell
      variant="agent"
      title={"\u041f\u0430\u043d\u0435\u043b\u044c \u043c\u0435\u043d\u0435\u0434\u0436\u0435\u0440\u0430"}
      hideNav
    >
      <div className="sticky top-0 z-30 border-b border-slate-200 bg-slate-100 safe-top">
        <div className="mx-auto max-w-lg px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            {"\u041c\u0435\u043d\u0435\u0434\u0436\u0435\u0440"}
          </p>
          <div className="mt-1 flex items-center justify-between gap-3">
            <h1 className="text-lg font-bold text-slate-900">
              {"\u041f\u0430\u043d\u0435\u043b\u044c"}
            </h1>
            <AdminLogoutButton />
          </div>
        </div>
      </div>

      <div className="grid gap-2 px-3 py-3">
        {panelItems.map((item) => (
          <Link
            key={`${item.href}-${item.title}`}
            href={item.href}
            className="rounded-lg bg-white p-3 ring-1 ring-slate-200 transition active:scale-[0.99] active:bg-slate-50"
          >
            <p className="text-sm font-bold text-slate-900">{item.title}</p>
            <p className="mt-1 text-xs text-slate-500">{item.text}</p>
          </Link>
        ))}
      </div>
    </PageShell>
  );
}
