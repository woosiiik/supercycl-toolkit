"use client";

import { useState } from "react";
import type { StoredData, RawPage } from "@/lib/exchange-pnl/types";
import { getExchange } from "@/lib/exchange-pnl/exchanges";

function RawPageBlock({ page }: { page: RawPage }) {
  const [open, setOpen] = useState(false);
  const json = typeof page.body === "string" ? page.body : JSON.stringify(page.body, null, 2);
  const preview = json.length > 400 ? json.slice(0, 400) + " …" : json;

  return (
    <div className="rounded-md border border-zinc-200 dark:border-zinc-700">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs"
      >
        <span className="flex items-center gap-2">
          <span
            className={`rounded px-1.5 py-0.5 font-mono font-medium ${
              page.status >= 200 && page.status < 300
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300"
                : "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"
            }`}
          >
            {page.status}
          </span>
          <span className="font-medium text-zinc-700 dark:text-zinc-300">{page.label}</span>
        </span>
        <span className="text-zinc-400">{open ? "접기 ▲" : "펼치기 ▼"}</span>
      </button>
      {open && (
        <div className="border-t border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center justify-between px-3 py-1.5">
            <span className="truncate font-mono text-[10px] text-zinc-400">{page.url}</span>
            <button
              onClick={() => navigator.clipboard?.writeText(json)}
              className="ml-2 shrink-0 rounded border border-zinc-300 px-2 py-0.5 text-[10px] text-zinc-500 hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-800"
            >
              복사
            </button>
          </div>
          <pre className="max-h-96 overflow-auto bg-zinc-50 px-3 py-2 text-[11px] leading-relaxed text-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
            {json}
          </pre>
        </div>
      )}
      {!open && (
        <pre className="overflow-hidden px-3 pb-2 text-[10px] text-zinc-400">{preview}</pre>
      )}
    </div>
  );
}

export default function RawDataView({ data }: { data: StoredData }) {
  const meta = getExchange(data.exchange);
  const [showRows, setShowRows] = useState(false);
  const sampleRows = data.rows.slice(0, 50);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
        <p>
          <strong>{meta.name}</strong> · {data.rows.length.toLocaleString()} rows · API {data.meta.requestCount}회 ·
          엔드포인트: {data.meta.endpoints.join(", ")}
        </p>
        <p className="mt-1 text-zinc-400">
          기간 {new Date(data.startTime).toISOString().slice(0, 10)} ~ {new Date(data.endTime).toISOString().slice(0, 10)} ·
          수집 {new Date(data.collectedAt).toLocaleString()}
        </p>
      </div>

      {/* 원본 API 응답 */}
      <div>
        <h4 className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
          원본 API 응답 ({data.rawPages.length} 호출)
        </h4>
        <div className="flex flex-col gap-2">
          {data.rawPages.map((p, i) => (
            <RawPageBlock key={i} page={p} />
          ))}
        </div>
      </div>

      {/* 정규화 row 미리보기 */}
      <div>
        <button
          onClick={() => setShowRows((v) => !v)}
          className="mb-2 text-sm font-medium text-blue-600 dark:text-blue-400"
        >
          {showRows ? "정규화 row 숨기기 ▲" : `정규화 row 보기 ▼ (상위 ${sampleRows.length}/${data.rows.length})`}
        </button>
        {showRows && (
          <div className="overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-700">
            <table className="w-full text-xs">
              <thead className="bg-zinc-50 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                <tr>
                  <th className="px-2 py-1.5 text-left">심볼</th>
                  <th className="px-2 py-1.5 text-left">side</th>
                  <th className="px-2 py-1.5 text-right">price</th>
                  <th className="px-2 py-1.5 text-right">fee</th>
                  <th className="px-2 py-1.5 text-right">funding</th>
                  <th className="px-2 py-1.5 text-right">net</th>
                  <th className="px-2 py-1.5 text-right">보유</th>
                  <th className="px-2 py-1.5 text-left">종료(UTC)</th>
                  <th className="px-2 py-1.5 text-left">unit</th>
                </tr>
              </thead>
              <tbody>
                {sampleRows.map((r, i) => (
                  <tr key={r.id + i} className="border-t border-zinc-100 dark:border-zinc-800">
                    <td className="px-2 py-1 font-medium text-zinc-700 dark:text-zinc-300">{r.symbol}</td>
                    <td className="px-2 py-1 text-zinc-500">{r.side ?? "—"}</td>
                    <td className="px-2 py-1 text-right tabular-nums text-zinc-500">{r.pricePnl.toFixed(2)}</td>
                    <td className="px-2 py-1 text-right tabular-nums text-zinc-500">{r.fee.toFixed(2)}</td>
                    <td className="px-2 py-1 text-right tabular-nums text-zinc-500">{r.funding.toFixed(2)}</td>
                    <td className={`px-2 py-1 text-right tabular-nums ${r.netPnl >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                      {r.netPnl.toFixed(2)}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums text-zinc-500">
                      {r.holdTimeMs ? `${(r.holdTimeMs / 3600000).toFixed(1)}h` : "—"}
                    </td>
                    <td className="px-2 py-1 text-zinc-500">{new Date(r.closeTime).toISOString().slice(0, 16).replace("T", " ")}</td>
                    <td className="px-2 py-1 text-zinc-400">{r.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
