import {
  CLIENT_DEMO_SESSION_COOKIE,
  createClientDemoToken,
} from "@/lib/client-demo-session";
import type { ClientDiscount } from "@/lib/clients";

export const CLIENT_PRICING_EVENT = "ultra-svet-client-pricing-updated";
const CLIENT_PRICING_STORAGE_KEY = "ultra-svet-client-pricing-active";
const CLIENT_SESSION_STORAGE_KEY = "ultra-svet-client-session";

export interface ClientSessionSummary {
  id: string;
  name: string;
  phone: string;
  active?: boolean;
  discounts?: ClientDiscount[];
}

export function isClientPricingActive() {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(CLIENT_PRICING_STORAGE_KEY) === "1";
}

export function setClientPricingActive(active: boolean) {
  if (typeof window === "undefined") return;

  if (active) {
    localStorage.setItem(CLIENT_PRICING_STORAGE_KEY, "1");
  } else {
    localStorage.removeItem(CLIENT_PRICING_STORAGE_KEY);
  }

  window.dispatchEvent(new Event(CLIENT_PRICING_EVENT));
}

export function getClientSession(): ClientSessionSummary | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = localStorage.getItem(CLIENT_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<ClientSessionSummary>;
    if (!value.id || !value.name || !value.phone) return null;
    return {
      id: value.id,
      name: value.name,
      phone: value.phone,
      active: value.active !== false,
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

export function setClientSession(client: ClientSessionSummary | null) {
  if (typeof window === "undefined") return;

  if (client) {
    localStorage.setItem(CLIENT_SESSION_STORAGE_KEY, JSON.stringify(client));
    setDemoClientCookie(client);
  } else {
    localStorage.removeItem(CLIENT_SESSION_STORAGE_KEY);
    clearDemoClientCookie();
  }

  setClientPricingActive(Boolean(client));
}

export function appendClientPricingCacheBuster(url: string) {
  if (!isClientPricingActive()) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}_clientPricing=${Date.now()}`;
}

function setDemoClientCookie(client: ClientSessionSummary) {
  const token = createClientDemoToken({
    id: client.id,
    name: client.name,
    phone: client.phone,
    active: client.active !== false,
    discounts: client.discounts ?? [],
  });
  document.cookie = `${CLIENT_DEMO_SESSION_COOKIE}=${token}; Path=/; Max-Age=${
    60 * 60 * 24 * 30
  }; SameSite=Lax`;
}

function clearDemoClientCookie() {
  document.cookie = `${CLIENT_DEMO_SESSION_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}
