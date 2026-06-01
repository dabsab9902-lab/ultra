export function CatalogSkeleton() {
  return (
    <div className="mx-auto max-w-lg">
      <div className="sticky top-0 z-50 border-b border-slate-200 bg-slate-100 safe-top">
        <div className="px-3 py-2">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <div className="h-3 w-28 animate-pulse rounded bg-slate-200" />
              <div className="mt-2 h-4 w-16 animate-pulse rounded bg-slate-300" />
            </div>
            <div className="h-11 w-20 animate-pulse rounded-lg bg-slate-300" />
          </div>
          <div className="h-14 animate-pulse rounded-lg bg-white ring-1 ring-slate-200" />
          <div className="mt-2 flex gap-1 overflow-hidden">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-8 w-20 shrink-0 animate-pulse rounded-md bg-white ring-1 ring-slate-200"
              />
            ))}
          </div>
        </div>
      </div>
      <ProductRowsSkeleton count={8} />
    </div>
  );
}

export function ProductRowsSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="divide-y divide-slate-200/80">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex gap-2 bg-white px-3 py-2">
          <div className="h-14 w-14 shrink-0 animate-pulse rounded-md bg-slate-100" />
          <div className="min-w-0 flex-1 py-0.5">
            <div className="h-4 w-24 animate-pulse rounded bg-slate-200" />
            <div className="mt-2 h-3 w-full animate-pulse rounded bg-slate-100" />
            <div className="mt-2 h-4 w-28 animate-pulse rounded bg-slate-200" />
          </div>
          <div className="h-11 w-11 shrink-0 animate-pulse rounded-lg bg-slate-200" />
        </div>
      ))}
    </div>
  );
}

export function ProductDetailSkeleton() {
  return (
    <div className="px-3 pt-2">
      <div className="mb-2 h-4 w-24 animate-pulse rounded bg-slate-200" />
      <div className="overflow-hidden rounded-lg bg-white ring-1 ring-slate-200">
        <div className="h-56 animate-pulse bg-slate-100" />
        <div className="space-y-3 px-3 py-3">
          <div className="h-6 w-32 animate-pulse rounded bg-slate-200" />
          <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
          <div className="h-7 w-28 animate-pulse rounded bg-slate-200" />
          <div className="h-16 w-full animate-pulse rounded bg-slate-100" />
        </div>
      </div>
    </div>
  );
}

export function AccountSkeleton() {
  return (
    <div className="px-3 py-3">
      <div className="h-36 animate-pulse rounded-lg bg-slate-800" />
      <div className="mt-3 h-40 animate-pulse rounded-lg bg-white ring-1 ring-slate-200" />
      <div className="mt-5 h-4 w-32 animate-pulse rounded bg-slate-200" />
      <div className="mt-2 h-20 animate-pulse rounded-lg bg-white ring-1 ring-slate-200" />
      <div className="mt-5 h-4 w-36 animate-pulse rounded bg-slate-200" />
      <ProductRowsSkeleton count={3} />
    </div>
  );
}
