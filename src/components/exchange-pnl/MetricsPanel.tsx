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
import type { NormalizedRow, ExchangeId } from "@/lib/exchange-pnl/types";
import { computeMetrics, formatHoldTime, type PnlToggles, type DailyPoint } from "@/lib/exchange-pnl/metrics";
import { fmtAmount } from "@/lib/exchange-pnl/format";
import { EXCHANGES, EXCHANGE_COLORS } from "@/lib/exchange-pnl/exchanges";

// 작은 값(sub-cent 펀딩 등)도 보이도록 적응형 포맷 사용
const fmtUsd = fmtAmount;

// 지표별 "지원 거래소" 표시 — 7개 거래소 능력(메타데이터) 기준.
const SHORT: Record<ExchangeId, string> = {
  okx: "OKX",
  bingx: "BingX",
  bitget: "Bitget",
  gate: "Gate",
  bybit: "Bybit",
  binance: "Binance",
  hyperliquid: "HL",
};

// value/symbol: 전 거래소 가능 / holdTime·winRate: 일부만
type MetricDim = "value" | "symbol" | "holdTime" | "winRate" | "winRateStrict";

function dimSupporters(dim: MetricDim): { full: ExchangeId[]; approx: ExchangeId[] } {
  if (dim === "value" || dim === "symbol") {
    return { full: EXCHANGES.map((e) => e.id), approx: [] };
  }
  if (dim === "holdTime") {
    return { full: EXCHANGES.filter((e) => e.supports.holdTime).map((e) => e.id), approx: [] };
  }
  if (dim === "winRateStrict") {
    // 정식: 포지션 단위(winRate === "yes")만
    return { full: EXCHANGES.filter((e) => e.supports.winRate === "yes").map((e) => e.id), approx: [] };
  }
  // winRate (= 포지션 승/패, 근사 포함)
  return {
    full: EXCHANGES.filter((e) => e.supports.winRate === "yes").map((e) => e.id),
    approx: EXCHANGES.filter((e) => e.supports.winRate === "approx").map((e) => e.id),
  };
}

function SupportLine({ dim }: { dim: MetricDim }) {
  const { full, approx } = dimSupporters(dim);
  const allFull = full.length === EXCHANGES.length && approx.length === 0;
  return (
    <div className="mt-1 text-[10px] leading-tight text-zinc-400 dark:text-zinc-500">
      지원:{" "}
      {allFull ? (
        <span className="font-medium text-emerald-600 dark:text-emerald-400">All</span>
      ) : (
        <>
          <span className="text-zinc-500 dark:text-zinc-400">{full.map((id) => SHORT[id]).join(" · ") || "—"}</span>
          {approx.length > 0 && (
            <span className="text-amber-500 dark:text-amber-400"> (근사: {approx.map((id) => SHORT[id]).join(" · ")})</span>
          )}
        </>
      )}
    </div>
  );
}

function pnlColor(n: number): string {
  if (n > 0) return "text-emerald-600 dark:text-emerald-400";
  if (n < 0) return "text-red-600 dark:text-red-400";
  return "text-zinc-500";
}

const TOOLTIP_MAX = 12;

// ms → HH:MM:SS (UTC). 그룹에 여러 건이면 최초~최종 범위로.
function closeTimeLabel(min: number, max: number): string {
  if (!Number.isFinite(min) || max <= 0) return "";
  const hms = (ms: number) => new Date(ms).toISOString().slice(11, 19);
  return min === max ? `${hms(max)} UTC` : `${hms(min)}–${hms(max)} UTC`;
}

