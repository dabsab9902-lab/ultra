"use client";

import { useRouter } from "next/navigation";
import { clearAdminSession } from "@/lib/admin-session";

export function AdminLogoutButton() {
  const router = useRouter();

  const logout = async () => {
    try {
      await fetch("/api/admin/logout", { method: "POST" });
    } finally {
      clearAdminSession();
      router.replace("/admin/login");
      router.refresh();
    }
  };

  return (
    <button
      type="button"
      onClick={logout}
      className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-white active:bg-slate-700"
    >
      {"\u0412\u044b\u0439\u0442\u0438"}
    </button>
  );
}
