"use client";

import { Fragment } from "react";
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
import { computeMetrics, formatHoldTime, type PnlToggles, type DailyPoint, type DailyEntry } from "@/lib/exchange-pnl/metrics";
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

// ms → HH:MM:SS (UTC). 그룹에 여러 건이면 최초~최종 범위로.
function closeTimeLabel(min: number, max: number): string {
  if (!Number.isFinite(min) || max <= 0) return "";
  const hms = (ms: number) => new Date(ms).toISOString().slice(11, 19);
  return min === max ? `${hms(max)} UTC` : `${hms(min)}–${hms(max)} UTC`;
}

// long/short 화살표 배지
function SideBadge({ side }: { side: "long" | "short" }) {
  const long = side === "long";
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded px-1 py-px text-[10px] font-bold leading-none ${
        long
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300"
          : "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"
      }`}
    >
      {long ? "▲" : "▼"}
      {long ? "LONG" : "SHORT"}
    </span>
  );
}

// 일별 차트 hover 시 그 날짜 내역을 거래소·심볼별로, 가격손익/수수료/펀딩/Net 구분해 표시
function DailyTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: DailyPoint }> }) {
  if (!active || !payload?.length) return null;
  const dp = payload[0].payload;
  const entries = dp.entries ?? [];
  const num = (n: number) => `px-3 py-2 text-right align-middle tabular-nums ${pnlColor(n)}`;

  // 거래소별로 묶기 (entries는 이미 거래소 표준순서로 정렬돼 있어 연속됨)
  const groups: { exchange: ExchangeId; items: DailyEntry[] }[] = [];
  for (const e of entries) {
    const last = groups[groups.length - 1];
    if (last && last.exchange === e.exchange) last.items.push(e);
    else groups.push({ exchange: e.exchange, items: [e] });
  }
  const PER_EX = 10; // 거래소당 상세 표시 상한
  const showSubtotals = groups.length > 1; // 거래소 1개면 전체합계와 중복이라 생략
  const sumEntries = (items: DailyEntry[]) =>
    items.reduce(
      (a, e) => ({
        pricePnl: a.pricePnl + e.pricePnl,
        fee: a.fee + e.fee,
        funding: a.funding + e.funding,
        net: a.net + e.net,
        count: a.count + e.count,
      }),
      { pricePnl: 0, fee: 0, funding: 0, net: 0, count: 0 },
    );

  return (
    <div className="min-w-[34rem] max-w-2xl rounded-lg border border-zinc-200 bg-white text-xs shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
      {/* 헤더 */}
      <div className="flex items-baseline justify-between gap-4 border-b border-zinc-200 px-4 py-2.5 dark:border-zinc-700">
        <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{dp.date}</span>
        <span className="text-sm">
          <span className="text-zinc-400">Net </span>
          <span className={`font-bold tabular-nums ${pnlColor(dp.net)}`}>{fmtUsd(dp.net)}</span>
        </span>
      </div>

      {entries.length === 0 ? (
        <div className="px-4 py-3 text-zinc-400">내역 없음</div>
      ) : (
        <table className="w-full border-collapse">
          <thead className="text-[10px] uppercase tracking-wide text-zinc-400">
            <tr className="border-b border-zinc-200 dark:border-zinc-700">
              <th className="px-4 py-1.5 text-left font-medium">거래소 · 심볼</th>
              <th className="px-3 py-1.5 text-right font-medium">손익</th>
              <th className="px-3 py-1.5 text-right font-medium">수수료</th>
              <th className="px-3 py-1.5 text-right font-medium">펀딩</th>
              <th className="px-3 py-1.5 text-right font-medium">Net</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {groups.map((g) => {
              const items = g.items.slice(0, PER_EX);
              const hidden = g.items.length - items.length;
              const sub = sumEntries(g.items);
              return (
                <Fragment key={g.exchange}>
                  {items.map((e, i) => (
                    <tr key={i} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                      <td className="px-4 py-2 align-middle">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: EXCHANGE_COLORS[e.exchange] }} />
                          <span className="text-zinc-400">{SHORT[e.exchange]}</span>
                          <span className="font-medium text-zinc-700 dark:text-zinc-200">{e.symbol || "—"}</span>
                          {e.side && <SideBadge side={e.side} />}
                          {e.leverage && (
                            <span className="rounded bg-zinc-100 px-1 py-px text-[10px] font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                              {e.leverage}x
                            </span>
                          )}
                          {e.count > 1 && <span className="text-[10px] text-zinc-400">·{e.count}건</span>}
                        </div>
                        {closeTimeLabel(e.minClose, e.maxClose) && (
                          <div className="mt-0.5 pl-3.5 text-[10px] text-zinc-400">
                            <span className="text-zinc-400">Closed </span>
                            <span className="font-mono">{closeTimeLabel(e.minClose, e.maxClose)}</span>
                          </div>
                        )}
                      </td>
                      <td className={num(e.pricePnl)}>{fmtUsd(e.pricePnl)}</td>
                      <td className={num(e.fee)}>{fmtUsd(e.fee)}</td>
                      <td className={num(e.funding)}>{fmtUsd(e.funding)}</td>
                      <td className={`px-3 py-2 text-right align-middle font-semibold tabular-nums ${pnlColor(e.net)}`}>{fmtUsd(e.net)}</td>
                    </tr>
                  ))}
                  {hidden > 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-1 text-[10px] text-zinc-400">… {SHORT[g.exchange]} 외 {hidden}종목 (소계에 포함)</td>
                    </tr>
                  )}
                  {showSubtotals && (
                    <tr className="border-t border-zinc-200 bg-zinc-50/80 dark:border-zinc-700 dark:bg-zinc-800/40">
                      <td className="px-4 py-1.5 align-middle">
                        <span className="flex items-center gap-1.5">
                          <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: EXCHANGE_COLORS[g.exchange] }} />
                          <span className="font-medium text-zinc-500 dark:text-zinc-400">{SHORT[g.exchange]} 소계</span>
                          <span className="text-[10px] text-zinc-400">·{sub.count}건</span>
                        </span>
                      </td>
                      <td className={`${num(sub.pricePnl)} font-medium`}>{fmtUsd(sub.pricePnl)}</td>
                      <td className={`${num(sub.fee)} font-medium`}>{fmtUsd(sub.fee)}</td>
                      <td className={`${num(sub.funding)} font-medium`}>{fmtUsd(sub.funding)}</td>
                      <td className={`px-3 py-1.5 text-right align-middle font-semibold tabular-nums ${pnlColor(sub.net)}`}>{fmtUsd(sub.net)}</td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-zinc-300 bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800">
              <td className="px-4 py-2 font-semibold text-zinc-600 dark:text-zinc-300">전체 합계</td>
              <td className={`${num(dp.pricePnl)} font-semibold`}>{fmtUsd(dp.pricePnl)}</td>
              <td className={`${num(dp.fee)} font-semibold`}>{fmtUsd(dp.fee)}</td>
              <td className={`${num(dp.funding)} font-semibold`}>{fmtUsd(dp.funding)}</td>
              <td className={`px-3 py-2 text-right font-bold tabular-nums ${pnlColor(dp.net)}`}>{fmtUsd(dp.net)}</td>
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
  /** 조회 기간(ms). 주어지면 일별 차트에 거래 없는 날도 포함해 기간 전체 표시 */
  range?: { start: number; end: number };
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
    <div className={CARD_CLS}>
      <div className={CARD_LABEL}>{label}</div>
      <div className={`mt-0.5 text-base font-semibold tabular-nums ${valueClass ?? "text-zinc-900 dark:text-zinc-100"}`}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[10px] text-zinc-400">{sub}</div>}
      {showSupport && dim && <SupportLine dim={dim} />}
    </div>
  );
}

const CARD_CLS = "rounded-lg border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900";
const CARD_LABEL = "text-[11px] font-medium text-zinc-500 dark:text-zinc-400";

// 한 카드에 여러 (라벨: 값) 줄을 넣는 미니 행
function MiniRow({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[11px] text-zinc-400">{label}</span>
      <span className={`text-sm font-semibold tabular-nums ${valueClass ?? "text-zinc-700 dark:text-zinc-200"}`}>{value}</span>
    </div>
  );
}

export default function MetricsPanel({ rows, toggles, showSupportNotes, range }: Props) {
  // React Compiler가 자동 메모이즈 (수동 useMemo는 컴파일러와 충돌)
  const m = computeMetrics(rows, toggles, range);

  if (rows.length === 0) {
    return <p className="text-sm text-zinc-400">데이터가 없습니다.</p>;
  }

  const topSymbols = m.bySymbol.slice(0, 30);

  return (
    <div className="flex flex-col gap-5">
      {/* 요약 카드 (8개 · 컴팩트) */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
        <Card label="Net PnL" value={fmtUsd(m.totalNet)} valueClass={pnlColor(m.totalNet)} sub={`${m.closedCount.toLocaleString()}건`} dim="value" showSupport={showSupportNotes} />
        <Card label="가격손익" value={fmtUsd(m.totalPrice)} valueClass={pnlColor(m.totalPrice)} dim="value" showSupport={showSupportNotes} />
        <Card label="수수료" value={fmtUsd(m.totalFee)} valueClass={pnlColor(m.totalFee)} sub={toggles.includeFee ? "Net 반영" : "Net 제외"} dim="value" showSupport={showSupportNotes} />
        <Card label="펀딩" value={fmtUsd(m.totalFunding)} valueClass={pnlColor(m.totalFunding)} sub={toggles.includeFunding ? "Net 반영" : "Net 제외"} dim="value" showSupport={showSupportNotes} />
        <Card label="평균 PnL/건" value={fmtUsd(m.avgNet)} valueClass={pnlColor(m.avgNet)} dim="value" showSupport={showSupportNotes} />

        {/* 이익 / 손실 */}
        <div className={CARD_CLS}>
          <div className={CARD_LABEL}>이익 / 손실</div>
          <div className="mt-0.5 space-y-0.5">
            <MiniRow label="이익" value={fmtUsd(m.profit)} valueClass="text-emerald-600 dark:text-emerald-400" />
            <MiniRow label="손실" value={fmtUsd(m.loss)} valueClass="text-red-600 dark:text-red-400" />
          </div>
          {showSupportNotes && <SupportLine dim="value" />}
        </div>

        {/* 승률 (정식 / 근사) */}
        <div className={CARD_CLS}>
          <div className={CARD_LABEL}>승률</div>
          <div className="mt-0.5 space-y-0.5">
            <MiniRow
              label="정식"
              value={
                m.winRateStrict !== null
                  ? `${(m.winRateStrict * 100).toFixed(1)}% (${m.winCountStrict}/${m.lossCountStrict})`
                  : "—"
              }
            />
            <MiniRow
              label="근사"
              value={
                m.winRate !== null ? `${(m.winRate * 100).toFixed(1)}% (${m.winCount}/${m.lossCount})` : "—"
              }
            />
          </div>
          {showSupportNotes && <SupportLine dim="winRate" />}
        </div>

        {/* 보유시간 (전체 / 승 / 패) */}
        <div className={CARD_CLS}>
          <div className={CARD_LABEL}>보유시간</div>
          {m.holdTime ? (
            <div className="mt-0.5 space-y-0.5">
              <MiniRow label="전체" value={formatHoldTime(m.holdTime.overallAvg)} />
              <MiniRow label="승" value={formatHoldTime(m.holdTime.winAvg)} valueClass="text-emerald-600 dark:text-emerald-400" />
              <MiniRow label="패" value={formatHoldTime(m.holdTime.lossAvg)} valueClass="text-red-600 dark:text-red-400" />
            </div>
          ) : (
            <div className="mt-0.5 text-base font-semibold text-zinc-400">—</div>
          )}
          {showSupportNotes && <SupportLine dim="holdTime" />}
        </div>
      </div>

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