// 일별 차트 hover 시 그 날짜 내역을 거래소·심볼별로, 가격손익/수수료/펀딩/Net 구분해 표시
function DailyTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: DailyPoint }> }) {
  if (!active || !payload?.length) return null;
  const dp = payload[0].payload;
  const entries = dp.entries ?? [];
  const shown = entries.slice(0, TOOLTIP_MAX);
  const rest = entries.length - shown.length;
  const numCls = (n: number) => `px-2 py-0.5 text-right align-top tabular-nums ${pnlColor(n)}`;
  return (
    <div className="max-w-md rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <span className="font-medium text-zinc-700 dark:text-zinc-200">{dp.date}</span>
        <span className={`font-semibold tabular-nums ${pnlColor(dp.net)}`}>Net {fmtUsd(dp.net)}</span>
      </div>
      {entries.length === 0 ? (
        <div className="text-zinc-400">내역 없음</div>
      ) : (
        <table className="w-full border-collapse">
          <thead className="text-[10px] text-zinc-400">
            <tr>
              <th className="py-0.5 pr-2 text-left font-normal">거래소 · 심볼</th>
              <th className="px-2 py-0.5 text-right font-normal">손익</th>
              <th className="px-2 py-0.5 text-right font-normal">수수료</th>
              <th className="px-2 py-0.5 text-right font-normal">펀딩</th>
              <th className="px-2 py-0.5 text-right font-normal">Net</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((e, i) => (
              <tr key={i} className="border-t border-zinc-100 dark:border-zinc-800">
                <td className="py-0.5 pr-2 align-top">
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: EXCHANGE_COLORS[e.exchange] }} />
                    <span className="text-zinc-400">{SHORT[e.exchange]}</span>
                    <span className="text-zinc-600 dark:text-zinc-300">{e.symbol || "—"}</span>
                    {e.count > 1 && <span className="text-zinc-400">×{e.count}</span>}
                  </span>
                  {closeTimeLabel(e.minClose, e.maxClose) && (
                    <span className="block pl-2.5 font-mono text-[10px] text-zinc-400">
                      {closeTimeLabel(e.minClose, e.maxClose)}
                    </span>
                  )}
                </td>
                <td className={numCls(e.pricePnl)}>{fmtUsd(e.pricePnl)}</td>
                <td className={numCls(e.fee)}>{fmtUsd(e.fee)}</td>
                <td className={numCls(e.funding)}>{fmtUsd(e.funding)}</td>
                <td className={`px-2 py-0.5 text-right align-top font-medium tabular-nums ${pnlColor(e.net)}`}>{fmtUsd(e.net)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-zinc-200 dark:border-zinc-700">
              <td className="py-0.5 pr-2 text-zinc-500">{rest > 0 ? `외 ${rest}건 포함 합계` : "합계"}</td>
              <td className={numCls(dp.pricePnl)}>{fmtUsd(dp.pricePnl)}</td>
              <td className={numCls(dp.fee)}>{fmtUsd(dp.fee)}</td>
              <td className={numCls(dp.funding)}>{fmtUsd(dp.funding)}</td>
              <td className={`px-2 py-0.5 text-right font-semibold tabular-nums ${pnlColor(dp.net)}`}>{fmtUsd(dp.net)}</td>
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  );
}

interface Props {
  rows: NormalizedRow[];
  toggles: PnlToggles;
  /** 포지션 승/패·hold time 미지원 안내 표시 여부 */
  showSupportNotes?: boolean;
}

function Card({
  label,
  value,
  sub,
  valueClass,
  dim,
  showSupport,
}: {
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
  dim?: MetricDim;
  showSupport?: boolean;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-700 dark:bg-zinc-900">
      <div className="text-xs text-zinc-500 dark:text-zinc-400">{label}</div>
      <div className={`mt-1 text-lg font-semibold tabular-nums ${valueClass ?? "text-zinc-900 dark:text-zinc-100"}`}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-xs text-zinc-400">{sub}</div>}
      {showSupport && dim && <SupportLine dim={dim} />}
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
        <Card label="Net PnL (30일)" value={fmtUsd(m.totalNet)} valueClass={pnlColor(m.totalNet)} sub={`${m.closedCount.toLocaleString()}건`} dim="value" showSupport={showSupportNotes} />
        <Card label="가격손익" value={fmtUsd(m.totalPrice)} valueClass={pnlColor(m.totalPrice)} dim="value" showSupport={showSupportNotes} />
        <Card label="수수료" value={fmtUsd(m.totalFee)} valueClass={pnlColor(m.totalFee)} sub={toggles.includeFee ? "Net 반영" : "Net 제외"} dim="value" showSupport={showSupportNotes} />
        <Card label="펀딩" value={fmtUsd(m.totalFunding)} valueClass={pnlColor(m.totalFunding)} sub={toggles.includeFunding ? "Net 반영" : "Net 제외"} dim="value" showSupport={showSupportNotes} />
        <Card label="평균 PnL/건" value={fmtUsd(m.avgNet)} valueClass={pnlColor(m.avgNet)} dim="value" showSupport={showSupportNotes} />
        <Card label="이익 합" value={fmtUsd(m.profit)} valueClass="text-emerald-600 dark:text-emerald-400" dim="value" showSupport={showSupportNotes} />
        <Card label="손실 합" value={fmtUsd(m.loss)} valueClass="text-red-600 dark:text-red-400" dim="value" showSupport={showSupportNotes} />
        <Card
          label="승률 (정식)"
          value={m.winRateStrict !== null ? `${(m.winRateStrict * 100).toFixed(1)}%` : "—"}
          sub={m.winCountStrict !== null ? `승 ${m.winCountStrict} / 패 ${m.lossCountStrict}` : "포지션 단위 데이터 없음"}
          dim="winRateStrict"
          showSupport={showSupportNotes}
        />
        <Card
          label="승률 (근사 포함)"
          value={m.winRate !== null ? `${(m.winRate * 100).toFixed(1)}%` : "—"}
          sub={m.winCount !== null ? `승 ${m.winCount} / 패 ${m.lossCount}` : "포지션 단위 미지원"}
          dim="winRate"
          showSupport={showSupportNotes}
        />
      </div>

      {/* hold time */}
      {m.holdTime && (
        <div className="grid grid-cols-3 gap-3">
          <Card label="평균 보유시간" value={formatHoldTime(m.holdTime.overallAvg)} sub={`표본 ${m.holdTime.sampleCount}건`} dim="holdTime" showSupport={showSupportNotes} />
          <Card label="승 보유시간" value={formatHoldTime(m.holdTime.winAvg)} dim="holdTime" showSupport={showSupportNotes} />
          <Card label="패 보유시간" value={formatHoldTime(m.holdTime.lossAvg)} dim="holdTime" showSupport={showSupportNotes} />
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
            <Tooltip content={<DailyTooltip />} cursor={{ fill: "#8888881a" }} />
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
        <div className="mb-2 flex flex-wrap items-baseline gap-x-2">
          <h4 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            심볼별 PnL (상위 {topSymbols.length} / 전체 {m.bySymbol.length})
          </h4>
          {showSupportNotes && (
            <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
              지원: <span className="font-medium text-emerald-600 dark:text-emerald-400">All</span>
            </span>
          )}
        </div>
        {showSupportNotes && (
          <p className="mb-2 text-[11px] text-zinc-400 dark:text-zinc-500">
            ※ 거래소마다 심볼 표기가 달라(BTC-USDT / BTCUSDT / BTC_USDT / BTC 등) 같은 코인이 여러 행으로 분리됩니다.
            하나로 합치려면 거래소 간 심볼 매핑이 필요합니다(현재는 미적용 — 상황 파악 우선). 각 행 옆에 출처 거래소를 표기합니다.
          </p>
        )}
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
                  <td className="px-3 py-1.5 font-medium text-zinc-700 dark:text-zinc-300">
                    <span>{s.symbol || "—"}</span>
                    {showSupportNotes && s.exchanges.length > 0 && (
                      <span className="ml-2 inline-flex flex-wrap gap-1 align-middle">
                        {s.exchanges.map((ex) => (
                          <span
                            key={ex}
                            className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-[10px] font-normal text-zinc-500 dark:text-zinc-400"
                            style={{ backgroundColor: EXCHANGE_COLORS[ex] + "22" }}
                          >
                            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: EXCHANGE_COLORS[ex] }} />
                            {SHORT[ex]}
                          </span>
                        ))}
                      </span>
                    )}
                  </td>
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
