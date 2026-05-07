"use client";

import { useMemo, useState } from "react";
import type { AddressRebateSummary } from "@/lib/okx-rebate/types";

interface DailyStatsTableProps {
  rows: AddressRebateSummary[];
  affiliateUsers: Set<string>;
  dateRange: { begin: string; end: string };
}

interface DayRow {
  date: string;
  week: number;
  userCount: number;
  volume: number;
  rebate: number;
}

function getMonday(d: Date): Date {
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + diff));
}

function fmtUsd(n: number): string {
  return "$" + n.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

function downloadCsvFile(filename: string, content: string) {
  const blob = new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

type ExFilter = "all" | "with_ex" | "without_ex";

export default function DailyStatsTable({ rows, affiliateUsers, dateRange }: DailyStatsTableProps) {
  const [affiliateOnly, setAffiliateOnly] = useState(false);
  const [exFilter, setExFilter] = useState<ExFilter>("all");

  const dailyRows = useMemo(() => {
    // 필터 적용
    let filtered = rows;
    if (affiliateOnly) {
      filtered = filtered.filter((r) => affiliateUsers.has(r.address));
    }
    if (exFilter === "with_ex") {
      filtered = filtered.filter((r) => r.exAccountId !== "");
    } else if (exFilter === "without_ex") {
      filtered = filtered.filter((r) => r.exAccountId === "");
    }

    // 날짜별 집계: detail의 ts로 날짜 결정
    const dayMap = new Map<string, { users: Set<string>; volume: number; rebate: number }>();

    for (const addr of filtered) {
      for (const d of addr.details) {
        const dateStr = new Date(d.ts).toISOString().slice(0, 10);
        let entry = dayMap.get(dateStr);
        if (!entry) {
          entry = { users: new Set(), volume: 0, rebate: 0 };
          dayMap.set(dateStr, entry);
        }
        entry.users.add(addr.address);
        entry.volume += d.derivativeTradeAmt;
        entry.rebate += d.brokerRebate;
      }
    }

    // 날짜 범위 생성
    if (!dateRange.begin || !dateRange.end) return [];

    const allDates: string[] = [];
    const start = new Date(dateRange.begin + "T00:00:00Z");
    const end = new Date(dateRange.end + "T00:00:00Z");
    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      allDates.push(d.toISOString().slice(0, 10));
    }

    // 주차 계산 (시작일의 월요일 기준)
    const firstMonday = getMonday(start);

    const result: DayRow[] = [];
    for (const date of allDates) {
      const current = new Date(date + "T00:00:00Z");
      const currentMonday = getMonday(current);
      const week = Math.floor((currentMonday.getTime() - firstMonday.getTime()) / (7 * 86_400_000)) + 1;

      const entry = dayMap.get(date);
      result.push({
        date,
        week,
        userCount: entry ? entry.users.size : 0,
        volume: entry ? entry.volume : 0,
        rebate: entry ? entry.rebate : 0,
      });
    }

    return result;
  }, [rows, affiliateUsers, affiliateOnly, exFilter, dateRange]);

  // 합계
  const totals = useMemo(() => {
    const uniqueUsers = new Set<string>();
    let volume = 0;
    let rebate = 0;
    for (const r of dailyRows) {
      volume += r.volume;
      rebate += r.rebate;
    }
    // 전체 유저 수는 날짜별 유저 합이 아니라 유니크 유저
    let filtered = rows;
    if (affiliateOnly) filtered = filtered.filter((r) => affiliateUsers.has(r.address));
    if (exFilter === "with_ex") filtered = filtered.filter((r) => r.exAccountId !== "");
    else if (exFilter === "without_ex") filtered = filtered.filter((r) => r.exAccountId === "");

    for (const addr of filtered) {
      if (addr.details.length > 0) uniqueUsers.add(addr.address);
    }
    return { userCount: uniqueUsers.size, volume, rebate };
  }, [dailyRows, rows, affiliateUsers, affiliateOnly, exFilter]);

  function handleExportCsv() {
    const header = "일자,주차,거래 유저 수,거래량 (USD),브로커피 (USD)";
    const lines = [header];
    for (const r of dailyRows) {
      lines.push(
        `${r.date},${r.week},${r.userCount || "-"},${r.volume ? r.volume.toFixed(4) : "-"},${r.rebate ? r.rebate.toFixed(4) : "-"}`,
      );
    }
    lines.push(`합계,,${totals.userCount},${totals.volume.toFixed(4)},${totals.rebate.toFixed(4)}`);
    downloadCsvFile(`okx-rebate-daily-${dateRange.begin}-to-${dateRange.end}.csv`, lines.join("\n"));
  }

  const thCls = "px-3 py-2 text-xs font-medium text-zinc-500 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-700";
  const tdCls = "px-3 py-2 text-sm tabular-nums";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-sm text-zinc-500 dark:text-zinc-400">
          <input
            type="checkbox"
            checked={affiliateOnly}
            onChange={(e) => setAffiliateOnly(e.target.checked)}
            className="rounded"
          />
          affiliate_no=1 만
        </label>

        <select
          value={exFilter}
          onChange={(e) => setExFilter(e.target.value as ExFilter)}
          className="rounded-md border border-zinc-300 px-2 py-1 text-sm text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
        >
          <option value="all">EX 계정: 전체</option>
          <option value="with_ex">EX 계정 있음</option>
          <option value="without_ex">EX 계정 없음</option>
        </select>

        <button
          onClick={handleExportCsv}
          className="rounded-md border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-700"
        >
          CSV 다운로드
        </button>
      </div>

      <div className="max-h-[600px] overflow-auto rounded-md border border-zinc-200 dark:border-zinc-700">
        <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
          <thead className="sticky top-0 bg-zinc-100 dark:bg-zinc-800">
            <tr>
              <th className={`${thCls} text-left`}>일자</th>
              <th className={`${thCls} text-center`}>주차</th>
              <th className={`${thCls} text-right`}>거래 유저 수</th>
              <th className={`${thCls} text-right`}>거래량 (USD)</th>
              <th className={`${thCls} text-right`}>브로커피 (USD)</th>
            </tr>
          </thead>
          <tbody>
            {dailyRows.map((r) => (
              <tr
                key={r.date}
                className="border-t border-zinc-200 text-zinc-900 dark:border-zinc-700 dark:text-zinc-100"
              >
                <td className={tdCls}>{r.date}</td>
                <td className={`${tdCls} text-center`}>{r.week}</td>
                <td className={`${tdCls} text-right`}>{r.userCount || "-"}</td>
                <td className={`${tdCls} text-right`}>{r.volume ? fmtUsd(r.volume) : "-"}</td>
                <td className={`${tdCls} text-right`}>{r.rebate ? fmtUsd(r.rebate) : "-"}</td>
              </tr>
            ))}
            {/* 합계 행 */}
            <tr className="border-t-2 border-zinc-400 bg-zinc-50 font-medium dark:border-zinc-500 dark:bg-zinc-800">
              <td className={tdCls}>합계</td>
              <td className={tdCls}></td>
              <td className={`${tdCls} text-right`}>{totals.userCount}</td>
              <td className={`${tdCls} text-right`}>{fmtUsd(totals.volume)}</td>
              <td className={`${tdCls} text-right`}>{fmtUsd(totals.rebate)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
