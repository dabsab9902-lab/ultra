import { NextRequest, NextResponse } from "next/server";
import { isOrderStatus } from "@/lib/manager-orders";
import {
  ADMIN_SESSION_COOKIE,
  isValidAdminSession,
} from "@/lib/server/admin-auth";
import {
  CLIENT_SESSION_COOKIE,
  getClientBySessionToken,
} from "@/lib/server/clients-store";
import {
  createManagerOrder,
  readManagerOrders,
  updateManagerOrderStatus,
} from "@/lib/server/orders-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!hasAdminSession(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const orders = await readManagerOrders();
  return NextResponse.json(
    { orders },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const client = await getClientBySessionToken(
      request.cookies.get(CLIENT_SESSION_COOKIE)?.value
    );
    const payload = client
      ? {
          ...body,
          clientId: client.id,
          clientName: client.name,
          clientPhone: client.phone,
        }
      : body;
    const order = await createManagerOrder(payload);
    return NextResponse.json({ order }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "invalid_order" },
      { status: 400 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  if (!hasAdminSession(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      id?: unknown;
      orderId?: unknown;
      status?: unknown;
    };
    const id = typeof body.id === "string" ? body.id : body.orderId;
    if (typeof id !== "string" || !isOrderStatus(body.status)) {
      return NextResponse.json(
        { error: "invalid_status_update" },
        { status: 400 }
      );
    }

    const order = await updateManagerOrderStatus(id, body.status);
    if (!order) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    return NextResponse.json({ order });
  } catch {
    return NextResponse.json(
      { error: "invalid_status_update" },
      { status: 400 }
    );
  }
}

function hasAdminSession(request: NextRequest) {
  const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  return isValidAdminSession(token);
}
