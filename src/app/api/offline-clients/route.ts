import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  isValidAdminSession,
} from "@/lib/server/admin-auth";
import { readAgentPlusOfflineClients } from "@/lib/server/agentplus-offline-clients-store";
import { readClients } from "@/lib/server/clients-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!hasAdminSession(request)) return unauthorized();

  const [offlineClients, onlineClients] = await Promise.all([
    readAgentPlusOfflineClients(),
    readClients(),
  ]);
  const onlineByAgentPlusId = new Map(
    onlineClients
      .filter((client) => client.agentPlusClientId)
      .map((client) => [client.agentPlusClientId, client])
  );

  return NextResponse.json(
    {
      clients: offlineClients.map((client) => ({
        ...client,
        status: onlineByAgentPlusId.has(client.id) ? "online" : "offline",
        onlineClientId: onlineByAgentPlusId.get(client.id)?.id,
      })),
      total: offlineClients.length,
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
