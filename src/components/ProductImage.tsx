"use client";

import Image from "next/image";
import { useState } from "react";
import {
  getProductImageVariant,
  isUltraSvetImage,
  PRODUCT_IMAGE_FALLBACK,
  resolveProductImageUrl,
} from "@/lib/product-image";
import type { Product } from "@/lib/types";

interface ProductImageProps {
  product: Pick<Product, "image" | "categoryId" | "name"> & {
    imageUrl?: string;
  };
  size?: "card" | "detail" | "thumb" | "list";
  className?: string;
  priority?: boolean;
}

const SIZE_CLASS = {
  card: "h-36 w-full",
  detail: "h-[64vw] min-h-[260px] max-h-[380px] w-full",
  thumb: "h-24 w-24 shrink-0",
  list: "h-14 w-14 shrink-0 rounded-md",
} as const;

const IMAGE_CLASS = {
  card: "object-cover",
  detail: "object-contain p-3",
  thumb: "object-cover",
  list: "object-contain p-1",
} as const;

export function ProductImage({
  product,
  size = "card",
  className = "",
  priority = false,
}: ProductImageProps) {
  const [error, setError] = useState(false);
  const resolved = resolveProductImageUrl(product);
  const imageUrl = getProductImageVariant(resolved, size);
  const height = SIZE_CLASS[size];
  const showFallback = error || !imageUrl;

  if (showFallback) {
    return (
      <div
        className={`relative flex items-center justify-center overflow-hidden bg-gradient-to-br from-slate-50 to-slate-100 ${height} ${className}`}
      >
        <Image
          src={PRODUCT_IMAGE_FALLBACK}
          alt=""
          width={size === "list" ? 56 : 120}
          height={size === "list" ? 56 : 120}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          className="opacity-90 object-contain p-2"
          aria-hidden
        />
      </div>
    );
  }

  return (
    <div
      className={`relative overflow-hidden bg-slate-50 ${height} ${className}`}
    >
      <Image
        src={imageUrl}
        alt={product.name}
        fill
        loading={priority ? "eager" : "lazy"}
        priority={priority}
        quality={size === "detail" ? 85 : 48}
        decoding="async"
        className={IMAGE_CLASS[size]}
        sizes={
          size === "detail"
            ? "100vw"
            : size === "list"
              ? "56px"
              : "(max-width: 512px) 50vw, 256px"
        }
        unoptimized={isUltraSvetImage(imageUrl)}
        onError={() => setError(true)}
      />
    </div>
  );
}
