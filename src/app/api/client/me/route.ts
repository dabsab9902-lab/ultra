import { NextRequest, NextResponse } from "next/server";
import {
  CLIENT_DEMO_SESSION_COOKIE,
  CLIENT_SESSION_COOKIE,
  getClientBySessionToken,
} from "@/lib/server/clients-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const token = request.cookies.get(CLIENT_SESSION_COOKIE)?.value;
  const demoToken = request.cookies.get(CLIENT_DEMO_SESSION_COOKIE)?.value;
  const client = await getClientBySessionToken(token, demoToken);

  return NextResponse.json(
    {
      client: client
        ? {
            id: client.id,
            name: client.name,
            phone: client.phone,
            active: client.active,
            discounts: client.discounts,
          }
        : null,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
