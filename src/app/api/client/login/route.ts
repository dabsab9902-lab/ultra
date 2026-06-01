import { NextRequest, NextResponse } from "next/server";
import {
  CLIENT_SESSION_COOKIE,
  createClientSessionToken,
  getClientCookieOptions,
  verifyClientLogin,
} from "@/lib/server/clients-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      phone?: unknown;
      code?: unknown;
      password?: unknown;
    };
    const phone = typeof body.phone === "string" ? body.phone : "";
    const code =
      typeof body.code === "string"
        ? body.code
        : typeof body.password === "string"
          ? body.password
          : "";

    const client = await verifyClientLogin(phone, code);
    if (!client) {
      return NextResponse.json({ error: "invalid_login" }, { status: 401 });
    }

    const response = NextResponse.json({
      client: {
        id: client.id,
        name: client.name,
        phone: client.phone,
      },
    });
    response.cookies.set(
      CLIENT_SESSION_COOKIE,
      createClientSessionToken({ ...client, code: code.trim() }),
      getClientCookieOptions()
    );
    return response;
  } catch {
    return NextResponse.json({ error: "invalid_login" }, { status: 401 });
  }
}
