"use client";

import { useState } from "react";
import type { ExchangeId, ReconstructedPosition } from "@/lib/exchange-pnl/types";
import { EXCHANGES, EXCHANGE_COLORS, getExchange } from "@/lib/exchange-pnl/exchanges";
import { TRADE_DOCS } from "@/lib/exchange-pnl/tradeDocs";
import { fmtAmount } from "@/lib/exchange-pnl/format";
import { formatHoldTime } from "@/lib/exchange-pnl/metrics";
import { GROUP_LABEL } from "./MetricsPanel";

interface Entry {
  exchange: ExchangeId;
  positions: ReconstructedPosition[];
}

function pnlColor(n: number): string {
  if (n > 0) return "text-emerald-600 dark:text-emerald-400";
  if (n < 0) return "text-red-600 dark:text-red-400";
  return "text-zinc-500";
}

// ms → "MM-DD HH:MM" (UTC)
function fmtTime(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms <= 0) return "—";
  return new Date(ms).toISOString().slice(5, 16).replace("T", " ");
}

// 재구성 방식 문서 — 재구성이 필요한 거래소(네이티브 제외)만 표시
function ReconstructMethodDocs() {
  const docs = EXCHANGES.map((ex) => TRADE_DOCS[ex.id]).filter((d) => d.reconstruct.status !== "native");
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200">
        <p className="font-semibold">포지션 재구성 방식</p>
        <p className="mt-1 text-[13px] leading-relaxed">
          체결/트레이드 히스토리를 심볼별 시간순으로 재생해 <b>&quot;0→오픈→0 복귀&quot;</b>를 한 포지션(라운드트립)으로 묶으면
          <b> 승/패·승률·보유시간</b>을 산출할 수 있습니다(PnL 표시는 원장 net 그대로 유지). 스케일인·부분청산·재진입은
          같은 포지션, 플립은 청산+신규로 분리합니다. 공통 한계: 조회 범위 이전에 열린 포지션(<b>이월</b>)은 최초 진입 이력이 없어 <b>보유시간 미상</b>,
          retention/조회범위 제약, 헤지 모드는 방향키(positionSide/positionIdx)로 분리해야 정확합니다.
          <br />
          <span className="text-[12px] text-blue-600 dark:text-blue-300">
            ※ OKX·BingX·Bitget·Gate는 네이티브 포지션 히스토리를 직접 수집해 아래 표에 함께 표시합니다(재구성 아님 · 크기/체결수는 미제공 &apos;—&apos;).
          </span>
        </p>
      </div>
      <div className="flex flex-col gap-2">
        {docs.map((d) => {
          const ex = getExchange(d.id);
          const badge =
            d.reconstruct.status === "supported"
              ? { t: "지원", c: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300" }
              : { t: "구현 예정", c: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300" };
          return (
            <div key={d.id} className="rounded-lg border-l-4 bg-zinc-50 px-4 py-3 dark:bg-zinc-900" style={{ borderColor: EXCHANGE_COLORS[d.id] }}>
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{ex.name}</h4>
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${badge.c}`}>{badge.t}</span>
                <span className="font-mono text-[11px] text-zinc-400">{d.reconstruct.source}</span>
              </div>
              <p className="mt-1 text-[13px] text-zinc-600 dark:text-zinc-300">{d.reconstruct.detail}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

type Sel = ExchangeId | "all";

export default function PositionReconstruction({ entries }: { entries: Entry[] }) {
  const [sel, setSel] = useState<Sel | null>(null);
  const active: Sel | null = sel ?? (entries.length > 1 ? "all" : entries[0]?.exchange ?? null);
  const positions =
    active === "all"
      ? entries.flatMap((e) => e.positions)
      : (entries.find((e) => e.exchange === active)?.positions ?? null);

  return (
    <div className="flex flex-col gap-5">
      <ReconstructMethodDocs />
      {positions && active ? <ReconstructData entries={entries} active={active} onSelect={setSel} positions={positions} /> : (
        <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900">
          아직 재구성된 포지션이 없습니다.
          <ul className="mt-2 list-inside list-disc text-xs">
            <li>현재는 Hyperliquid만 재구성을 지원합니다 (지갑 주소 입력 후 수집).</li>
            <li>이 기능 추가 <b>이전</b>에 수집한 데이터에는 포지션 정보가 없습니다 → 해당 거래소를 <b>다시 수집</b>하세요.</li>
            <li>선택 기간에 체결이 없으면 재구성할 포지션도 없습니다.</li>
          </ul>
        </div>
      )}
    </div>
  );
}

function ReconstructData({
  entries,
  active,
  onSelect,
  positions: rawPositions,
}: {
  entries: Entry[];
  active: Sel;
  onSelect: (s: Sel) => void;
  positions: ReconstructedPosition[];
}) {
  const positions = [...rawPositions].sort(
    (a, b) => (b.closeTime ?? b.openTime ?? 0) - (a.closeTime ?? a.openTime ?? 0),
  );

  const th = "px-3 py-2 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400 whitespace-nowrap";
  const thL = "px-3 py-2 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 whitespace-nowrap";
  const td = "px-3 py-1.5 text-right tabular-nums whitespace-nowrap";

  return (
    <div className="flex flex-col gap-4">
      {/* 거래소 선택 (전체 + 개별) */}
      <div className="flex flex-wrap gap-2">
        {entries.length > 1 && (
          <button
            onClick={() => onSelect("all")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium ${
              active === "all" ? "bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900" : "border border-zinc-300 text-zinc-600 dark:border-zinc-600 dark:text-zinc-400"
            }`}
          >
            전체 ({entries.reduce((s, e) => s + e.positions.length, 0)})
          </button>
        )}
        {entries.map((e) => {
          const isActive = active === e.exchange;
          const native = TRADE_DOCS[e.exchange].reconstruct.status === "native";
          return (
            <button
              key={e.exchange}
              onClick={() => onSelect(e.exchange)}
              className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium ${
                isActive ? "text-white" : "border border-zinc-300 text-zinc-600 dark:border-zinc-600 dark:text-zinc-400"
              }`}
              style={isActive ? { backgroundColor: EXCHANGE_COLORS[e.exchange] } : undefined}
            >
              {getExchange(e.exchange).name} ({e.positions.length})
              <span
                className={`rounded px-1 py-px text-[9px] font-semibold ${
                  isActive
                    ? "bg-white/25"
                    : native
                      ? "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300"
                      : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300"
                }`}
                title={native ? "네이티브 포지션 히스토리 (재구성 아님)" : "체결 재생으로 재구성"}
              >
                {native ? "네이티브" : "재구성"}
              </span>
            </button>
          );
        })}
      </div>

      {/* 재구성/네이티브 범례 */}
      <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
        <span className="rounded bg-emerald-100 px-1 text-[9px] font-semibold text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">재구성</span> 체결 재생(크기·보유시간 정밀, HL·Bybit·Binance)
        {" · "}
        <span className="rounded bg-amber-100 px-1 text-[9px] font-semibold text-amber-700 dark:bg-amber-900 dark:text-amber-300">네이티브</span> 거래소 포지션 히스토리(크기 미제공, OKX·BingX·Bitget·Gate)
      </p>

      {/* 요약 */}
      <PositionSummary positions={positions} heading="포지션 지표 · 체결/포지션 히스토리 기반" />

      {/* 테이블 */}
      <div className="max-h-[600px] overflow-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
        <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
          <thead className="sticky top-0 bg-zinc-50 dark:bg-zinc-800">
            <tr>
              <th className={thL}>코인</th>
              <th className={thL}>방향</th>
              <th className={thL}>오픈 (UTC)</th>
              <th className={thL}>청산 (UTC)</th>
              <th className={th}>보유시간</th>
              <th className={th}>최대크기</th>
              <th className={th}>실현손익</th>
              <th className={th}>수수료</th>
              <th className={th}>펀딩</th>
              <th className={th}>Net</th>
              <th className={th}>승/패</th>
              <th className={th}>fills</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((p, i) => (
              <tr key={i} className="border-t border-zinc-100 dark:border-zinc-800">
                <td className="px-3 py-1.5 font-medium text-zinc-700 dark:text-zinc-300">
                  <span className="flex items-center gap-1.5">
                    {active === "all" && (
                      <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: EXCHANGE_COLORS[p.exchange] }} title={getExchange(p.exchange).name} />
                    )}
                    {p.coin}
                  </span>
                </td>
                <td className="px-3 py-1.5">
                  <span
                    className={`inline-flex items-center gap-0.5 rounded px-1 py-px text-[10px] font-bold leading-none ${
                      p.side === "long"
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300"
                        : "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"
                    }`}
                  >
                    {p.side === "long" ? "▲LONG" : "▼SHORT"}
                  </span>
                </td>
                <td className="px-3 py-1.5 text-left font-mono text-xs text-zinc-500">
                  {p.orphan ? (
                    <span className="text-amber-500 dark:text-amber-400" title="조회 범위 이전에 열려 최초 진입 이력이 데이터에 없음 (보유시간 미상)">이월</span>
                  ) : (
                    fmtTime(p.openTime)
                  )}
                </td>
                <td className="px-3 py-1.5 text-left font-mono text-xs text-zinc-500">
                  {p.open ? <span className="text-blue-500 dark:text-blue-400">진행중</span> : fmtTime(p.closeTime)}
                </td>
                <td className={`${td} text-zinc-500`}>{p.holdTimeMs !== null ? formatHoldTime(p.holdTimeMs) : "—"}</td>
                <td className={`${td} text-zinc-500`}>{p.maxSize > 0 ? p.maxSize.toLocaleString(undefined, { maximumFractionDigits: 8 }) : "—"}</td>
                <td className={`${td} ${pnlColor(p.pricePnl)}`}>{fmtAmount(p.pricePnl)}</td>
                <td className={`${td} ${pnlColor(p.fee)}`}>{fmtAmount(p.fee)}</td>
                <td className={`${td} ${pnlColor(p.funding)}`}>{fmtAmount(p.funding)}</td>
                <td className={`${td} font-semibold ${pnlColor(p.netPnl)}`}>{p.open ? "—" : fmtAmount(p.netPnl)}</td>
                <td className={td}>
                  {p.win === null ? (
                    <span className="text-zinc-400">—</span>
                  ) : p.win ? (
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">승</span>
                  ) : (
                    <span className="font-semibold text-red-600 dark:text-red-400">패</span>
                  )}
                </td>
                <td className={`${td} text-zinc-400`}>{p.fillCount > 0 ? p.fillCount : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// 포지션 요약 카드 (재구성 탭·합산보기 공용) — 청산 완료 포지션 기준
export function PositionSummary({ positions, heading }: { positions: ReconstructedPosition[]; heading?: string }) {
  const closed = positions.filter((p) => !p.open);
  // 통계 기준: 청산 완료 & 진입이력 있는(이월 아님) 포지션만. 이월(시작점 없음)·진행중은 제외.
  const statPos = closed.filter((p) => !p.orphan);
  const winPos = statPos.filter((p) => p.win === true);
  const lossPos = statPos.filter((p) => p.win === false);
  const winCount = winPos.length;
  const lossCount = lossPos.length;
  const wl = winCount + lossCount;
  const winRate = wl > 0 ? (winCount / wl) * 100 : null;
  const avgWin = winCount ? winPos.reduce((s, p) => s + p.netPnl, 0) / winCount : 0;
  const avgLoss = lossCount ? lossPos.reduce((s, p) => s + p.netPnl, 0) / lossCount : 0;
  const openCount = positions.filter((p) => p.open).length;
  const orphanCount = positions.filter((p) => p.orphan).length;

  const withHold = statPos.filter((p) => p.holdTimeMs !== null);
  const avgHold = (arr: ReconstructedPosition[]) =>
    arr.length ? arr.reduce((s, p) => s + (p.holdTimeMs ?? 0), 0) / arr.length : 0;
  const holdAll = avgHold(withHold);
  const holdWin = avgHold(withHold.filter((p) => p.win === true));
  const holdLoss = avgHold(withHold.filter((p) => p.win === false));

  return (
    <div className="flex flex-col gap-1.5">
      {heading && <div className={GROUP_LABEL}>{heading}</div>}
      <div className="flex flex-wrap gap-2.5">
        <SummaryCard label="집계 포지션" value={`${statPos.length}`} sub={`전체 ${positions.length} · 이월 ${orphanCount} · 진행중 ${openCount}`} />
        <SummaryCard label="승률" value={winRate !== null ? `${winRate.toFixed(1)}%` : "—"} sub={`${winCount}승 / ${lossCount}패`} />
        <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900">
          <div className="text-[13px] font-semibold text-zinc-700 dark:text-zinc-200">Avg Win / Loss</div>
          <div className="mt-0.5 space-y-0.5">
            <MiniRow label="Avg Win" value={winCount ? fmtAmount(avgWin) : "—"} valueClass="text-emerald-600 dark:text-emerald-400" />
            <MiniRow label="Avg Loss" value={lossCount ? fmtAmount(avgLoss) : "—"} valueClass="text-red-600 dark:text-red-400" />
          </div>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900">
          <div className="text-[13px] font-semibold text-zinc-700 dark:text-zinc-200">평균 보유시간</div>
          <div className="mt-0.5 space-y-0.5">
            <MiniRow label="전체" value={withHold.length ? formatHoldTime(holdAll) : "—"} />
            <MiniRow label="승" value={holdWin ? formatHoldTime(holdWin) : "—"} valueClass="text-emerald-600 dark:text-emerald-400" />
            <MiniRow label="패" value={holdLoss ? formatHoldTime(holdLoss) : "—"} valueClass="text-red-600 dark:text-red-400" />
          </div>
        </div>
      </div>
      <p className="text-[11px] leading-snug text-zinc-400 dark:text-zinc-500">
        ※ 승률·Avg Win/Loss·평균 보유시간은 <b>청산 완료 & 진입이력 있는</b> 포지션만 집계합니다 (진입이력 없는 <b>이월</b>·미청산 <b>진행중</b>은 제외). 승/패는 <b>수수료·펀딩이 반영된 net</b> 기준(net &gt; 0 = 승). PnL 합계는 합산/거래소별 탭의 &apos;손익 지표(원장 net)&apos;를 참고하세요.
      </p>
    </div>
  );
}

function MiniRow({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[11px] text-zinc-400">{label}</span>
      <span className={`text-sm font-semibold tabular-nums ${valueClass ?? "text-zinc-700 dark:text-zinc-200"}`}>{value}</span>
    </div>
  );
}

function SummaryCard({ label, value, sub, valueClass }: { label: string; value: string; sub?: string; valueClass?: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900">
      <div className="text-[13px] font-semibold text-zinc-700 dark:text-zinc-200">{label}</div>
      <div className={`mt-0.5 text-base font-semibold tabular-nums ${valueClass ?? "text-zinc-900 dark:text-zinc-100"}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[10px] text-zinc-400">{sub}</div>}
    </div>
  );
}
