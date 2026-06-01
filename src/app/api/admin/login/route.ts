import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  createAdminSessionToken,
  getAdminCookieOptions,
  verifyAdminCredentials,
} from "@/lib/server/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      login?: unknown;
      password?: unknown;
    };
    if (!verifyAdminCredentials(body.login, body.password)) {
      return NextResponse.json(
        { error: "invalid_credentials" },
        { status: 401 }
      );
    }

    const response = NextResponse.json(
      { ok: true },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
    response.cookies.set(
      ADMIN_SESSION_COOKIE,
      createAdminSessionToken(),
      getAdminCookieOptions()
    );
    return response;
  } catch {
    return NextResponse.json(
      { error: "invalid_credentials" },
      { status: 401 }
    );
  }
}
