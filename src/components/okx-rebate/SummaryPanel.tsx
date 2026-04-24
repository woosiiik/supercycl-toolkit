"use client";

import type { RebateSummary } from "@/lib/okx-rebate/types";

interface SummaryPanelProps {
  summary: RebateSummary;
}

function fmt(n: number): string {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
}

export default function SummaryPanel({ summary }: SummaryPanelProps) {
  const cards = [
    { label: "총 리베이트 (USDT)", value: fmt(summary.totalRebate), color: "text-green-600 dark:text-green-400" },
    { label: "총 Volume (USDT)", value: fmt(summary.totalVolume), color: "text-blue-600 dark:text-blue-400" },
    { label: "총 Fee (USDT, 원본 CSV)", value: fmt(summary.totalFee), color: "text-blue-600 dark:text-blue-400" },
    { label: "Trade 건수", value: summary.totalTradeCount.toLocaleString(), color: "text-zinc-900 dark:text-zinc-100" },
    { label: "Order 건수", value: summary.totalOrderCount.toLocaleString(), color: "text-zinc-900 dark:text-zinc-100" },
    { label: "매핑 주소 수", value: summary.addressCount.toLocaleString(), color: "text-zinc-900 dark:text-zinc-100" },
    { label: "미매핑 건수", value: summary.unmatchedCount.toLocaleString(), color: "text-amber-600 dark:text-amber-400" },
    { label: "미매핑 리베이트", value: fmt(summary.unmatchedRebate), color: "text-amber-600 dark:text-amber-400" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
      {cards.map((c) => (
        <div
          key={c.label}
          className="rounded-md border border-zinc-200 p-3 dark:border-zinc-700"
        >
          <p className="text-xs text-zinc-500 dark:text-zinc-400">{c.label}</p>
          <p className={`mt-1 text-lg font-semibold tabular-nums ${c.color}`}>
            {c.value}
          </p>
        </div>
      ))}
    </div>
  );
}
