"use client";

import type { ReactNode } from "react";
import { formatPrice } from "@/lib/format";
import type { ClientSuggestion } from "@/lib/search/client-index";
import { normalizeSearchQuery } from "@/lib/search/query";

interface SearchSuggestionsProps {
  items: ClientSuggestion[];
  query: string;
  visible: boolean;
  activeIndex: number;
  onSelect: (id: string, sku: string) => void;
  onHighlight: (index: number) => void;
}

export function SearchSuggestions({
  items,
  query,
  visible,
  activeIndex,
  onSelect,
  onHighlight,
}: SearchSuggestionsProps) {
  if (!visible || items.length === 0 || normalizeSearchQuery(query).length < 3) {
    return null;
  }

  return (
    <ul
      className="absolute left-0 right-0 top-full z-[60] mt-1 max-h-[min(50vh,320px)] overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
      role="listbox"
      aria-label="Подсказки"
    >
      {items.map((item, index) => (
        <li
          key={item.id}
          id={`suggest-option-${index}`}
          role="option"
          aria-selected={index === activeIndex}
        >
          <button
            type="button"
            className={`flex w-full min-h-[52px] flex-col gap-0.5 px-3 py-2.5 text-left active:bg-slate-50 ${
              index === activeIndex ? "bg-brand-50" : ""
            }`}
            onMouseEnter={() => onHighlight(index)}
            onTouchStart={() => onHighlight(index)}
            onClick={() => onSelect(item.id, item.sku)}
          >
            <span className="font-mono text-sm font-bold tracking-wide text-brand-700">
              {highlightMatch(item.sku, query)}
            </span>
            <span className="line-clamp-2 text-xs leading-snug text-slate-600">
              {item.name}
            </span>
            <span className="text-[11px] font-semibold tabular-nums text-slate-500">
              {formatPrice(item.price)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function highlightMatch(text: string, query: string): ReactNode {
  const q = normalizeSearchQuery(query);
  if (!q) return text;

  const lower = text.toLowerCase();
  const qLower = q.toLowerCase();
  const idx = lower.indexOf(qLower);
  if (idx === -1) return text;

  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded bg-amber-200 px-0.5 font-bold text-inherit">
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </>
  );
}
