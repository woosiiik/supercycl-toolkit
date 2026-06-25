"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { NormalizedRow } from "@/lib/exchange-pnl/types";
import { computeMetrics, formatHoldTime, type PnlToggles } from "@/lib/exchange-pnl/metrics";

function fmtUsd(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function pnlColor(n: number): string {
  if (n > 0) return "text-emerald-600 dark:text-emerald-400";
  if (n < 0) return "text-red-600 dark:text-red-400";
  return "text-zinc-500";
}

interface Props {
  rows: NormalizedRow[];
  toggles: PnlToggles;
  /** 포지션 승/패·hold time 미지원 안내 표시 여부 */
  showSupportNotes?: boolean;
}

function Card({ label, value, sub, valueClass }: { label: string; value: string; sub?: string; valueClass?: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-700 dark:bg-zinc-900">
      <div className="text-xs text-zinc-500 dark:text-zinc-400">{label}</div>
      <div className={`mt-1 text-lg font-semibold tabular-nums ${valueClass ?? "text-zinc-900 dark:text-zinc-100"}`}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-xs text-zinc-400">{sub}</div>}
    </div>
  );
}

export default function MetricsPanel({ rows, toggles, showSupportNotes }: Props) {
  const m = useMemo(() => computeMetrics(rows, toggles), [rows, toggles]);

  if (rows.length === 0) {
    return <p className="text-sm text-zinc-400">데이터가 없습니다.</p>;
  }

  const topSymbols = m.bySymbol.slice(0, 30);

  return (
    <div className="flex flex-col gap-5">
      {/* 요약 카드 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Card label="Net PnL (30일)" value={fmtUsd(m.totalNet)} valueClass={pnlColor(m.totalNet)} sub={`${m.closedCount.toLocaleString()}건`} />
        <Card label="가격손익" value={fmtUsd(m.totalPrice)} valueClass={pnlColor(m.totalPrice)} />
        <Card label="수수료" value={fmtUsd(m.totalFee)} valueClass={pnlColor(m.totalFee)} sub={toggles.includeFee ? "Net 반영" : "Net 제외"} />
        <Card label="펀딩" value={fmtUsd(m.totalFunding)} valueClass={pnlColor(m.totalFunding)} sub={toggles.includeFunding ? "Net 반영" : "Net 제외"} />
        <Card label="평균 PnL/건" value={fmtUsd(m.avgNet)} valueClass={pnlColor(m.avgNet)} />
        <Card label="이익 합" value={fmtUsd(m.profit)} valueClass="text-emerald-600 dark:text-emerald-400" />
        <Card label="손실 합" value={fmtUsd(m.loss)} valueClass="text-red-600 dark:text-red-400" />
        <Card
          label="승률"
          value={m.winRate !== null ? `${(m.winRate * 100).toFixed(1)}%` : "—"}
          sub={m.winCount !== null ? `승 ${m.winCount} / 패 ${m.lossCount}` : "포지션 단위 미지원"}
        />
      </div>

      {/* hold time */}
      {m.holdTime && (
        <div className="grid grid-cols-3 gap-3">
          <Card label="평균 보유시간" value={formatHoldTime(m.holdTime.overallAvg)} sub={`표본 ${m.holdTime.sampleCount}건`} />
          <Card label="승 보유시간" value={formatHoldTime(m.holdTime.winAvg)} />
          <Card label="패 보유시간" value={formatHoldTime(m.holdTime.lossAvg)} />
        </div>
      )}

      {showSupportNotes && !m.positionGranular && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
          이 데이터에는 포지션 단위 정보가 없어 승/패 수·승률·보유시간이 표시되지 않습니다 (income/fill 단위 거래소 포함).
        </div>
      )}

      {/* 일별 차트 */}
      <div>
        <h4 className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">일별 Net PnL</h4>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={m.daily} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#88888830" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d: string) => d.slice(5)} />
            <YAxis tick={{ fontSize: 11 }} width={56} tickFormatter={(v: number) => fmtUsd(v)} />
            <Tooltip
              formatter={(v) => fmtUsd(Number(v))}
              labelClassName="text-zinc-900"
              contentStyle={{ fontSize: 12 }}
            />
            <Bar dataKey="net" name="Net PnL">
              {m.daily.map((d) => (
                <Cell key={d.date} fill={d.net >= 0 ? "#10b981" : "#ef4444"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* 심볼별 */}
      <div>
        <h4 className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
          심볼별 PnL (상위 {topSymbols.length} / 전체 {m.bySymbol.length})
        </h4>
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-xs text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2 text-left">심볼</th>
                <th className="px-3 py-2 text-right">Net</th>
                <th className="px-3 py-2 text-right">가격손익</th>
                <th className="px-3 py-2 text-right">수수료</th>
                <th className="px-3 py-2 text-right">펀딩</th>
                <th className="px-3 py-2 text-right">건수</th>
              </tr>
            </thead>
            <tbody>
              {topSymbols.map((s) => (
                <tr key={s.symbol} className="border-t border-zinc-100 dark:border-zinc-800">
                  <td className="px-3 py-1.5 font-medium text-zinc-700 dark:text-zinc-300">{s.symbol || "—"}</td>
                  <td className={`px-3 py-1.5 text-right tabular-nums ${pnlColor(s.net)}`}>{fmtUsd(s.net)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-zinc-500">{fmtUsd(s.pricePnl)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-zinc-500">{fmtUsd(s.fee)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-zinc-500">{fmtUsd(s.funding)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-zinc-500">{s.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
