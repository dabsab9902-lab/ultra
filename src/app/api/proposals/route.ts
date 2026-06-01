import { NextRequest, NextResponse } from "next/server";
import {
  PROPOSAL_STATUS_ACCEPTED,
  PROPOSAL_STATUS_REJECTED,
  isFinalProposalStatus,
  type CommercialProposal,
} from "@/lib/commercial-proposals";
import { normalizePhone } from "@/lib/clients";
import type { ManagerOrderItem } from "@/lib/manager-orders";
import {
  ADMIN_SESSION_COOKIE,
  isValidAdminSession,
} from "@/lib/server/admin-auth";
import {
  CLIENT_SESSION_COOKIE,
  getClientBySessionToken,
  readClients,
} from "@/lib/server/clients-store";
import { createManagerOrder } from "@/lib/server/orders-store";
import {
  appendProposalHistory,
  createCommercialProposal,
  filterProposalsForClient,
  isProposalForClient,
  markProposalViewed,
  mergeClientProposalItems,
  normalizeProposalItemsForClient,
  readCommercialProposals,
  updateCommercialProposal,
  updateProposalItemsFromClient,
} from "@/lib/server/proposals-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const isAdmin = hasAdminSession(request);
  const client = await getClientBySessionToken(
    request.cookies.get(CLIENT_SESSION_COOKIE)?.value
  );

  if (!isAdmin && !client) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const proposals = await readCommercialProposals();
  const clientId = request.nextUrl.searchParams.get("clientId");
  const visible = isAdmin
    ? clientId
      ? proposals.filter((proposal) => proposal.clientId === clientId)
      : proposals
    : filterProposalsForClient(proposals, client!);

  return NextResponse.json(
    { proposals: visible },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}

