import { readFile } from "fs/promises";
import { join } from "path";
import type {
  AgentPlusOfflineClient,
  AgentPlusOfflineClientsFile,
} from "@/lib/agentplus-offline-clients";

const OFFLINE_CLIENTS_FILE = join(
  process.cwd(),
  "data",
  "agentplus-offline-clients.json"
);

export async function readAgentPlusOfflineClients(): Promise<
  AgentPlusOfflineClient[]
> {
  try {
    const raw = await readFile(OFFLINE_CLIENTS_FILE, "utf-8");
    const parsed = JSON.parse(raw) as Partial<AgentPlusOfflineClientsFile>;
    return Array.isArray(parsed.clients)
      ? parsed.clients
          .map(normalizeOfflineClient)
          .filter((client): client is AgentPlusOfflineClient => Boolean(client))
      : [];
  } catch {
    return [];
  }
}

export async function getAgentPlusOfflineClient(id: string) {
  const clients = await readAgentPlusOfflineClients();
  return clients.find((client) => client.id === id) ?? null;
}

function normalizeOfflineClient(
  input: AgentPlusOfflineClient
): AgentPlusOfflineClient | null {
  if (!input?.id || !input.name) return null;
  const phones = Array.isArray(input.phones)
    ? input.phones.map((phone) => String(phone).trim()).filter(Boolean)
    : [];

  return {
    id: String(input.id),
    name: String(input.name),
    legalName: input.legalName ? String(input.legalName) : undefined,
    phone: input.phone ? String(input.phone) : phones[0],
    phones,
    group: input.group ? String(input.group) : undefined,
    groupPath: Array.isArray(input.groupPath)
      ? input.groupPath.map((item) => String(item)).filter(Boolean)
      : [],
    contract: input.contract ? String(input.contract) : undefined,
    contracts: Array.isArray(input.contracts)
      ? input.contracts.map((item) => String(item)).filter(Boolean)
      : [],
    debt:
      typeof input.debt === "number" && Number.isFinite(input.debt)
        ? input.debt
        : undefined,
    debtDate: input.debtDate ? String(input.debtDate) : undefined,
  };
}
