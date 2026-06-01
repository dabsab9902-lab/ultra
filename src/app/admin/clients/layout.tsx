import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  ADMIN_SESSION_COOKIE,
  isValidAdminSession,
} from "@/lib/server/admin-auth";

export default async function AdminClientsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;

  if (!isValidAdminSession(token)) {
    redirect("/admin/login");
  }

  return children;
}
