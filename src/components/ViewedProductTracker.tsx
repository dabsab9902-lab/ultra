"use client";

import { useEffect } from "react";
import { useCustomerCabinet } from "@/lib/customer-cabinet";

export function ViewedProductTracker({ productId }: { productId: string }) {
  const { addRecent } = useCustomerCabinet();

  useEffect(() => {
    addRecent(productId);
  }, [addRecent, productId]);

  return null;
}
