"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCart } from "@/context/CartContext";
import { useCustomerCabinet } from "@/lib/customer-cabinet";

const navItems = [
  { href: "/catalog", label: "Поиск", icon: SearchIcon },
  { href: "/categories", label: "Каталог", icon: CatalogIcon },
  { href: "/favorites", label: "Избранное", icon: HeartIcon, favoriteBadge: true },
  { href: "/cart", label: "Заказ", icon: CartIcon, cartBadge: true },
  { href: "/account", label: "Кабинет", icon: UserIcon },
];

export function BottomNav() {
  const pathname = usePathname();
  const { totalItems } = useCart();
  const { favoriteCount } = useCustomerCabinet();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white safe-bottom">
      <div className="mx-auto flex h-14 max-w-lg">
        {navItems.map(({ href, label, icon: Icon, cartBadge, favoriteBadge }) => {
          const active = pathname.startsWith(href);
          const badgeValue = cartBadge
            ? totalItems
            : favoriteBadge
              ? favoriteCount
              : 0;
          const showBadge = badgeValue > 0;
          return (
            <Link
              key={href}
              href={href}
              className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 ${
                active ? "text-brand-600" : "text-slate-500"
              }`}
            >
              <Icon active={active} />
              <span className="text-[10px] font-semibold">{label}</span>
              {showBadge && (
                <span className="absolute right-[calc(50%-20px)] top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[9px] font-bold text-white">
                  {badgeValue > 99 ? "99" : badgeValue}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function SearchIcon({ active }: { active: boolean }) {
  return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 2.25 : 1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
    </svg>
  );
}

function CatalogIcon({ active }: { active: boolean }) {
  return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 2.25 : 1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 5.25h16.5M3.75 12h16.5M3.75 18.75h16.5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 5.25v13.5" />
    </svg>
  );
}

function HeartIcon({ active }: { active: boolean }) {
  return (
    <svg className="h-6 w-6" fill={active ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 2.25 : 1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.35-1.9-4.25-4.25-4.25-1.39 0-2.63.67-3.4 1.7L12 7.5l-1.35-1.8A4.24 4.24 0 0 0 7.25 4C4.9 4 3 5.9 3 8.25c0 6 9 11.25 9 11.25s9-5.25 9-11.25Z" />
    </svg>
  );
}

function CartIcon({ active }: { active: boolean }) {
  return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 2.25 : 1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.123.42-.17.63m7.5 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
    </svg>
  );
}

function UserIcon({ active }: { active: boolean }) {
  return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 2.25 : 1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.5 20.25a7.5 7.5 0 0 1 15 0" />
    </svg>
  );
}
