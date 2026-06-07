import { mkdir, readFile, writeFile } from "fs/promises";
import { randomUUID } from "crypto";
import { dirname } from "path";
import { normalizeBrandName } from "@/lib/brand-detector";
import {
  CLIENT_DEMO_SESSION_COOKIE,
  parseClientDemoToken,
} from "@/lib/client-demo-session";
import { ensureRuntimeDataFile } from "@/lib/server/json-data-store";
import {
  normalizePhone,
  toPublicClient,
  type ClientDiscount,
  type ClientRecord,
  type PublicClient,
} from "@/lib/clients";

const CLIENTS_FILE_NAME = "clients.json";
const STORE_VERSION = 1;

interface StoredClientsFile {
  version: number;
  clients: ClientRecord[];
}

export const CLIENT_SESSION_COOKIE = "ultra-svet-client-session";
export { CLIENT_DEMO_SESSION_COOKIE };

export async function readClients(): Promise<ClientRecord[]> {
  const file = await readClientsFile();
  return file.clients
    .map(normalizeStoredClient)
    .filter((client): client is ClientRecord => Boolean(client))
    .sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

export async function createClient(input: unknown) {
  const value = asRecord(input);
  const now = new Date().toISOString();
  const client = normalizeStoredClient({
    id: createClientId(),
    name: value.name,
    phone: value.phone,
    code: value.code || value.password,
    active: value.active ?? true,
    agentPlusClientId: value.agentPlusClientId,
    managerComment: value.managerComment,
    discounts: value.discounts,
    createdAt: now,
    updatedAt: now,
  });

  if (!client?.name || !client.phone || !client.code) {
    throw new Error("invalid_client");
  }

  const clients = await readClients();
  if (clients.some((item) => normalizePhone(item.phone) === normalizePhone(client.phone))) {
    throw new Error("client_exists");
  }

  await writeClientsFile([client, ...clients]);
  return client;
}

export async function updateClient(id: string, input: unknown) {
  const clients = await readClients();
  const index = clients.findIndex((client) => client.id === id);
  if (index < 0) return null;

  const value = asRecord(input);
  const current = clients[index];
  const updated = normalizeStoredClient({
    ...current,
    name: value.name ?? current.name,
    phone: value.phone ?? current.phone,
    code: value.code || value.password || current.code,
    active: typeof value.active === "boolean" ? value.active : current.active,
    agentPlusClientId:
      firstString(value.agentPlusClientId) || current.agentPlusClientId,
    managerComment:
      typeof value.managerComment === "string"
        ? value.managerComment
        : current.managerComment,
    discounts: Array.isArray(value.discounts)
      ? value.discounts
      : current.discounts,
    updatedAt: new Date().toISOString(),
  });

  if (!updated?.name || !updated.phone || !updated.code) {
    throw new Error("invalid_client");
  }

  const phoneExists = clients.some(
    (client) =>
      client.id !== id &&
      normalizePhone(client.phone) === normalizePhone(updated.phone)
  );
  if (phoneExists) throw new Error("client_exists");

  const next = [...clients];
  next[index] = updated;
  await writeClientsFile(next);
  return updated;
}

export async function createOrLinkAgentPlusClient(input: {
  agentPlusClientId: string;
  name: string;
  login: string;
  code: string;
}) {
  const agentPlusClientId = firstString(input.agentPlusClientId);
  const name = firstString(input.name);
  const login = normalizePhone(firstString(input.login)) || firstString(input.login);
  const code = firstString(input.code);
  if (!agentPlusClientId || !name || !login || !code) {
    throw new Error("invalid_client");
  }

  const clients = await readClients();
  const linked = clients.find(
    (client) => client.agentPlusClientId === agentPlusClientId
  );
  if (linked) return { client: linked, created: false };

  const loginMatch = clients.find(
    (client) => normalizePhone(client.phone) === normalizePhone(login)
  );
  if (loginMatch) {
    const next = clients.map((client) =>
      client.id === loginMatch.id
        ? {
            ...client,
            agentPlusClientId,
            updatedAt: new Date().toISOString(),
          }
        : client
    );
    await writeClientsFile(next);
    return {
      client: next.find((client) => client.id === loginMatch.id) ?? loginMatch,
      created: false,
    };
  }

  const now = new Date().toISOString();
  const client = normalizeStoredClient({
    id: createClientId(),
    name,
    phone: login,
    code,
    active: true,
    agentPlusClientId,
    discounts: [],
    createdAt: now,
    updatedAt: now,
  });
  if (!client) throw new Error("invalid_client");

  await writeClientsFile([client, ...clients]);
  return { client, created: true };
}

export async function deleteClient(id: string) {
  const clients = await readClients();
  const next = clients.filter((client) => client.id !== id);
  if (next.length === clients.length) return false;
  await writeClientsFile(next);
  return true;
}

export async function verifyClientLogin(phone: string, code: string) {
  const normalizedPhone = normalizePhone(phone);
  const clients = await readClients();
  const client = clients.find(
    (item) =>
      item.active &&
      normalizePhone(item.phone) === normalizedPhone &&
      item.code === code.trim()
  );
  return client ? toPublicClient(client) : null;
}

export async function getClientBySessionToken(
  token?: string,
  demoToken?: string
): Promise<PublicClient | null> {
  if (token) {
    const clients = await readClients();
    const client = clients.find((item) => createClientSessionToken(item) === token);
    if (client?.active) return toPublicClient(client);
  }

  return parseClientDemoToken(demoToken);
}

export function createClientSessionToken(client: Pick<ClientRecord, "id" | "phone" | "code">) {
  const raw = `${client.id}:${normalizePhone(client.phone)}:${client.code}`;
  return Buffer.from(raw).toString("base64url");
}

export function getClientCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  };
}

