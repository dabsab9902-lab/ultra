import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AgentPlusTreeBrowser } from "@/components/AgentPlusTreeBrowser";
import { PageShell } from "@/components/PageShell";
import {
  ADMIN_SESSION_COOKIE,
  isValidAdminSession,
} from "@/lib/server/admin-auth";
import { AdminLogoutButton } from "../AdminLogoutButton";

export default async function AdminAgentPlusTreePage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;

  if (!isValidAdminSession(token)) {
    redirect("/admin/login");
  }

  return (
    <PageShell variant="agent" title="Дерево 1С" hideNav>
      <div className="sticky top-0 z-30 border-b border-slate-200 bg-slate-100 safe-top">
        <div className="mx-auto max-w-lg px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Менеджер
          </p>
          <div className="mt-1 flex items-center justify-between gap-3">
            <h1 className="text-lg font-bold text-slate-900">Дерево 1С</h1>
            <div className="flex shrink-0 gap-2">
              <Link
                href="/admin"
                className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-slate-700 ring-1 ring-slate-200 active:bg-slate-50"
              >
                Панель
              </Link>
              <AdminLogoutButton />
            </div>
          </div>
        </div>
      </div>
      <AgentPlusTreeBrowser mode="admin" />
    </PageShell>
  );
}
