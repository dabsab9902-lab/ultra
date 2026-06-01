"use client";

import { forwardRef, type KeyboardEvent } from "react";
import { isSkuLikeQuery } from "@/lib/search/query";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  large?: boolean;
  onSubmit?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  showClear?: boolean;
  ariaExpanded?: boolean;
  ariaControls?: string;
  ariaActiveDescendant?: string;
}

export const SearchBar = forwardRef<HTMLInputElement, SearchBarProps>(
  function SearchBar(
    {
      value,
      onChange,
      placeholder = "Артикул или название…",
      autoFocus = false,
      large = false,
      onSubmit,
      onFocus,
      onBlur,
      onKeyDown,
      showClear = true,
      ariaExpanded,
      ariaControls,
      ariaActiveDescendant,
    },
    ref
  ) {
    const skuMode = isSkuLikeQuery(value);

    return (
      <div className="relative">
        <svg
          className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 ${
            large ? "h-5 w-5" : "h-4 w-4"
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
          />
        </svg>
        <input
          ref={ref}
          type="search"
          inputMode="search"
          enterKeyHint="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={onFocus}
          onBlur={onBlur}
          onKeyDown={(e) => {
            onKeyDown?.(e);
            if (e.key === "Enter" && !e.defaultPrevented && onSubmit) {
              e.preventDefault();
              onSubmit?.();
            }
          }}
          placeholder={placeholder}
          autoFocus={autoFocus}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={ariaExpanded ?? false}
          aria-controls={ariaControls}
          aria-activedescendant={ariaActiveDescendant}
          className={`w-full rounded-lg border-0 bg-white text-slate-900 shadow-sm ring-1 ring-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-600 ${
            large
              ? `min-h-[48px] py-3.5 pl-11 ${onSubmit ? "pr-24" : "pr-11"} text-base ${skuMode ? "font-mono uppercase tracking-wide" : ""}`
              : `py-2.5 pl-10 ${onSubmit ? "pr-24" : "pr-10"} text-base ${skuMode ? "font-mono" : ""}`
          }`}
        />
        {showClear && value && (
          <button
            type="button"
            onClick={() => onChange("")}
            className={`absolute top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 active:bg-slate-100 ${
              onSubmit ? "right-[4.75rem]" : "right-1"
            }`}
            aria-label="Очистить"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
        {onSubmit && (
          <button
            type="button"
            onClick={onSubmit}
            className="absolute right-1 top-1/2 flex h-10 -translate-y-1/2 items-center justify-center rounded-md bg-brand-600 px-3 text-xs font-bold text-white active:bg-brand-700"
          >
            Поиск
          </button>
        )}
      </div>
    );
  }
);
