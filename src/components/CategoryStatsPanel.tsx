"use client";

import { formatPrice } from "@/lib/format";
import {
  STATS_PERIODS,
  type CategoryStatsRow,
  type CategoryStatsSummary,
  type StatsPeriod,
} from "@/lib/category-order-stats";

interface CategoryStatsPanelProps {
  title: string;
  stats: CategoryStatsSummary;
  subtitle?: string;
  period?: StatsPeriod;
  onPeriodChange?: (period: StatsPeriod) => void;
  showFavoriteMetric?: boolean;
}

export function CategoryStatsPanel({
  title,
  stats,
  subtitle,
  period,
  onPeriodChange,
  showFavoriteMetric = true,
}: CategoryStatsPanelProps) {
  const hasOrderData = stats.rows.length > 0;
  const hasFavoriteData = stats.favoriteRows.length > 0;

  return (
    <section className="rounded-lg bg-white p-3 ring-1 ring-slate-200">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-slate-900">{title}</h2>
          {subtitle && (
            <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
          )}
        </div>
        {period && onPeriodChange && (
          <select
            value={period}
            onChange={(event) => onPeriodChange(event.target.value as StatsPeriod)}
            className="h-9 shrink-0 rounded-lg border-0 bg-slate-50 px-2 text-xs font-bold text-slate-700 ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-600"
            aria-label="Период статистики"
          >
            {STATS_PERIODS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <StatCard
          label="Больше всего товара"
          row={stats.topByQuantity}
          value={stats.topByQuantity ? `${formatCount(stats.topByQuantity.quantity)} ед.` : ""}
        />
        <StatCard
          label="Самая большая сумма"
          row={stats.topByAmount}
          value={stats.topByAmount ? formatPrice(stats.topByAmount.amount) : ""}
        />
        {showFavoriteMetric && (
          <StatCard
            label="Больше всего избранных"
            row={stats.topByFavorite}
            value={
              stats.topByFavorite
                ? `${formatCount(stats.topByFavorite.favoriteCount)} тов.`
                : ""
            }
          />
        )}
        <StatCard
          label="Чаще в заказах"
          row={stats.topByOrderCount}
          value={
            stats.topByOrderCount
              ? `${formatCount(stats.topByOrderCount.orderCount)} зак.`
              : ""
          }
        />
      </div>

      <div className="mt-3 grid gap-3">
        <StatsBars
          title="По сумме заказов"
          rows={stats.rows.slice(0, 5)}
          metric="amount"
          empty={!hasOrderData}
        />
        <StatsBars
          title="По количеству товара"
          rows={[...stats.rows]
            .sort((a, b) => b.quantity - a.quantity)
            .slice(0, 5)}
          metric="quantity"
          empty={!hasOrderData}
        />
        {showFavoriteMetric && (
          <StatsBars
            title="По избранному"
            rows={stats.favoriteRows.slice(0, 5)}
            metric="favoriteCount"
            empty={!hasFavoriteData}
          />
        )}
      </div>
    </section>
  );
}

function StatCard({
  label,
  row,
  value,
}: {
  label: string;
  row: CategoryStatsRow | null;
  value: string;
}) {
  return (
    <div className="rounded-lg bg-slate-50 p-2.5 ring-1 ring-slate-100">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      {row ? (
        <>
          <p className="mt-1 line-clamp-2 text-xs font-bold leading-snug text-slate-900">
            {row.label}
          </p>
          <p className="mt-1 text-sm font-bold tabular-nums text-brand-700">
            {value}
          </p>
        </>
      ) : (
        <p className="mt-2 text-xs font-medium text-slate-400">
          Недостаточно данных
        </p>
      )}
    </div>
  );
}

function StatsBars({
  title,
  rows,
  metric,
  empty,
}: {
  title: string;
  rows: CategoryStatsRow[];
  metric: "amount" | "quantity" | "favoriteCount";
  empty: boolean;
}) {
  const max = Math.max(...rows.map((row) => row[metric]), 0);

  return (
    <div>
      <p className="text-xs font-bold text-slate-700">{title}</p>
      <div className="mt-1 space-y-1.5">
        {empty || rows.length === 0 ? (
          <p className="rounded-md bg-slate-50 px-2 py-2 text-xs text-slate-500">
            Недостаточно данных
          </p>
        ) : (
          rows.map((row) => (
            <div key={`${title}-${row.key}`} className="rounded-md bg-slate-50 p-2">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-xs font-medium text-slate-700">
                  {row.label}
                </span>
                <span className="shrink-0 text-xs font-bold tabular-nums text-slate-900">
                  {formatMetric(row, metric)}
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-brand-600"
                  style={{ width: `${max > 0 ? Math.max(8, (row[metric] / max) * 100) : 0}%` }}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function formatMetric(
  row: CategoryStatsRow,
  metric: "amount" | "quantity" | "favoriteCount"
) {
  if (metric === "amount") return formatPrice(row.amount);
  if (metric === "quantity") return `${formatCount(row.quantity)} ед.`;
  return `${formatCount(row.favoriteCount)} тов.`;
}

function formatCount(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value);
}
