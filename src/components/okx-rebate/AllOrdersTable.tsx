"use client";

import { useState } from "react";
import type { AllOrderRow } from "@/lib/okx-rebate/types";

type Filter = "all" | "mapped" | "unmapped";

interface AllOrdersTableProps {
  rows: AllOrderRow[];
  onExportCsv: (filtered: AllOrderRow[]) => void;
}

function fmt(n: number): string {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
}

function fmtTime(ts: number): string {
  const d = new Date(ts);
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().replace("T", " ").slice(0, 19);
}

export default function AllOrdersTable({
  rows,
  onExportCsv,
}: AllOrdersTableProps) {
  const [filter, setFilter] = useState<Filter>("all");

  const filtered =
    filter === "all"
      ? rows
      : filter === "mapped"
        ? rows.filter((r) => r.mapped)
        : rows.filter((r) => !r.mapped);

  const totalRebate = filtered.reduce((s, r) => s + r.brokerRebate, 0);
  const totalFee = filtered.reduce((s, r) => s + Math.abs(r.fee), 0);
  const totalNetFee = filtered.reduce((s, r) => s + Math.abs(r.netFee), 0);
  const totalVolume = filtered.reduce((s, r) => s + r.derivativeTradeAmt, 0);
  const mappedCount = rows.filter((r) => r.mapped).length;
  const unmappedCount = rows.filter((r) => !r.mapped).length;
  const noTradeCount = filtered.filter((r) => r.unmapReason === "no_trade").length;
  const noAddressCount = filtered.filter((r) => r.unmapReason === "no_address").length;

  const thCls =
    "px-3 py-2 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400";
  const tdCls = "px-3 py-2 text-sm";
  const borderR = "border-r border-zinc-200 dark:border-zinc-700";

  const filterBtnCls = (f: Filter) =>
    `rounded-md px-3 py-1 text-xs font-medium transition-colors ${
      filter === f
        ? "bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900"
        : "border border-zinc-300 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-700"
    }`;

  return (
    <div className="flex flex-col gap-3">
      {/* 요약 카드 */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
        <div className="rounded-md border border-zinc-200 p-3 dark:border-zinc-700">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">건수</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
            {filtered.length.toLocaleString()}
          </p>
        </div>
        <div className="rounded-md border border-zinc-200 p-3 dark:border-zinc-700">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">BrokerRebate</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-green-600 dark:text-green-400">
            {fmt(totalRebate)}
          </p>
        </div>
        <div className="rounded-md border border-zinc-200 p-3 dark:border-zinc-700">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Fee</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-blue-600 dark:text-blue-400">
            {fmt(totalFee)}
          </p>
        </div>
        <div className="rounded-md border border-zinc-200 p-3 dark:border-zinc-700">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">NetFee</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-blue-600 dark:text-blue-400">
            {fmt(totalNetFee)}
          </p>
        </div>
        <div className="rounded-md border border-zinc-200 p-3 dark:border-zinc-700">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Volume</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-blue-600 dark:text-blue-400">
            {fmt(totalVolume)}
          </p>
        </div>
        <div className="rounded-md border border-zinc-200 p-3 dark:border-zinc-700">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">DB 미존재</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-red-500">
            {noTradeCount}
          </p>
        </div>
        <div className="rounded-md border border-zinc-200 p-3 dark:border-zinc-700">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">주소 없음</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-amber-500">
            {noAddressCount}
          </p>
        </div>
      </div>

      {/* 필터 + CSV */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <button className={filterBtnCls("all")} onClick={() => setFilter("all")}>
            전체 ({rows.length})
          </button>
          <button className={filterBtnCls("mapped")} onClick={() => setFilter("mapped")}>
            매핑 ({mappedCount})
          </button>
          <button className={filterBtnCls("unmapped")} onClick={() => setFilter("unmapped")}>
            미매핑 ({unmappedCount})
          </button>
        </div>
        <button
          onClick={() => onExportCsv(filtered)}
          className="rounded-md border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-700"
        >
          CSV 다운로드
        </button>
      </div>

      {/* 테이블 */}
      {filtered.length === 0 ? (
        <div className="rounded-md border border-zinc-200 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700">
          해당 주문이 없습니다.
        </div>
      ) : (
        <div className="max-h-[500px] overflow-auto rounded-md border border-zinc-200 dark:border-zinc-700">
          <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
            <thead className="sticky top-0 bg-zinc-100 dark:bg-zinc-800">
              <tr>
                <th className={`${thCls} ${borderR} w-8`}>#</th>
                <th className={`${thCls} ${borderR}`}>상태</th>
                <th className={`${thCls} ${borderR}`}>미매핑 사유</th>
                <th className={`${thCls} ${borderR}`}>OrderId</th>
                <th className={`${thCls} ${borderR}`}>종목</th>
                <th className={`${thCls} ${borderR} text-right`}>Fee</th>
                <th className={`${thCls} ${borderR} text-right`}>NetFee</th>
                <th className={`${thCls} ${borderR} text-right`}>BrokerRebate</th>
                <th className={`${thCls} ${borderR} text-right`}>거래량</th>
                <th className={`${thCls} ${borderR}`}>ExchangeUID</th>
                <th className={`${thCls} ${borderR}`}>Address</th>
                <th className={thCls}>시각 (KST)</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr
                  key={`${r.orderId}-${i}`}
                  className="border-t border-zinc-200 text-zinc-900 dark:border-zinc-700 dark:text-zinc-100"
                >
                  <td className={`${tdCls} ${borderR} tabular-nums text-zinc-400`}>
                    {i + 1}
                  </td>
                  <td className={`${tdCls} ${borderR} text-center`}>
                    <span
                      className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${
                        r.mapped
                          ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                          : "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"
                      }`}
                    >
                      {r.mapped ? "매핑" : "미매핑"}
                    </span>
                  </td>
                  <td className={`${tdCls} ${borderR} text-center text-xs`}>
                    {r.unmapReason === "no_trade" ? (
                      <span className="text-red-500">DB 미존재</span>
                    ) : r.unmapReason === "no_address" ? (
                      <span className="text-amber-500">주소 없음</span>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className={`${tdCls} ${borderR} font-mono text-xs`}>
                    {r.orderId}
                  </td>
                  <td className={`${tdCls} ${borderR}`}>{r.instId}</td>
                  <td className={`${tdCls} ${borderR} text-right tabular-nums`}>
                    {fmt(Math.abs(r.fee))}
                  </td>
                  <td className={`${tdCls} ${borderR} text-right tabular-nums`}>
                    {fmt(Math.abs(r.netFee))}
                  </td>
                  <td className={`${tdCls} ${borderR} text-right tabular-nums text-green-600 dark:text-green-400`}>
                    {fmt(r.brokerRebate)}
                  </td>
                  <td className={`${tdCls} ${borderR} text-right tabular-nums`}>
                    {fmt(r.derivativeTradeAmt)}
                  </td>
                  <td className={`${tdCls} ${borderR} font-mono text-xs`}>
                    {r.exchangeUid || "-"}
                  </td>
                  <td className={`${tdCls} ${borderR} font-mono text-xs`}>
                    {r.address || "-"}
                  </td>
                  <td className={`${tdCls} tabular-nums`}>
                    {fmtTime(r.ts)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