export async function POST(request: NextRequest) {
  if (!hasAdminSession(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const clients = await resolveClients(body);
    if (clients.length === 0) {
      return NextResponse.json({ error: "client_not_found" }, { status: 404 });
    }

    const proposals: CommercialProposal[] = [];
    for (const client of clients) {
      const items = normalizeProposalItemsForClient(body.items, client);
      if (items.length === 0) continue;

      const proposal = await createCommercialProposal({
        date: new Date().toISOString(),
        clientId: client.id,
        clientName: client.name,
        clientPhone: client.phone,
        customer: {
          name: client.name,
          phone: client.phone,
          comment: firstString(body.customerComment),
        },
        items,
        total: totalItems(items),
        managerComment: firstString(body.managerComment),
      });
      proposals.push(proposal);
    }

    if (proposals.length === 0) {
      return NextResponse.json({ error: "empty_proposal" }, { status: 400 });
    }

    return NextResponse.json(
      { proposal: proposals[0], proposals },
      { status: 201 }
    );
  } catch {
    return NextResponse.json({ error: "invalid_proposal" }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  const isAdmin = hasAdminSession(request);
  const client = await getClientBySessionToken(
    request.cookies.get(CLIENT_SESSION_COOKIE)?.value
  );

  if (!isAdmin && !client) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const id = firstString(body.id, body.proposalId);
    const action = firstString(body.action);
    if (!id || !action) {
      return NextResponse.json({ error: "invalid_action" }, { status: 400 });
    }

    const current = (await readCommercialProposals()).find(
      (proposal) => proposal.id === id || proposal.proposalId === id
    );
    if (!current) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (client && !isProposalForClient(current, client)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    if (action === "view" && client) {
      const proposal = await updateCommercialProposal(id, markProposalViewed);
      return NextResponse.json({ proposal });
    }

    if (action === "edit" && client) {
      if (isFinalProposalStatus(current.status)) {
        return NextResponse.json({ error: "proposal_closed" }, { status: 400 });
      }
      const items = mergeClientProposalItems(current.items, body.items);
      if (items.length === 0) {
        return NextResponse.json({ error: "empty_proposal" }, { status: 400 });
      }
      const clientComment = firstString(body.clientComment);
      const proposal = await updateCommercialProposal(id, (proposal) =>
        updateProposalItemsFromClient(proposal, items, clientComment)
      );
      return NextResponse.json({ proposal });
    }

    if (action === "accept" && client) {
      const order = await createOrderFromProposal(current);
      const proposal = await updateCommercialProposal(id, (proposal) =>
        appendProposalHistory(
          {
            ...proposal,
            status: PROPOSAL_STATUS_ACCEPTED,
            acceptedOrderId: order.orderId,
          },
          {
            actor: "client",
            action:
              "\u041a\u043b\u0438\u0435\u043d\u0442 \u043f\u0440\u0438\u043d\u044f\u043b \u043f\u0440\u0435\u0434\u043b\u043e\u0436\u0435\u043d\u0438\u0435",
            status: PROPOSAL_STATUS_ACCEPTED,
            clientComment: firstString(body.clientComment),
          }
        )
      );
      return NextResponse.json({ proposal, order });
    }

    if (action === "reject" && client) {
      const proposal = await updateCommercialProposal(id, (proposal) =>
        appendProposalHistory(
          {
            ...proposal,
            clientComment: firstString(body.clientComment) || proposal.clientComment,
          },
          {
            actor: "client",
            action:
              "\u041a\u043b\u0438\u0435\u043d\u0442 \u043e\u0442\u043a\u043b\u043e\u043d\u0438\u043b \u043f\u0440\u0435\u0434\u043b\u043e\u0436\u0435\u043d\u0438\u0435",
            status: PROPOSAL_STATUS_REJECTED,
            clientComment: firstString(body.clientComment),
          }
        )
      );
      return NextResponse.json({ proposal });
    }

    if (action === "convertToOrder" && isAdmin) {
      const order = await createOrderFromProposal(current);
      const proposal = await updateCommercialProposal(id, (proposal) =>
        appendProposalHistory(
          {
            ...proposal,
            status: PROPOSAL_STATUS_ACCEPTED,
            acceptedOrderId: order.orderId,
          },
          {
            actor: "manager",
            action:
              "\u041c\u0435\u043d\u0435\u0434\u0436\u0435\u0440 \u0441\u043e\u0437\u0434\u0430\u043b \u0437\u0430\u043a\u0430\u0437 \u0438\u0437 \u043f\u0440\u0435\u0434\u043b\u043e\u0436\u0435\u043d\u0438\u044f",
            status: PROPOSAL_STATUS_ACCEPTED,
          }
        )
      );
      return NextResponse.json({ proposal, order });
    }

    return NextResponse.json({ error: "forbidden_action" }, { status: 403 });
  } catch {
    return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  }
}

function hasAdminSession(request: NextRequest) {
  const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  return isValidAdminSession(token);
}

async function resolveClient(...ids: unknown[]) {
  const clients = await readClients();
  const values = ids.map(firstString).filter(Boolean);
  const phones = values.map(normalizePhone);
  return clients.find(
    (client) =>
      values.includes(client.id) ||
      values.includes(client.phone) ||
      phones.includes(normalizePhone(client.phone))
  );
}

async function resolveClients(body: Record<string, unknown>) {
  const clients = await readClients();

  if (body.allClients === true) {
    return clients.filter((client) => client.active);
  }

  const rawIds = Array.isArray(body.clientIds) ? body.clientIds : [];
  const ids = rawIds.map(firstString).filter(Boolean);
  if (ids.length > 0) {
    const phones = ids.map(normalizePhone);
    return clients.filter(
      (client) =>
        ids.includes(client.id) ||
        ids.includes(client.phone) ||
        phones.includes(normalizePhone(client.phone))
    );
  }

  const client = await resolveClient(body.clientId, body.clientPhone, body.phone);
  return client ? [client] : [];
}

async function createOrderFromProposal(proposal: {
  proposalId: string;
  date: string;
  clientId?: string;
  clientName?: string;
  clientPhone?: string;
  customer: { name: string; phone: string; comment?: string };
  items: ManagerOrderItem[];
  total: number;
}) {
  return createManagerOrder({
    orderId: `order-from-${proposal.proposalId}`,
    date: new Date().toISOString(),
    clientId: proposal.clientId,
    clientName: proposal.clientName,
    clientPhone: proposal.clientPhone,
    customer: {
      name: proposal.customer.name,
      phone: proposal.customer.phone,
      comment:
        proposal.customer.comment ||
        "\u0417\u0430\u043a\u0430\u0437 \u0438\u0437 \u043a\u043e\u043c\u043c\u0435\u0440\u0447\u0435\u0441\u043a\u043e\u0433\u043e \u043f\u0440\u0435\u0434\u043b\u043e\u0436\u0435\u043d\u0438\u044f",
    },
    items: proposal.items,
    total: proposal.total,
  });
}

function totalItems(items: ManagerOrderItem[]) {
  return Math.round(
    (items.reduce((sum, item) => sum + item.total, 0) + Number.EPSILON) * 100
  ) / 100;
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return "";
}
