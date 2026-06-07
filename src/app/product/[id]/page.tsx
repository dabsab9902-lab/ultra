import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { AddToCartButton } from "@/components/AddToCartButton";
import { FavoriteButton } from "@/components/FavoriteButton";
import { ProductImage } from "@/components/ProductImage";
import { ProductNote } from "@/components/ProductNote";
import {
  ProductRecommendationStrip,
  type RecommendationDisplayItem,
} from "@/components/ProductRecommendationStrip";
import { StockBadge } from "@/components/StockBadge";
import { ViewedProductTracker } from "@/components/ViewedProductTracker";
import {
  OrderedProductBadge,
  OrderedProductSurface,
} from "@/components/OrderedProductBadge";
import { catalog } from "@/lib/catalog";
import { formatPrice } from "@/lib/format";
import { getProductExplanation } from "@/lib/product-explanations";
import {
  getProductAnalogSegments,
  getRelatedProducts,
} from "@/lib/server/product-recommendations";
import {
  CLIENT_DEMO_SESSION_COOKIE,
  CLIENT_SESSION_COOKIE,
} from "@/lib/server/clients-store";
import { getClientFromToken } from "@/lib/server/client-pricing";
import { applyClientPrice, applyClientPrices } from "@/lib/pricing";

export const dynamic = "force-dynamic";

interface ProductPageProps {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ from?: string | string[] }>;
}

export async function generateMetadata({
  params,
}: ProductPageProps): Promise<Metadata> {
  const { id } = await params;
  const product = catalog.getById(id);

  if (!product) {
    return {
      title: "Товар не найден — Ultra Svet",
      robots: { index: false, follow: false },
    };
  }

  return {
    title: `${product.sku} — ${product.name}`,
    description: `${product.name}. Цена ${formatPrice(product.price)}, остаток ${product.stock} ${product.unit}.`,
    alternates: {
      canonical: `/product/${product.id}`,
    },
    openGraph: {
      title: `${product.sku} — Ultra Svet`,
      description: product.name,
      type: "website",
      images: product.image ? [{ url: product.image }] : undefined,
    },
  };
}

export default async function ProductPage({
  params,
  searchParams,
}: ProductPageProps) {
  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const baseProduct = catalog.getById(id);

  if (!baseProduct) notFound();

  const cookieStore = await cookies();
  const client = await getClientFromToken(
    cookieStore.get(CLIENT_SESSION_COOKIE)?.value,
    cookieStore.get(CLIENT_DEMO_SESSION_COOKIE)?.value
  );
  const product = applyClientPrice(baseProduct, client);
  const productExplanation = getProductExplanation(product);
  const relatedProducts = applyClientPrices(
    getRelatedProducts([baseProduct], { limit: 8 }),
    client
  );
  const analogSegments: RecommendationDisplayItem[] = getProductAnalogSegments(
    baseProduct
  ).map((segment) => ({
    ...segment,
    product: applyClientPrice(segment.product, client),
  }));

  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    sku: product.sku,
    image: product.image || undefined,
    description: productExplanation,
    category: `${product.categoryId} / ${product.subcategory}`,
    offers: {
      "@type": "Offer",
      priceCurrency: "UAH",
      price: product.price,
      availability:
        product.stock > 0
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
    },
  };
  const backHref = getCatalogBackHref(resolvedSearchParams.from);

  return (
    <PageShell variant="agent" title="Артикул">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
      />
      <ViewedProductTracker productId={product.id} />
      <div className="px-3 pt-2">
        <Link
          href={backHref}
          scroll={false}
          className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-600"
        >
          ← К подбору
        </Link>

        <OrderedProductSurface
          product={product}
          className="overflow-hidden rounded-lg"
          defaultClassName="bg-white ring-1 ring-slate-200"
          orderedClassName="bg-emerald-50/80 ring-1 ring-emerald-200"
        >
          <div className="relative">
            <ProductImage product={product} size="detail" priority />
            <FavoriteButton
              productId={product.id}
              className="absolute right-3 top-3 bg-white/95 shadow-sm"
            />
          </div>
          <div className="border-b border-slate-100 px-3 py-3">
            <p className="font-mono text-xl font-bold tracking-tight text-slate-900">
              {product.sku}
            </p>
            <div className="mt-2">
              <OrderedProductBadge product={product} />
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="text-sm text-slate-600">{product.name}</p>
              <StockBadge
                stock={product.stock}
                unit={product.unit}
                stockStatus={product.stockStatus}
              />
            </div>
            <div className="mt-1 flex flex-wrap gap-3">
              {product.categoryId && (
                <Link
                  href={`/catalog?category=${encodeURIComponent(product.categoryId)}`}
                  className="text-xs text-brand-600"
                >
                  {product.categoryId}
                </Link>
              )}
              {product.subcategory && (
                <Link
                  href={`/catalog?category=${encodeURIComponent(product.categoryId)}&subcategory=${encodeURIComponent(product.subcategory)}`}
                  className="text-xs text-brand-600"
                >
                  {product.subcategory}
                </Link>
              )}
              {product.sourceUrl && (
                <a
                  href={product.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-slate-500 underline"
                >
                  На сайте →
                </a>
              )}
            </div>
          </div>

          <div className="px-3 py-3">
            <p className="text-2xl font-bold tabular-nums text-slate-900">
              {formatPrice(product.price)}
              <span className="text-sm font-normal text-slate-400">
                /{product.unit}
              </span>
            </p>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              {productExplanation}
            </p>
          </div>

          {Object.keys(product.specs).length > 0 && (
            <dl className="border-t border-slate-100 px-3 py-2">
              {Object.entries(product.specs).map(([key, value]) => (
                <div key={key} className="flex justify-between py-1.5 text-sm">
                  <dt className="text-slate-500">{key}</dt>
                  <dd className="font-medium text-slate-900">{value}</dd>
                </div>
              ))}
            </dl>
          )}

          <ProductNote productId={product.id} />
        </OrderedProductSurface>

        <ProductRecommendationStrip
          title="С этим обычно берут"
          subtitle="Компактная подборка для полной комплектации заказа."
          products={relatedProducts}
        />

        <ProductRecommendationStrip
          title="Похожие варианты"
          subtitle="Аналоги в доступном, оптимальном и премиум-сегменте."
          items={analogSegments}
        />
        <div className="h-20" aria-hidden />
      </div>

      <div className="fixed bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px))] left-0 right-0 z-30 border-t border-slate-200 bg-white p-3">
        <div className="mx-auto max-w-lg">
          <AddToCartButton
            productId={product.id}
            minOrder={product.minOrder}
            unit={product.unit}
          />
        </div>
      </div>
    </PageShell>
  );
}

function getCatalogBackHref(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return "/catalog";

  try {
    const parsed = new URL(raw, "http://ultra-svet.local");
    if (parsed.origin !== "http://ultra-svet.local") return "/catalog";
    if (!["/catalog", "/agentplus-tree"].includes(parsed.pathname)) {
      return "/catalog";
    }
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return "/catalog";
  }
}
