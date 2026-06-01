export const CLIENT_PRICING_EVENT = "ultra-svet-client-pricing-updated";
const CLIENT_PRICING_STORAGE_KEY = "ultra-svet-client-pricing-active";
const CLIENT_SESSION_STORAGE_KEY = "ultra-svet-client-session";

export interface ClientSessionSummary {
  id: string;
  name: string;
  phone: string;
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
    };
  } catch {
    return null;
  }
}

export function setClientSession(client: ClientSessionSummary | null) {
  if (typeof window === "undefined") return;

  if (client) {
    localStorage.setItem(CLIENT_SESSION_STORAGE_KEY, JSON.stringify(client));
  } else {
    localStorage.removeItem(CLIENT_SESSION_STORAGE_KEY);
  }

  setClientPricingActive(Boolean(client));
}

export function appendClientPricingCacheBuster(url: string) {
  if (!isClientPricingActive()) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}_clientPricing=${Date.now()}`;
}
