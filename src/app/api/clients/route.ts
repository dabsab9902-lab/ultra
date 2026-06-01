import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  isValidAdminSession,
} from "@/lib/server/admin-auth";
import {
  createClient,
  deleteClient,
  readClients,
  updateClient,
} from "@/lib/server/clients-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!hasAdminSession(request)) return unauthorized();
  const clients = await readClients();
  return NextResponse.json({ clients });
}

export async function POST(request: NextRequest) {
  if (!hasAdminSession(request)) return unauthorized();

  try {
    const client = await createClient(await request.json());
    return NextResponse.json({ client }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "invalid_client" },
      { status: 400 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  if (!hasAdminSession(request)) return unauthorized();

  try {
    const body = (await request.json()) as { id?: unknown };
    if (typeof body.id !== "string") {
      return NextResponse.json({ error: "invalid_client" }, { status: 400 });
    }

    const client = await updateClient(body.id, body);
    if (!client) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ client });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "invalid_client" },
      { status: 400 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  if (!hasAdminSession(request)) return unauthorized();

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "invalid_client" }, { status: 400 });

  const deleted = await deleteClient(id);
  if (!deleted) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

function hasAdminSession(request: NextRequest) {
  const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  return isValidAdminSession(token);
}

function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}
