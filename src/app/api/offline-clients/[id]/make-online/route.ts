import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  isValidAdminSession,
} from "@/lib/server/admin-auth";
import { getAgentPlusOfflineClient } from "@/lib/server/agentplus-offline-clients-store";
import { createOrLinkAgentPlusClient } from "@/lib/server/clients-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  if (!hasAdminSession(request)) return unauthorized();

  const { id } = await params;
  const offlineClient = await getAgentPlusOfflineClient(id);
  if (!offlineClient) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  try {
    const login = buildLogin(offlineClient.phone, offlineClient.id);
    const { client, created } = await createOrLinkAgentPlusClient({
      agentPlusClientId: offlineClient.id,
      name: offlineClient.name,
      login,
      code: createAccessCode(),
    });

    return NextResponse.json({
      client,
      created,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "make_online_failed" },
      { status: 400 }
    );
  }
}

function buildLogin(phone: string | undefined, id: string) {
  if (phone?.trim()) return phone.trim();

  const digits = id.replace(/\D/g, "").slice(0, 9).padEnd(9, "0");
  return `900${digits}`;
}

function createAccessCode() {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const prefix = letters[Math.floor(Math.random() * letters.length)] ?? "U";
  return `${prefix}${Math.floor(1000 + Math.random() * 9000)}`;
}

function hasAdminSession(request: NextRequest) {
  const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  return isValidAdminSession(token);
}

function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}
