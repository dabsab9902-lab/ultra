import Link from "next/link";
import type { Category } from "@/lib/types";

interface CategoryChipProps {
  category: Category;
  active?: boolean;
  asLink?: boolean;
  onClick?: () => void;
}

export function CategoryChip({
  category,
  active = false,
  asLink = true,
  onClick,
}: CategoryChipProps) {
  const className = `flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-all ${
    active
      ? "border-brand-600 bg-brand-600 text-white shadow-sm"
      : "border-surface-border bg-white text-slate-700 hover:border-brand-500/50 hover:bg-brand-50"
  }`;

  const content = (
    <>
      <span className="text-base leading-none">{category.icon}</span>
      <span>{category.name}</span>
    </>
  );

  if (!asLink) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {content}
      </button>
    );
  }

  return (
    <Link href={`/catalog?category=${encodeURIComponent(category.id)}`} className={className}>
      {content}
    </Link>
  );
}
