"use client";

import { useState } from "react";
import type { ExchangeMeta, StoredData } from "@/lib/exchange-pnl/types";
import { EXCHANGE_COLORS } from "@/lib/exchange-pnl/exchanges";
import { fmtUtc } from "@/lib/exchange-pnl/format";

export type CollectState = "idle" | "loading" | "done" | "error";

interface Props {
  meta: ExchangeMeta;
  creds: Record<string, string>;
  onCredChange: (key: string, value: string) => void;
  onCollect: () => void;
  onClearData: () => void;
  data: StoredData | null;
  state: CollectState;
  error?: string;
  disabled: boolean;
}

function tierBadge(tier: string): string {
  if (tier === "A") return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300";
  if (tier === "A-") return "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300";
  return "bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300";
}

function SupportPill({ ok, label }: { ok: boolean | "approx"; label: string }) {
  const cls =
    ok === true
      ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
      : ok === "approx"
        ? "bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400"
        : "bg-zinc-100 text-zinc-400 line-through dark:bg-zinc-800";
  const mark = ok === true ? "✓" : ok === "approx" ? "△" : "✕";
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>{mark} {label}</span>;
}

export default function ExchangeCard({
  meta,
  creds,
  onCredChange,
  onCollect,
  onClearData,
  data,
  state,
  error,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const color = EXCHANGE_COLORS[meta.id];

  const hasCreds = meta.credFields.every((f) => (creds[f.key] ?? "").trim() !== "" || !f.secret);
  const rowCount = data?.rows.length ?? 0;

  return (
    <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
      {/* 헤더 */}
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
          <span className="font-medium text-zinc-900 dark:text-zinc-100">{meta.name}</span>
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${tierBadge(meta.tier)}`}>{meta.tier}</span>
        </div>
        <div className="flex items-center gap-2">
          {state === "done" && (
            <span className="text-xs text-emerald-600 dark:text-emerald-400">{rowCount.toLocaleString()}건 수집됨</span>
          )}
          {state === "loading" && <span className="text-xs text-blue-500">수집 중…</span>}
          {state === "error" && <span className="text-xs text-red-500">오류</span>}
          <button
            onClick={() => setOpen((v) => !v)}
            className="rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            {open ? "접기" : "설정"}
          </button>
        </div>
      </div>

      {/* 지원 지표 배지 */}
      <div className="flex flex-wrap gap-1 px-4 pb-2">
        <SupportPill ok={meta.supports.daily} label="일별" />
        <SupportPill ok={meta.supports.last30d} label="30일" />
        <SupportPill ok={meta.supports.bySymbol} label="심볼별" />
        <SupportPill ok={meta.supports.holdTime} label="보유시간" />
        <SupportPill ok={meta.supports.positionWinLoss === "yes" ? true : meta.supports.positionWinLoss === "approx" ? "approx" : false} label="승/패" />
        <SupportPill ok={meta.supports.winRate === "yes" ? true : meta.supports.winRate === "approx" ? "approx" : false} label="승률" />
      </div>

      {open && (
        <div className="border-t border-zinc-100 px-4 py-3 dark:border-zinc-800">
          <p className="mb-1 font-mono text-[11px] text-zinc-400">{meta.endpoint}</p>
          <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">{meta.note}</p>

          <div className="grid gap-2 sm:grid-cols-2">
            {meta.credFields.map((f) => (
              <div key={f.key} className={f.hint ? "sm:col-span-2" : ""}>
                <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">{f.label}</label>
                <input
                  type={f.secret ? "password" : "text"}
                  value={creds[f.key] ?? ""}
                  onChange={(e) => onCredChange(f.key, e.target.value)}
                  placeholder={f.placeholder}
                  autoComplete="off"
                  className="w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                />
                {f.hint && <p className="mt-1 text-[11px] text-zinc-400">{f.hint}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 액션 */}
      <div className="flex items-center justify-between gap-2 border-t border-zinc-100 px-4 py-2.5 dark:border-zinc-800">
        <div className="text-[11px] text-zinc-400">
          {data && (
            <span>
              최근 수집: {fmtUtc(data.collectedAt)} · API {data.meta.requestCount}회
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {data && (
            <button
              onClick={onClearData}
              disabled={disabled}
              className="rounded-md border border-zinc-300 px-3 py-1 text-xs text-zinc-500 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:hover:bg-zinc-800"
            >
              데이터 삭제
            </button>
          )}
          <button
            onClick={onCollect}
            disabled={disabled || !hasCreds || state === "loading"}
            className="rounded-md px-4 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: color }}
          >
            {state === "loading" ? "수집 중…" : data ? "다시 수집" : "수집"}
          </button>
        </div>
      </div>

      {/* 오류 / 경고 */}
      {state === "error" && error && (
        <div className="border-t border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}
      {data && data.warnings.length > 0 && (
        <div className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-[11px] text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
          {data.warnings.map((w, i) => (
            <p key={i}>· {w}</p>
          ))}
        </div>
      )}
    </div>
  );
}
