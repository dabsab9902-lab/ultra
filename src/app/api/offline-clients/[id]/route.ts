import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  isValidAdminSession,
} from "@/lib/server/admin-auth";
import { getAgentPlusOfflineClient } from "@/lib/server/agentplus-offline-clients-store";
import { readClients } from "@/lib/server/clients-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  if (!hasAdminSession(request)) return unauthorized();

  const { id } = await params;
  const offlineClient = await getAgentPlusOfflineClient(id);
  if (!offlineClient) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const onlineClients = await readClients();
  const onlineClient =
    onlineClients.find((client) => client.agentPlusClientId === id) ?? null;

  return NextResponse.json(
    {
      client: {
        ...offlineClient,
        status: onlineClient ? "online" : "offline",
        onlineClientId: onlineClient?.id,
      },
      onlineClient,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}

function hasAdminSession(request: NextRequest) {
  const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  return isValidAdminSession(token);
}

function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}
