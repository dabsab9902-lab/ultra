import { mkdir, readFile, writeFile } from "fs/promises";
import { randomUUID } from "crypto";
import { dirname } from "path";
import { catalog } from "@/lib/catalog";
import { ensureRuntimeDataFile } from "@/lib/server/json-data-store";
import {
  PROPOSAL_STATUS_CLIENT_CHANGED,
  PROPOSAL_STATUS_NEW,
  PROPOSAL_STATUS_VIEWED,
  isCommercialProposalStatus,
  type CommercialProposal,
  type CommercialProposalActor,
  type CommercialProposalHistoryEntry,
  type CommercialProposalStatus,
  type CommercialProposalsPayload,
} from "@/lib/commercial-proposals";
import type { ClientRecord } from "@/lib/clients";
import { normalizePhone, toPublicClient } from "@/lib/clients";
import type {
  ManagerOrderCustomer,
  ManagerOrderItem,
} from "@/lib/manager-orders";
import { applyClientPrice, roundMoney } from "@/lib/pricing";
import type { Product } from "@/lib/types";

const PROPOSALS_FILE_NAME = "proposals.json";
const STORE_VERSION = 1;

export async function readCommercialProposals(): Promise<CommercialProposal[]> {
  const file = await readProposalsFile();
  return file.proposals
    .map(normalizeStoredProposal)
    .filter((proposal): proposal is CommercialProposal => Boolean(proposal))
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

export async function createCommercialProposal(input: unknown) {
  const proposal = normalizeIncomingProposal(input);
  if (!proposal) throw new Error("invalid_proposal");

  const file = await readProposalsFile();
  const existingIndex = file.proposals.findIndex(
    (item) => item.id === proposal.id || item.proposalId === proposal.proposalId
  );

  if (existingIndex >= 0) {
    return file.proposals[existingIndex];
  }

  const next = [proposal, ...file.proposals];
  await writeProposalsFile(next);
  return proposal;
}

export async function updateCommercialProposal(
  id: string,
  updater: (proposal: CommercialProposal) => CommercialProposal
) {
  const file = await readProposalsFile();
  const proposals = file.proposals
    .map(normalizeStoredProposal)
    .filter((proposal): proposal is CommercialProposal => Boolean(proposal));
  const index = proposals.findIndex(
    (proposal) => proposal.id === id || proposal.proposalId === id
  );

  if (index < 0) return null;

  const updated = normalizeStoredProposal(updater(proposals[index]));
  if (!updated) throw new Error("invalid_proposal");

  const next = [...proposals];
  next[index] = updated;
  await writeProposalsFile(next);
  return updated;
}

export function filterProposalsForClient(
  proposals: CommercialProposal[],
  client: Pick<ClientRecord, "id" | "phone">
) {
  const clientPhone = normalizePhone(client.phone);
  return proposals.filter(
    (proposal) =>
      proposal.clientId === client.id ||
      normalizePhone(proposal.clientPhone ?? "") === clientPhone ||
      normalizePhone(proposal.customer.phone) === clientPhone
  );
}

export function isProposalForClient(
  proposal: CommercialProposal,
  client: Pick<ClientRecord, "id" | "phone">
) {
  return filterProposalsForClient([proposal], client).length === 1;
}

export function normalizeProposalItemsForClient(
  input: unknown,
  client: ClientRecord
): ManagerOrderItem[] {
  if (!Array.isArray(input)) return [];

  return input
    .map((item) => normalizeProposalItemForClient(item, client))
    .filter((item): item is ManagerOrderItem => Boolean(item));
}

export function mergeClientProposalItems(
  currentItems: ManagerOrderItem[],
  input: unknown
) {
  if (!Array.isArray(input)) return [];

  const currentByKey = new Map(
    currentItems.map((item) => [proposalItemKey(item), item])
  );
  const next: ManagerOrderItem[] = [];
  const seen = new Set<string>();

  for (const rawItem of input) {
    const value = asRecord(rawItem);
    const key = proposalItemKey({
      productId: firstString(value.productId),
      sku: firstString(value.sku, value.article),
      name: firstString(value.name),
    });
    const current = currentByKey.get(key);
    if (!current || seen.has(key)) continue;
    const quantity = positiveNumber(value.quantity) ?? current.quantity;
    if (quantity <= 0) continue;

    const item = {
      ...current,
      quantity,
      total: roundMoney(current.price * quantity),
    };
    next.push(item);
    seen.add(key);
  }

  return next;
}

export function appendProposalHistory(
  proposal: CommercialProposal,
  {
    actor,
    action,
    status,
    managerComment,
    clientComment,
    changes,
    date = new Date().toISOString(),
  }: {
    actor: CommercialProposalActor;
    action: string;
    status?: CommercialProposalStatus;
    managerComment?: string;
    clientComment?: string;
    changes?: string[];
    date?: string;
  }
): CommercialProposal {
  const nextStatus = status ?? proposal.status;
  const entry: CommercialProposalHistoryEntry = {
    id: createHistoryId(),
    date,
    actor,
    action,
    status: nextStatus,
    items: proposal.items,
    total: proposal.total,
    managerComment: managerComment?.trim() || proposal.managerComment,
    clientComment: clientComment?.trim() || proposal.clientComment,
    changes: changes?.filter(Boolean),
  };

  return {
    ...proposal,
    status: nextStatus,
    history: [entry, ...proposal.history],
    updatedAt: date,
  };
}

export function describeProposalItemChanges(
  before: ManagerOrderItem[],
  after: ManagerOrderItem[]
) {
  const changes: string[] = [];
  const beforeByKey = new Map(before.map((item) => [proposalItemKey(item), item]));
  const afterByKey = new Map(after.map((item) => [proposalItemKey(item), item]));

  for (const [key, previous] of beforeByKey) {
    const next = afterByKey.get(key);
    if (!next) {
      changes.push(
        `${"\u0423\u0434\u0430\u043b\u0435\u043d\u043e"}: ${proposalItemLabel(previous)}`
      );
      continue;
    }
    if (previous.quantity !== next.quantity) {
      changes.push(
        `${"\u041a\u043e\u043b-\u0432\u043e"} ${proposalItemLabel(previous)}: ${previous.quantity} -> ${next.quantity}`
      );
    }
  }

  for (const [key, next] of afterByKey) {
    if (beforeByKey.has(key)) continue;
    changes.push(
      `${"\u0414\u043e\u0431\u0430\u0432\u043b\u0435\u043d\u043e"}: ${proposalItemLabel(next)}`
    );
  }

  return changes.length > 0
    ? changes
    : ["\u0421\u043e\u0441\u0442\u0430\u0432 \u0431\u0435\u0437 \u0438\u0437\u043c\u0435\u043d\u0435\u043d\u0438\u0439"];
}

export function markProposalViewed(proposal: CommercialProposal) {
  if (proposal.status !== PROPOSAL_STATUS_NEW) return proposal;
  const now = new Date().toISOString();
  return appendProposalHistory(
    {
      ...proposal,
      viewedAt: now,
    },
    {
      actor: "client",
      action: "\u041a\u043b\u0438\u0435\u043d\u0442 \u043f\u0440\u043e\u0441\u043c\u043e\u0442\u0440\u0435\u043b \u043f\u0440\u0435\u0434\u043b\u043e\u0436\u0435\u043d\u0438\u0435",
      status: PROPOSAL_STATUS_VIEWED,
      date: now,
    }
  );
}

export function updateProposalItemsFromClient(
  proposal: CommercialProposal,
  items: ManagerOrderItem[],
  clientComment: string
) {
  const now = new Date().toISOString();
  const total = roundMoney(items.reduce((sum, item) => sum + item.total, 0));
  const changes = describeProposalItemChanges(proposal.items, items);
  return appendProposalHistory(
    {
      ...proposal,
      items,
      total,
      clientComment: clientComment.trim() || undefined,
      changeSummary: changes,
      updatedAt: now,
    },
    {
      actor: "client",
      action: "\u041a\u043b\u0438\u0435\u043d\u0442 \u0438\u0437\u043c\u0435\u043d\u0438\u043b \u043f\u0440\u0435\u0434\u043b\u043e\u0436\u0435\u043d\u0438\u0435",
      status: PROPOSAL_STATUS_CLIENT_CHANGED,
      clientComment,
      changes,
      date: now,
    }
  );
}

function normalizeIncomingProposal(input: unknown): CommercialProposal | null {
  const value = asRecord(input);
  const now = new Date().toISOString();
  const proposalId =
    firstString(value.proposalId, value.id) || createProposalId();
  const customer = normalizeCustomer(value.customer);
  const items = Array.isArray(value.items)
    ? value.items
        .map(normalizeItem)
        .filter((item): item is ManagerOrderItem => Boolean(item))
    : [];

  if (!customer.name || !customer.phone || items.length === 0) return null;

  const total =
    positiveNumber(value.total) ??
    roundMoney(items.reduce((sum, item) => sum + item.total, 0));
  const date = firstString(value.date, value.savedAt, value.createdAt) || now;
  const status = isCommercialProposalStatus(value.status)
    ? value.status
    : PROPOSAL_STATUS_NEW;
  const managerComment = firstString(value.managerComment);
  const clientComment = firstString(value.clientComment);
  const proposal: CommercialProposal = {
    id: proposalId,
    proposalId,
    date,
    clientId: firstString(value.clientId) || undefined,
    clientName: firstString(value.clientName) || undefined,
    clientPhone: firstString(value.clientPhone) || undefined,
    customer,
    items,
    total,
    status,
    managerComment: managerComment || undefined,
    clientComment: clientComment || undefined,
    changeSummary: normalizeStringArray(value.changeSummary),
    history: [],
    acceptedOrderId: firstString(value.acceptedOrderId) || undefined,
    viewedAt: firstString(value.viewedAt) || undefined,
    createdAt: firstString(value.createdAt) || now,
    updatedAt: firstString(value.updatedAt) || now,
  };

  const history = normalizeHistory(value.history);
  proposal.history =
    history.length > 0
      ? history
      : [
          {
            id: createHistoryId(),
            date,
            actor: "manager",
            action:
              "\u041c\u0435\u043d\u0435\u0434\u0436\u0435\u0440 \u0441\u043e\u0437\u0434\u0430\u043b \u043f\u0440\u0435\u0434\u043b\u043e\u0436\u0435\u043d\u0438\u0435",
            status,
            items,
            total,
            managerComment: managerComment || undefined,
            clientComment: clientComment || undefined,
          },
        ];

  return proposal;
}

function normalizeStoredProposal(input: unknown): CommercialProposal | null {
  return normalizeIncomingProposal(input);
}

function normalizeProposalItemForClient(
  input: unknown,
  client: ClientRecord
): ManagerOrderItem | null {
  const value = asRecord(input);
  const quantity = positiveNumber(value.quantity) ?? 0;
  if (quantity <= 0) return null;

  const product = findProductForItem(value);
  if (product) {
    const priced = applyClientPrice(product, toPublicClient(client));
    return {
      productId: product.id,
      sku: product.sku,
      name: product.name,
      quantity,
      unit: product.unit || "\u0448\u0442",
      price: priced.price,
      total: roundMoney(priced.price * quantity),
    };
  }

  const sku = firstString(value.sku, value.article);
  const name = firstString(value.name, value.title);
  const price = positiveNumber(value.price) ?? 0;
  if (!sku && !name) return null;

  return {
    productId: firstString(value.productId) || undefined,
    sku: sku || name,
    name: name || sku,
    quantity,
    unit: firstString(value.unit) || "\u0448\u0442",
    price,
    total: roundMoney(price * quantity),
  };
}

function findProductForItem(value: Record<string, unknown>): Product | undefined {
  const productId = firstString(value.productId, value.id);
  if (productId) {
    const byId = catalog.getById(productId);
    if (byId) return byId;
  }

  const sku = firstString(value.sku, value.article);
  if (sku) {
    const matches = catalog.query({ q: sku, limit: 10, includeFilters: false }).items;
    return matches.find((product) => product.sku === sku) ?? matches[0];
  }

  const name = firstString(value.name, value.title);
  if (name) {
    return catalog.query({ q: name, limit: 1, includeFilters: false }).items[0];
  }

  return undefined;
}

function normalizeCustomer(input: unknown): ManagerOrderCustomer {
  const value = asRecord(input);
  return {
    name: firstString(value.name),
    phone: firstString(value.phone),
    comment: firstString(value.comment) || undefined,
  };
}

function normalizeItem(input: unknown): ManagerOrderItem | null {
  const value = asRecord(input);
  const sku = firstString(value.sku, value.article);
  const name = firstString(value.name, value.title);
  const quantity = positiveNumber(value.quantity) ?? 0;
  const price = positiveNumber(value.price) ?? 0;
  const total = positiveNumber(value.total) ?? roundMoney(price * quantity);

  if ((!sku && !name) || quantity <= 0) return null;

  return {
    productId: firstString(value.productId, value.id) || undefined,
    sku: sku || "\u0411\u0435\u0437 \u0430\u0440\u0442\u0438\u043a\u0443\u043b\u0430",
    name: name || sku || "\u0422\u043e\u0432\u0430\u0440",
    quantity,
    unit: firstString(value.unit) || "\u0448\u0442",
    price,
    total,
  };
}

function normalizeHistory(input: unknown): CommercialProposalHistoryEntry[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((entry) => {
      const value = asRecord(entry);
      const items = Array.isArray(value.items)
        ? value.items
            .map(normalizeItem)
            .filter((item): item is ManagerOrderItem => Boolean(item))
        : [];
      const status = isCommercialProposalStatus(value.status)
        ? value.status
        : PROPOSAL_STATUS_NEW;
      const total =
        positiveNumber(value.total) ??
        roundMoney(items.reduce((sum, item) => sum + item.total, 0));
      return {
        id: firstString(value.id) || createHistoryId(),
        date: firstString(value.date, value.createdAt) || new Date().toISOString(),
        actor: normalizeActor(value.actor),
        action: firstString(value.action) || "\u0418\u0437\u043c\u0435\u043d\u0435\u043d\u0438\u0435",
        status,
        items,
        total,
        managerComment: firstString(value.managerComment) || undefined,
        clientComment: firstString(value.clientComment) || undefined,
        changes: normalizeStringArray(value.changes),
      };
    })
    .filter((entry) => entry.items.length > 0 || entry.action);
}

async function readProposalsFile(): Promise<CommercialProposalsPayload> {
  try {
    const filePath = await getProposalsFilePath();
    const raw = await readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw) as CommercialProposalsPayload | CommercialProposal[];
    if (Array.isArray(parsed)) {
      return { version: STORE_VERSION, proposals: parsed };
    }
    return {
      version: parsed.version ?? STORE_VERSION,
      proposals: Array.isArray(parsed.proposals) ? parsed.proposals : [],
    };
  } catch {
    return { version: STORE_VERSION, proposals: [] };
  }
}

