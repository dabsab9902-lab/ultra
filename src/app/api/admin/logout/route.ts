import { NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  getAdminCookieOptions,
} from "@/lib/server/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const response = NextResponse.json(
    { ok: true },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
  response.cookies.set(ADMIN_SESSION_COOKIE, "", {
    ...getAdminCookieOptions(),
    maxAge: 0,
  });
  return response;
}
