"use client";

import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const WARM_URLS = [
  "/",
  "/catalog",
  "/cart",
  "/api/products?limit=24",
  "/manifest.json",
  "/product-fallback.svg",
  "/images/placeholders/breakers.svg",
  "/images/placeholders/cables.svg",
  "/images/placeholders/lighting.svg",
  "/images/placeholders/sockets.svg",
  "/images/placeholders/switches.svg",
  "/images/placeholders/tools.svg",
];

export function InstallPrompt({
  hasBottomNav = false,
}: {
  hasBottomNav?: boolean;
}) {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    setIsOnline(navigator.onLine);

    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
    }

    const dismissedBefore = localStorage.getItem("pwa-install-dismissed");
    if (dismissedBefore) setDismissed(true);

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);

    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const warm = async () => {
      try {
        const registration = await navigator.serviceWorker.ready;
        if (!registration.active || !navigator.onLine) return;
        await Promise.allSettled(
          WARM_URLS.map((url) =>
            fetch(url, {
              credentials: "same-origin",
            })
          )
        );
      } catch {
        /* Service worker warmup is best-effort. */
      }
    };

    const id = window.setTimeout(warm, 1200);
    return () => window.clearTimeout(id);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") setIsInstalled(true);
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem("pwa-install-dismissed", "1");
  };

  const showInstall = !isInstalled && !dismissed && deferredPrompt;

  if (isOnline && !showInstall) return null;

  return (
    <div
      className={`fixed left-0 right-0 z-50 px-3 ${
        hasBottomNav
          ? "bottom-[calc(4rem+env(safe-area-inset-bottom,0px))]"
          : "bottom-[calc(0.75rem+env(safe-area-inset-bottom,0px))]"
      }`}
      role="status"
      aria-live="polite"
    >
      <div className="mx-auto flex max-w-lg items-center gap-2 rounded-lg bg-slate-900 px-3 py-2.5 text-white shadow-lg ring-1 ring-white/10">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white/10">
          {isOnline ? <InstallIcon /> : <OfflineIcon />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold">
            {isOnline ? "Установить Ultra Svet" : "Офлайн-режим"}
          </p>
          <p className="truncate text-[11px] text-slate-300">
            {isOnline
              ? "Быстрый запуск, каталог и фото в кэше"
              : "Показываем сохраненный каталог и изображения"}
          </p>
        </div>
        {showInstall && (
          <button
            type="button"
            onClick={handleInstall}
            className="shrink-0 rounded-md bg-brand-600 px-3 py-2 text-xs font-bold text-white active:bg-brand-700"
          >
            Добавить
          </button>
        )}
        {showInstall && (
          <button
            type="button"
            onClick={handleDismiss}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-lg leading-none text-slate-400 active:bg-white/10"
            aria-label="Скрыть"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}

function InstallIcon() {
  return (
    <svg
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 3v12m0 0 4-4m-4 4-4-4M5 19h14"
      />
    </svg>
  );
}

function OfflineIcon() {
  return (
    <svg
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 3l18 18M8.5 8.5a7.5 7.5 0 0 1 10.1 2.1M5.5 11.5a11 11 0 0 1 5-3.1m-2 7.1a5 5 0 0 1 7 0M12 19h.01"
      />
    </svg>
  );
}
