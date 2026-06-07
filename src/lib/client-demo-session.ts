import type { PublicClient } from "@/lib/clients";

export const CLIENT_DEMO_SESSION_COOKIE = "ultra-svet-client-demo-session";

export interface ClientDemoPayload extends PublicClient {
  issuedAt?: string;
}

export function createClientDemoToken(client: PublicClient) {
  return encodeBase64Url(
    JSON.stringify({
      id: client.id,
      name: client.name,
      phone: client.phone,
      active: client.active,
      discounts: client.discounts,
      issuedAt: new Date().toISOString(),
    } satisfies ClientDemoPayload)
  );
}

export function parseClientDemoToken(token?: string | null): PublicClient | null {
  if (!token) return null;

  try {
    const value = JSON.parse(decodeBase64Url(token)) as Partial<ClientDemoPayload>;
    if (!value.id || !value.name || !value.phone || value.active === false) {
      return null;
    }

    return {
      id: String(value.id),
      name: String(value.name),
      phone: String(value.phone),
      active: true,
      discounts: Array.isArray(value.discounts)
        ? value.discounts
            .map((discount) => ({
              brand: String(discount?.brand ?? "").trim(),
              percent: Number(discount?.percent),
            }))
            .filter(
              (discount) =>
                discount.brand &&
                Number.isFinite(discount.percent) &&
                discount.percent > 0
            )
        : [],
    };
  } catch {
    return null;
  }
}

function encodeBase64Url(value: string) {
  const base64 =
    typeof Buffer !== "undefined"
      ? Buffer.from(value, "utf-8").toString("base64")
      : btoa(String.fromCharCode(...new TextEncoder().encode(value)));

  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");

  if (typeof Buffer !== "undefined") {
    return Buffer.from(padded, "base64").toString("utf-8");
  }

  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
