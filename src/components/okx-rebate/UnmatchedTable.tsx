"use client";

import type { UnmatchedOrder } from "@/lib/okx-rebate/types";

interface UnmatchedTableProps {
  rows: UnmatchedOrder[];
  onExportCsv: () => void;
}

function fmt(n: number): string {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
}

function fmtTime(ts: number): string {
  return new Date(ts).toISOString().replace("T", " ").slice(0, 19);
}

export default function UnmatchedTable({
  rows,
  onExportCsv,
}: UnmatchedTableProps) {
  const totalRebate = rows.reduce((sum, r) => sum + r.brokerRebate, 0);
  const totalFee = rows.reduce((sum, r) => sum + Math.abs(r.fee), 0);
  const totalVolume = rows.reduce((sum, r) => sum + r.derivativeTradeAmt, 0);

  const thCls =
    "px-3 py-2 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400";
  const tdCls = "px-3 py-2 text-sm";
  const borderR = "border-r border-zinc-200 dark:border-zinc-700";

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs text-zinc-400">
          {rows.length}건 / Rebate: {fmt(totalRebate)} / Fee: {fmt(totalFee)} / Volume: {fmt(totalVolume)} USDT
        </span>
        <button
          onClick={onExportCsv}
          className="rounded-md border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-700"
        >
          CSV 다운로드
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-md border border-zinc-200 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700">
          미매핑 주문이 없습니다.
        </div>
      ) : (
        <div className="max-h-[500px] overflow-auto rounded-md border border-zinc-200 dark:border-zinc-700">
          <table
            className="w-full text-sm"
            style={{ borderCollapse: "collapse" }}
          >
            <thead className="sticky top-0 bg-zinc-100 dark:bg-zinc-800">
              <tr>
                <th className={`${thCls} ${borderR} w-8`}>#</th>
                <th className={`${thCls} ${borderR}`}>OrderId</th>
                <th className={`${thCls} ${borderR}`}>종목</th>
                <th className={`${thCls} ${borderR} text-right`}>Fee</th>
                <th className={`${thCls} ${borderR} text-right`}>Rebate</th>
                <th className={`${thCls} ${borderR} text-right`}>거래량</th>
                <th className={thCls}>시각 (UTC)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={`${r.orderId}-${i}`}
                  className="border-t border-zinc-200 text-zinc-900 dark:border-zinc-700 dark:text-zinc-100"
                >
                  <td
                    className={`${tdCls} ${borderR} tabular-nums text-zinc-400`}
                  >
                    {i + 1}
                  </td>
                  <td className={`${tdCls} ${borderR} font-mono text-xs`}>
                    {r.orderId}
                  </td>
                  <td className={`${tdCls} ${borderR}`}>{r.instId}</td>
                  <td
                    className={`${tdCls} ${borderR} text-right tabular-nums`}
                  >
                    {fmt(Math.abs(r.fee))}
                  </td>
                  <td
                    className={`${tdCls} ${borderR} text-right tabular-nums text-green-600 dark:text-green-400`}
                  >
                    {fmt(r.brokerRebate)}
                  </td>
                  <td
                    className={`${tdCls} ${borderR} text-right tabular-nums`}
                  >
                    {fmt(r.derivativeTradeAmt)}
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
