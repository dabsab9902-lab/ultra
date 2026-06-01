import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { CartProvider } from "@/context/CartContext";
import { CustomerCabinetProvider } from "@/lib/customer-cabinet";
import { ClientPricingSessionSync } from "@/components/ClientPricingSessionSync";
import "./globals.css";

const inter = Inter({
  subsets: ["latin", "cyrillic"],
  variable: "--font-geist-sans",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://ultra-svet.com"),
  title: "Ultra Svet — B2B Каталог электротоваров",
  description:
    "Оптовый каталог электротоваров: кабели, автоматы, розетки, светильники. Быстрый заказ для бизнеса.",
  applicationName: "Ultra Svet",
  keywords: [
    "Ultra Svet",
    "B2B электротовары",
    "оптовый каталог",
    "кабель",
    "автоматы",
    "розетки",
    "светильники",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Ultra Svet — B2B Каталог электротоваров",
    description:
      "Быстрый мобильный каталог электротоваров для оптовых заказов.",
    type: "website",
    locale: "ru_RU",
    siteName: "Ultra Svet",
  },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Ultra Svet",
    startupImage: [
      {
        url: "/splash/apple-splash-1290-2796.png",
        media:
          "(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3)",
      },
      {
        url: "/splash/apple-splash-1179-2556.png",
        media:
          "(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3)",
      },
      {
        url: "/splash/apple-splash-1170-2532.png",
        media:
          "(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)",
      },
      {
        url: "/splash/apple-splash-1125-2436.png",
        media:
          "(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3)",
      },
    ],
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/icons/icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#0f172a" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body className={`${inter.variable} font-sans`}>
        <CartProvider>
          <CustomerCabinetProvider>
            <ClientPricingSessionSync />
            {children}
          </CustomerCabinetProvider>
        </CartProvider>
      </body>
    </html>
  );
}