async function writeProposalsFile(proposals: CommercialProposal[]) {
  const filePath = await getProposalsFilePath();
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(
    filePath,
    `${JSON.stringify({ version: STORE_VERSION, proposals }, null, 2)}\n`,
    "utf-8"
  );
}

async function getProposalsFilePath() {
  return ensureRuntimeDataFile(
    PROPOSALS_FILE_NAME,
    `${JSON.stringify({ version: STORE_VERSION, proposals: [] }, null, 2)}\n`
  );
}

function proposalItemKey(item: Pick<ManagerOrderItem, "productId" | "sku" | "name">) {
  return firstString(item.productId, item.sku, item.name)
    .toLocaleLowerCase("ru")
    .trim();
}

function proposalItemLabel(item: ManagerOrderItem) {
  return item.sku ? `${item.sku} ${item.name}`.trim() : item.name;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return "";
}

function positiveNumber(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return undefined;
  return Math.max(0, number);
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const items = value
    .map((item) => firstString(item))
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
}

function normalizeActor(value: unknown): CommercialProposalActor {
  return value === "client" || value === "system" ? value : "manager";
}

function createProposalId() {
  try {
    return `proposal-${randomUUID()}`;
  } catch {
    return `proposal-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

function createHistoryId() {
  try {
    return `proposal-history-${randomUUID()}`;
  } catch {
    return `proposal-history-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}
