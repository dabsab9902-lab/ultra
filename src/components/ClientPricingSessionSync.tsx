"use client";

import { useEffect } from "react";
import {
  getClientSession,
  setClientSession,
} from "@/lib/client-pricing-session";

export function ClientPricingSessionSync() {
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch("/api/client/me", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as {
          client?: { id?: string; name?: string; phone?: string } | null;
        };
        if (cancelled) return;

        const client =
          data.client?.id && data.client.name && data.client.phone
            ? {
                id: data.client.id,
                name: data.client.name,
                phone: data.client.phone,
              }
            : null;
        const current = getClientSession();
        if (
          current?.id !== client?.id ||
          current?.name !== client?.name ||
          current?.phone !== client?.phone
        ) {
          setClientSession(client);
        }
      } catch {
        /* Session sync is best-effort; product APIs still validate cookies. */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
