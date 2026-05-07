"use client";

import { useState } from "react";
import type { AddressRebateSummary, TradeDetail } from "@/lib/okx-rebate/types";

interface RebateTableProps {
  rows: AddressRebateSummary[];
  onExportSummaryCsv: () => void;
  onExportDetailCsv: () => void;
}

type SortKey = "address" | "exAccountId" | "totalVolume" | "totalFee" | "totalRebate" | "rebateFeeRatio" | "rebateVolumeRatio" | "registeredDate";

function fmt(n: number): string {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
}

function fmtPct(n: number): string {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }) + "%";
}

function rebateFeeRatio(row: AddressRebateSummary): number {
  return row.totalFee > 0 ? (row.totalRebate / row.totalFee) * 100 : 0;
}

function rebateVolumeRatio(row: AddressRebateSummary): number {
  return row.totalVolume > 0 ? (row.totalRebate / row.totalVolume) * 100 : 0;
}

function fmtTime(dateStr: string | null): string {
  if (!dateStr) return "-";
  return new Date(dateStr).toISOString().replace("T", " ").slice(0, 19);
}

export default function RebateTable({ rows, onExportSummaryCsv, onExportDetailCsv }: RebateTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("totalRebate");
  const [sortAsc, setSortAsc] = useState(false);
  const [expandedAddr, setExpandedAddr] = useState<string | null>(null);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(key === "address");
    }
  }

  const sorted = [...rows].sort((a, b) => {
    let cmp: number;
    if (sortKey === "address") {
      cmp = a.address.localeCompare(b.address);
    } else if (sortKey === "exAccountId") {
      cmp = a.exAccountId.localeCompare(b.exAccountId);
    } else if (sortKey === "registeredDate") {
      cmp = a.registeredDate.localeCompare(b.registeredDate);
    } else if (sortKey === "rebateFeeRatio") {
      cmp = rebateFeeRatio(a) - rebateFeeRatio(b);
    } else if (sortKey === "rebateVolumeRatio") {
      cmp = rebateVolumeRatio(a) - rebateVolumeRatio(b);
    } else {
      cmp = a[sortKey] - b[sortKey];
    }
    return sortAsc ? cmp : -cmp;
  });

  const indicator = (key: SortKey) =>
    sortKey === key ? (sortAsc ? " \u2191" : " \u2193") : "";

  const thCls =
    "px-3 py-2 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 cursor-pointer hover:text-zinc-700 dark:hover:text-zinc-200 select-none";
  const tdCls = "px-3 py-2 text-sm";
  const borderR = "border-r border-zinc-200 dark:border-zinc-700";

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs text-zinc-400">
          {rows.length}개 주소
        </span>
        <div className="flex items-center gap-2">
          <span className="max-w-sm text-[11px] leading-tight text-zinc-400 dark:text-zinc-500">
            * 하나의 order-rebate에 여러 trade가 매핑될 수 있으며, 이 경우 첫 번째 trade에만 rebate를 표시하고 나머지는 0으로 표시합니다.
          </span>
          <button
            onClick={onExportSummaryCsv}
            className="rounded-md border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-700"
          >
            요약 CSV
          </button>
          <button
            onClick={onExportDetailCsv}
            className="rounded-md border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-700"
          >
            상세 CSV
          </button>
        </div>
      </div>

      <div className="max-h-[500px] overflow-auto rounded-md border border-zinc-200 dark:border-zinc-700">
        <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
          <thead className="sticky top-0 bg-zinc-100 dark:bg-zinc-800">
            <tr>
              <th className={`${thCls} ${borderR} w-8`}>#</th>
              <th className={`${thCls} ${borderR}`} onClick={() => handleSort("address")}>
                Address{indicator("address")}
              </th>
              <th className={`${thCls} ${borderR}`} onClick={() => handleSort("exAccountId")}>
                EX 계정 ID{indicator("exAccountId")}
              </th>
              <th className={`${thCls} ${borderR} text-right`} onClick={() => handleSort("totalVolume")}>
                누적 거래량(USD){indicator("totalVolume")}
              </th>
              <th className={`${thCls} ${borderR} text-right`} onClick={() => handleSort("totalFee")}>
                누적 수수료(USD){indicator("totalFee")}
              </th>
              <th className={`${thCls} ${borderR} text-right`} onClick={() => handleSort("totalRebate")}>
                누적 브로커피(USD){indicator("totalRebate")}
              </th>
              <th className={`${thCls} ${borderR} text-right`} onClick={() => handleSort("rebateFeeRatio")}>
                브로커피/수수료{indicator("rebateFeeRatio")}
              </th>
              <th className={`${thCls} ${borderR} text-right`} onClick={() => handleSort("rebateVolumeRatio")}>
                브로커피/거래량{indicator("rebateVolumeRatio")}
              </th>
              <th className={`${thCls}`} onClick={() => handleSort("registeredDate")}>
                가입일자{indicator("registeredDate")}
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => (
              <>
                <tr
                  key={row.address}
                  onClick={() =>
                    setExpandedAddr(
                      expandedAddr === row.address ? null : row.address,
                    )
                  }
                  className="cursor-pointer border-t border-zinc-200 text-zinc-900 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800/50"
                >
                  <td className={`${tdCls} ${borderR} tabular-nums text-zinc-400`}>
                    {i + 1}
                  </td>
                  <td className={`${tdCls} ${borderR} font-mono text-xs`}>
                    {row.address}
                  </td>
                  <td className={`${tdCls} ${borderR} text-xs`}>
                    {row.exAccountId || "-"}
                  </td>
                  <td className={`${tdCls} ${borderR} text-right tabular-nums`}>
                    {fmt(row.totalVolume)}
                  </td>
                  <td className={`${tdCls} ${borderR} text-right tabular-nums`}>
                    {fmt(row.totalFee)}
                  </td>
                  <td className={`${tdCls} ${borderR} text-right tabular-nums text-green-600 dark:text-green-400`}>
                    {fmt(row.totalRebate)}
                  </td>
                  <td className={`${tdCls} ${borderR} text-right tabular-nums`}>
                    {fmtPct(rebateFeeRatio(row))}
                  </td>
                  <td className={`${tdCls} ${borderR} text-right tabular-nums`}>
                    {fmtPct(rebateVolumeRatio(row))}
                  </td>
                  <td className={`${tdCls} tabular-nums text-xs`}>
                    {row.registeredDate || "-"}
                  </td>
                </tr>
                {expandedAddr === row.address && (
                  <tr key={`${row.address}-detail`}>
                    <td
                      colSpan={9}
                      className="border-t border-zinc-100 bg-zinc-50/50 p-0 dark:border-zinc-800 dark:bg-zinc-900/50"
                    >
                      <DetailTable details={row.details} />
                    </td>
                  </tr>
                )}
              </>
            ))}
            {/* 합계 행 */}
            {rows.length > 0 && (() => {
              const totVolume = rows.reduce((s, r) => s + r.totalVolume, 0);
              const totFee = rows.reduce((s, r) => s + r.totalFee, 0);
              const totRebate = rows.reduce((s, r) => s + r.totalRebate, 0);
              return (
                <tr className="border-t-2 border-zinc-400 bg-zinc-50 font-medium dark:border-zinc-500 dark:bg-zinc-800">
                  <td className={`${tdCls} ${borderR}`}></td>
                  <td className={`${tdCls} ${borderR} text-xs`}>합계 ({rows.length}개 주소)</td>
                  <td className={`${tdCls} ${borderR}`}></td>
                  <td className={`${tdCls} ${borderR} text-right tabular-nums`}>{fmt(totVolume)}</td>
                  <td className={`${tdCls} ${borderR} text-right tabular-nums`}>{fmt(totFee)}</td>
                  <td className={`${tdCls} ${borderR} text-right tabular-nums text-green-600 dark:text-green-400`}>{fmt(totRebate)}</td>
                  <td className={`${tdCls} ${borderR} text-right tabular-nums`}>{totFee > 0 ? fmtPct((totRebate / totFee) * 100) : "-"}</td>
                  <td className={`${tdCls} ${borderR} text-right tabular-nums`}>{totVolume > 0 ? fmtPct((totRebate / totVolume) * 100) : "-"}</td>
                  <td className={tdCls}></td>
                </tr>
              );
            })()}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DetailTable({ details }: { details: TradeDetail[] }) {
  const sorted = [...details].sort((a, b) => {
    // tradedAt 기준 정렬, 없으면 ts
    const ta = a.tradedAt ? new Date(a.tradedAt).getTime() : a.ts;
    const tb = b.tradedAt ? new Date(b.tradedAt).getTime() : b.ts;
    return tb - ta;
  });
  const thCls =
    "px-2 py-1.5 text-left text-[11px] font-medium text-zinc-400 dark:text-zinc-500";
  const tdCls = "px-2 py-1 text-xs";

  return (
    <div className="max-h-60 overflow-auto">
      <table className="w-full" style={{ borderCollapse: "collapse" }}>
        <thead className="sticky top-0 bg-zinc-100 dark:bg-zinc-800">
          <tr>
            <th className={thCls}>OrderId</th>
            <th className={thCls}>TradeId</th>
            <th className={thCls}>종목</th>
            <th className={thCls}>방향</th>
            <th className={`${thCls} text-right`}>가격</th>
            <th className={`${thCls} text-right`}>수량</th>
            <th className={`${thCls} text-right`}>Volume</th>
            <th className={`${thCls} text-right`}>Fee (CSV)</th>
            <th className={`${thCls} text-right`}>Rebate</th>
            <th className={thCls}>시각 (UTC)</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((d, i) => (
            <tr
              key={`${d.orderId}-${d.tradeId}-${i}`}
              className="border-t border-zinc-100 dark:border-zinc-800"
            >
              <td className={`${tdCls} font-mono`}>{d.orderId}</td>
              <td className={`${tdCls} font-mono`}>{d.tradeId}</td>
              <td className={tdCls}>{d.symbol}</td>
              <td className={tdCls}>{d.direction}</td>
              <td className={`${tdCls} text-right tabular-nums`}>
                {fmt(d.price)}
              </td>
              <td className={`${tdCls} text-right tabular-nums`}>
                {fmt(d.quantity)}
              </td>
              <td className={`${tdCls} text-right tabular-nums`}>
                {fmt(d.price * d.quantity)}
              </td>
              <td className={`${tdCls} text-right tabular-nums`}>
                {d.csvFee !== 0 ? fmt(Math.abs(d.csvFee)) : ""}
              </td>
              <td className={`${tdCls} text-right tabular-nums text-green-600 dark:text-green-400`}>
                {d.brokerRebate !== 0 ? fmt(d.brokerRebate) : ""}
              </td>
              <td className={`${tdCls} tabular-nums`}>{fmtTime(d.tradedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
