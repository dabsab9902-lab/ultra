import { normalizeBrandKey } from "@/lib/brand-detector";
import type { PublicClient } from "@/lib/clients";
import type { Product } from "@/lib/types";

export const BASE_PRICE_MULTIPLIER = 0.84;
export const BASE_PRICE_VERSION = `base-price-${BASE_PRICE_MULTIPLIER}`;

export function getBasePriceFromSitePrice(sitePrice: unknown) {
  const price = Number(sitePrice) || 0;
  return roundMoney(price * BASE_PRICE_MULTIPLIER);
}

export function getClientPrice(product: Product, client?: PublicClient | null) {
  const basePrice = Number(product.price) || 0;
  if (!client?.active) return roundMoney(basePrice);

  const brandKey = normalizeBrandKey(product.brand);
  const discount = client.discounts.find(
    (item) => normalizeBrandKey(item.brand) === brandKey
  );

  const percent = clampDiscount(discount?.percent);
  if (!percent) return roundMoney(basePrice);

  return roundMoney(basePrice * (1 - percent / 100));
}

export function applyClientPrice<T extends Product>(
  product: T,
  client?: PublicClient | null
): T {
  if (!client?.active) return product;
  const price = getClientPrice(product, client);
  if (price === product.price) return product;
  return {
    ...product,
    price,
  };
}

export function applyClientPrices<T extends Product>(
  products: T[],
  client?: PublicClient | null
) {
  if (!client?.active) return products;
  return products.map((product) => applyClientPrice(product, client));
}

export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function clampDiscount(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return Math.min(99, number);
}
