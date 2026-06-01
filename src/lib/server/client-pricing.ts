import type { NextRequest } from "next/server";
import {
  CLIENT_SESSION_COOKIE,
  getClientBySessionToken,
} from "@/lib/server/clients-store";
import { applyClientPrice, applyClientPrices } from "@/lib/pricing";
import type { Product } from "@/lib/types";

export async function getClientFromRequest(request: NextRequest) {
  const token = request.cookies.get(CLIENT_SESSION_COOKIE)?.value;
  return getClientBySessionToken(token);
}

export async function getClientFromToken(token?: string) {
  return getClientBySessionToken(token);
}

export async function priceProductForRequest<T extends Product>(
  product: T,
  request: NextRequest
) {
  const client = await getClientFromRequest(request);
  return applyClientPrice(product, client);
}

export async function priceProductsForRequest<T extends Product>(
  products: T[],
  request: NextRequest
) {
  const client = await getClientFromRequest(request);
  return applyClientPrices(products, client);
}