function normalizeStoredClient(input: unknown): ClientRecord | null {
  const value = asRecord(input);
  const id = firstString(value.id);
  const name = firstString(value.name);
  const phone = normalizePhone(firstString(value.phone));
  const code = firstString(value.code, value.password);
  if (!id || !name || !phone || !code) return null;

  const now = new Date().toISOString();
  return {
    id,
    name,
    phone,
    code,
    active: typeof value.active === "boolean" ? value.active : true,
    agentPlusClientId: firstString(value.agentPlusClientId) || undefined,
    managerComment: firstString(value.managerComment) || undefined,
    discounts: normalizeDiscounts(value.discounts),
    createdAt: firstString(value.createdAt) || now,
    updatedAt: firstString(value.updatedAt) || now,
  };
}

function normalizeDiscounts(input: unknown): ClientDiscount[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const discounts: ClientDiscount[] = [];

  for (const item of input) {
    const value = asRecord(item);
    const brand = normalizeBrandName(firstString(value.brand));
    const percent = Number(value.percent);
    if (!brand || brand === "Без бренда" || !Number.isFinite(percent) || percent <= 0) {
      continue;
    }
    const key = brand.toLocaleLowerCase("ru");
    if (seen.has(key)) continue;
    seen.add(key);
    discounts.push({
      brand,
      percent: Math.min(99, Math.round(percent * 100) / 100),
    });
  }

  return discounts;
}

async function readClientsFile(): Promise<StoredClientsFile> {
  try {
    const filePath = await getClientsFilePath();
    const raw = await readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw) as StoredClientsFile | ClientRecord[];
    if (Array.isArray(parsed)) {
      return { version: STORE_VERSION, clients: parsed };
    }
    return {
      version: parsed.version ?? STORE_VERSION,
      clients: Array.isArray(parsed.clients) ? parsed.clients : [],
    };
  } catch {
    return { version: STORE_VERSION, clients: [] };
  }
}

async function writeClientsFile(clients: ClientRecord[]) {
  const filePath = await getClientsFilePath();
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(
    filePath,
    `${JSON.stringify({ version: STORE_VERSION, clients }, null, 2)}\n`,
    "utf-8"
  );
}

async function getClientsFilePath() {
  return ensureRuntimeDataFile(
    CLIENTS_FILE_NAME,
    `${JSON.stringify({ version: STORE_VERSION, clients: [] }, null, 2)}\n`
  );
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

function createClientId() {
  try {
    return `client-${randomUUID()}`;
  } catch {
    return `client-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}
