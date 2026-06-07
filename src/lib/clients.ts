export interface ClientDiscount {
  brand: string;
  percent: number;
}

export interface ClientRecord {
  id: string;
  name: string;
  phone: string;
  code: string;
  active: boolean;
  agentPlusClientId?: string;
  managerComment?: string;
  discounts: ClientDiscount[];
  createdAt: string;
  updatedAt: string;
}

export interface PublicClient {
  id: string;
  name: string;
  phone: string;
  active: boolean;
  discounts: ClientDiscount[];
}

export function toPublicClient(client: ClientRecord): PublicClient {
  return {
    id: client.id,
    name: client.name,
    phone: client.phone,
    active: client.active,
    discounts: client.discounts,
  };
}

export function normalizePhone(value: string) {
  return value.replace(/[^\d+]/g, "").trim();
}
