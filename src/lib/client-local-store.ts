"use client";

import type { ClientRecord, PublicClient } from "@/lib/clients";
import { normalizePhone, toPublicClient } from "@/lib/clients";

const STORAGE_KEY = "ultra-svet-admin-clients:v1";

interface StoredClientsPayload {
  version: number;
  clients: ClientRecord[];
  savedAt: string;
}

export function readLocalClients(): ClientRecord[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<StoredClientsPayload> | ClientRecord[];
    const items = Array.isArray(parsed) ? parsed : parsed.clients;
    return normalizeClients(Array.isArray(items) ? items : []);
  } catch {
    return [];
  }
}

export function writeLocalClients(clients: ClientRecord[]) {
  if (typeof window === "undefined") return;

  const payload: StoredClientsPayload = {
    version: 1,
    clients: normalizeClients(clients),
    savedAt: new Date().toISOString(),
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota */
  }
}

export function mergeLocalClients(remoteClients: ClientRecord[]) {
  const localClients = readLocalClients();
  const merged = mergeClients(localClients, remoteClients);
  writeLocalClients(merged);
  return merged;
}

export function upsertLocalClient(client: ClientRecord) {
  const clients = readLocalClients();
  const normalized = normalizeClient(client);
  if (!normalized) return clients;

  const next = [
    normalized,
    ...clients.filter(
      (item) =>
        item.id !== normalized.id &&
        normalizePhone(item.phone) !== normalizePhone(normalized.phone) &&
        (!normalized.agentPlusClientId ||
          item.agentPlusClientId !== normalized.agentPlusClientId)
    ),
  ];
  writeLocalClients(next);
  return next;
}

export function findLocalClientByLogin(phone: string, code: string) {
  const normalizedPhone = normalizePhone(phone);
  const normalizedCode = code.trim();
  return (
    readLocalClients().find(
      (client) =>
        client.active &&
        normalizePhone(client.phone) === normalizedPhone &&
        client.code === normalizedCode
    ) ?? null
  );
}

export function toClientSession(client: ClientRecord): PublicClient {
  return toPublicClient(client);
}

export function createLocalClient(input: {
  name: string;
  phone: string;
  code: string;
  active: boolean;
  agentPlusClientId?: string;
  discounts?: ClientRecord["discounts"];
}) {
  const now = new Date().toISOString();
  const client = normalizeClient({
    id: createClientId(),
    name: input.name,
    phone: input.phone,
    code: input.code,
    active: input.active,
    agentPlusClientId: input.agentPlusClientId,
    discounts: input.discounts ?? [],
    createdAt: now,
    updatedAt: now,
  });
  if (!client) return null;
  upsertLocalClient(client);
  return client;
}

export function encodeClientAccess(client: ClientRecord) {
  return encodeURIComponent(encodeBase64Url(JSON.stringify(client)));
}

export function decodeClientAccess(value: string) {
  try {
    const client = normalizeClient(JSON.parse(decodeBase64Url(decodeURIComponent(value))));
    if (!client) return null;
    upsertLocalClient(client);
    return client;
  } catch {
    return null;
  }
}

function mergeClients(localClients: ClientRecord[], remoteClients: ClientRecord[]) {
  const map = new Map<string, ClientRecord>();

  for (const client of normalizeClients(remoteClients)) {
    map.set(clientKey(client), client);
  }
  for (const client of normalizeClients(localClients)) {
    map.set(clientKey(client), client);
  }

  return Array.from(map.values()).sort((a, b) =>
    a.name.localeCompare(b.name, "ru")
  );
}

function normalizeClients(clients: ClientRecord[]) {
  return clients
    .map(normalizeClient)
    .filter((client): client is ClientRecord => Boolean(client));
}

function normalizeClient(input: unknown): ClientRecord | null {
  const value = input && typeof input === "object"
    ? (input as Partial<ClientRecord>)
    : {};
  const id = firstString(value.id);
  const name = firstString(value.name);
  const phone = normalizePhone(firstString(value.phone));
  const code = firstString(value.code);
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
    discounts: Array.isArray(value.discounts)
      ? value.discounts
          .map((discount) => ({
            brand: firstString(discount.brand),
            percent: Number(discount.percent),
          }))
          .filter(
            (discount) =>
              discount.brand &&
              Number.isFinite(discount.percent) &&
              discount.percent > 0
          )
      : [],
    createdAt: firstString(value.createdAt) || now,
    updatedAt: firstString(value.updatedAt) || now,
  };
}

function clientKey(client: ClientRecord) {
  if (client.agentPlusClientId) return `agentplus:${client.agentPlusClientId}`;
  return normalizePhone(client.phone) || client.id;
}

function createClientId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `client-${crypto.randomUUID()}`;
  }
  return `client-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function firstString(value: unknown) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number") return String(value);
  return "";
}

function encodeBase64Url(value: string) {
  const bytes = new TextEncoder().encode(value);
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
