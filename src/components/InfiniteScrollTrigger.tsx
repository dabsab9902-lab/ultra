"use client";

import { useEffect, useRef } from "react";

interface InfiniteScrollTriggerProps {
  onLoadMore: () => void;
  hasMore: boolean;
  loading: boolean;
}

export function InfiniteScrollTrigger({
  onLoadMore,
  hasMore,
  loading,
}: InfiniteScrollTriggerProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hasMore || loading) return;

    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onLoadMore();
      },
      { rootMargin: "200px" }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loading, onLoadMore]);

  if (!hasMore) return null;

  return (
    <div ref={ref} className="flex justify-center py-6">
      {loading && (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
          Загрузка...
        </div>
      )}
    </div>
  );
}
