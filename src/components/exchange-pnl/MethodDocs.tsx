"use client";

import { useState } from "react";
import type { ExchangeId, ExchangeMeta } from "@/lib/exchange-pnl/types";
import { EXCHANGES, EXCHANGE_COLORS, getExchange } from "@/lib/exchange-pnl/exchanges";
import { EXCHANGE_DOCS } from "@/lib/exchange-pnl/docs";

function tierBadge(tier: string): string {
  if (tier === "A") return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300";
  if (tier === "A-") return "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300";
  return "bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300";
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">{title}</h4>
      {children}
    </div>
  );
}

type ActiveTab = ExchangeId | "summary";

const UNIT_LABEL: Record<string, string> = {
  position: "포지션",
  closing_order: "청산오더",
  income: "원장(income)",
  fill: "체결(fill)",
};

// 매트릭스 셀: ✅ 가능 / △ 근사 / ✗ 불가
function CapCell({ value }: { value: boolean | "yes" | "approx" | "no" }) {
  const yes = value === true || value === "yes";
  const approx = value === "approx";
  if (yes)
    return <span className="font-semibold text-emerald-600 dark:text-emerald-400">✅</span>;
  if (approx)
    return (
      <span className="font-semibold text-amber-600 dark:text-amber-400" title="근사만 가능">
        △
      </span>
    );
  return <span className="font-semibold text-zinc-300 dark:text-zinc-600">✗</span>;
}

const CAPS: { key: keyof ExchangeMeta["supports"]; label: string }[] = [
  { key: "daily", label: "일별 PnL" },
  { key: "last30d", label: "30일 합계·평균" },
  { key: "bySymbol", label: "심볼별 PnL" },
  { key: "holdTime", label: "보유시간" },
  { key: "positionWinLoss", label: "포지션 승/패 수" },
  { key: "winRate", label: "승률" },
];

function SummaryComparison() {
  const thCls =
    "whitespace-nowrap px-3 py-2 text-center text-[11px] font-medium text-zinc-500 dark:text-zinc-400";
  const tdCls = "whitespace-nowrap px-3 py-2 text-center text-sm";

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-zinc-600 dark:text-zinc-300">
        7개 거래소에서 수집 방식별로 <strong>알 수 있는 지표(✅)</strong>와{" "}
        <strong>모르는 지표(✗)</strong>, <strong>근사만 가능한 지표(△)</strong>를 한 표로
        정리했습니다. 등급 A→A-→B 순으로 포지션 단위 정보가 점점 줄어듭니다.{" "}
        <strong>펀딩(funding)</strong>은 모든 거래소에서 수집하지만, 수집 단위 row에{" "}
        <strong>포함</strong>되는 곳과 <strong>별도 소스</strong>(Bybit·Hyperliquid)에서
        따로 가져오는 곳이 나뉩니다.
      </p>

      {/* 지표 매트릭스 */}
      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
        <table className="w-full border-collapse">
          <thead className="bg-zinc-50 dark:bg-zinc-800">
            <tr>
              <th className={`${thCls} sticky left-0 z-10 bg-zinc-50 text-left dark:bg-zinc-800`}>
                거래소
              </th>
              <th className={thCls}>수집 단위</th>
              <th className={`${thCls} text-left`}>펀딩(funding) 소스</th>
              {CAPS.map((c) => (
                <th key={c.key} className={thCls}>
                  {c.label}
                </th>
              ))}
              <th className={`${thCls} text-left`}>보존기간</th>
            </tr>
          </thead>
          <tbody>
            {EXCHANGES.map((ex) => (
              <tr
                key={ex.id}
                className="border-t border-zinc-100 dark:border-zinc-800"
              >
                <th
                  scope="row"
                  className="sticky left-0 z-10 whitespace-nowrap bg-white px-3 py-2 text-left dark:bg-zinc-900"
                >
                  <span className="flex items-center gap-1.5">
                    <span
                      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: EXCHANGE_COLORS[ex.id] }}
                    />
                    <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                      {ex.name}
                    </span>
                    <span
                      className={`rounded px-1 text-[10px] font-semibold ${tierBadge(ex.tier)}`}
                    >
                      {ex.tier}
                    </span>
                  </span>
                </th>
                <td className={`${tdCls} text-zinc-600 dark:text-zinc-400`}>
                  {UNIT_LABEL[ex.unit] ?? ex.unit}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-left">
                  <span className="flex items-center gap-1.5">
                    <span
                      className={`rounded px-1 text-[10px] font-semibold ${
                        EXCHANGE_DOCS[ex.id].fundingSource.kind === "separate"
                          ? "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300"
                          : "bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300"
                      }`}
                    >
                      {EXCHANGE_DOCS[ex.id].fundingSource.kind === "separate"
                        ? "별도 소스"
                        : "포함"}
                    </span>
                    <span className="text-xs text-zinc-600 dark:text-zinc-400">
                      {EXCHANGE_DOCS[ex.id].fundingSource.label}
                    </span>
                  </span>
                </td>
                {CAPS.map((c) => (
                  <td key={c.key} className={tdCls}>
                    <CapCell value={ex.supports[c.key]} />
                  </td>
                ))}
                <td className="whitespace-nowrap px-3 py-2 text-left text-xs text-zinc-600 dark:text-zinc-400">
                  {ex.retentionLabel}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 범례 */}
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
        <span><span className="font-semibold text-emerald-600 dark:text-emerald-400">✅</span> 가능</span>
        <span><span className="font-semibold text-amber-600 dark:text-amber-400">△</span> 근사만 가능</span>
        <span><span className="font-semibold text-zinc-400 dark:text-zinc-500">✗</span> 불가(모름)</span>
        <span className="text-zinc-400 dark:text-zinc-500">|</span>
        <span><span className={`rounded px-1 ${tierBadge("A")}`}>A</span> 포지션 히스토리(완전)</span>
        <span><span className={`rounded px-1 ${tierBadge("A-")}`}>A-</span> 청산오더 단위(근사)</span>
        <span><span className={`rounded px-1 ${tierBadge("B")}`}>B</span> 원장/체결 합산</span>
        <span className="text-zinc-400 dark:text-zinc-500">|</span>
        <span><span className="rounded bg-zinc-200 px-1 text-[10px] font-semibold text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">포함</span> 펀딩이 수집 row에 포함</span>
        <span><span className="rounded bg-amber-100 px-1 text-[10px] font-semibold text-amber-700 dark:bg-amber-900 dark:text-amber-300">별도 소스</span> 펀딩을 별도 호출/원장으로 수집</span>
      </div>

      {/* 거래소별 핵심 한계 (모르는 것의 이유) */}
      <Section title="거래소별 핵심 한계 (✗·△인 이유)">
        <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700">
          <table className="w-full text-sm">
            <tbody>
              {EXCHANGES.map((ex) => {
                const doc = EXCHANGE_DOCS[ex.id];
                return (
                  <tr
                    key={ex.id}
                    className="border-t border-zinc-100 align-top first:border-t-0 dark:border-zinc-800"
                  >
                    <th
                      scope="row"
                      className="w-32 whitespace-nowrap px-3 py-2 text-left align-top"
                    >
                      <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                        {ex.name}
                      </span>
                    </th>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {doc.unknowable.length === 0 ? (
                        <span className="text-emerald-600 dark:text-emerald-400">
                          — 모든 지표 수집 가능 (한계 없음)
                        </span>
                      ) : (
                        <ul className="space-y-0.5 text-[13px]">
                          {doc.unknowable.map((u, i) => (
                            <li key={i}>· {u}</li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

export default function MethodDocs() {
  const [active, setActive] = useState<ActiveTab>("summary");
  const isSummary = active === "summary";
  const meta = isSummary ? null : getExchange(active);
  const doc = isSummary ? null : EXCHANGE_DOCS[active];
  const color = isSummary ? undefined : EXCHANGE_COLORS[active];

  return (
    <div className="flex flex-col gap-5">
      {/* 거래소 선택 */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setActive("summary")}
          className={`rounded-md px-3 py-1.5 text-xs font-medium ${
            isSummary
              ? "bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900"
              : "border border-zinc-300 text-zinc-600 dark:border-zinc-600 dark:text-zinc-400"
          }`}
        >
          📊 종합 비교
        </button>
        {EXCHANGES.map((ex) => (
          <button
            key={ex.id}
            onClick={() => setActive(ex.id)}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium ${
              active === ex.id
                ? "text-white"
                : "border border-zinc-300 text-zinc-600 dark:border-zinc-600 dark:text-zinc-400"
            }`}
            style={active === ex.id ? { backgroundColor: EXCHANGE_COLORS[ex.id] } : undefined}
          >
            {ex.name}
            <span className={`rounded px-1 text-[10px] ${active === ex.id ? "bg-white/20" : tierBadge(ex.tier)}`}>
              {ex.tier}
            </span>
          </button>
        ))}
      </div>

      {isSummary || !meta || !doc ? (
        <SummaryComparison />
      ) : (
        <>

      {/* 헤더 */}
      <div className="rounded-lg border-l-4 bg-zinc-50 px-4 py-3 dark:bg-zinc-900" style={{ borderColor: color }}>
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{meta.name}</h3>
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${tierBadge(meta.tier)}`}>{meta.tier}</span>
        </div>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{doc.classification}</p>
        <p className="mt-1 font-mono text-[11px] text-zinc-400">{meta.endpoint}</p>
      </div>

      {/* 수집 흐름 + 다이어그램 */}
      <Section title="수집 흐름">
        <ol className="mb-3 list-decimal space-y-1 pl-5 text-sm text-zinc-600 dark:text-zinc-300">
          {doc.flow.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
        <pre className="overflow-x-auto rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3 text-[11px] leading-snug text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
          {doc.diagram}
        </pre>
      </Section>

      {/* 가져오는 데이터 (필드 매핑) */}
      <Section title="가져오는 데이터 → 정규화 매핑">
        <div className="overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-700">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-xs text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2 text-left">원본 필드</th>
                <th className="px-3 py-2 text-left">정규화 / 의미</th>
              </tr>
            </thead>
            <tbody>
              {doc.fields.map((f, i) => (
                <tr key={i} className="border-t border-zinc-100 dark:border-zinc-800">
                  <td className="px-3 py-1.5 font-mono text-[12px] text-zinc-700 dark:text-zinc-300">{f.raw}</td>
                  <td className="px-3 py-1.5 text-zinc-600 dark:text-zinc-400">{f.norm}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          <span className="font-medium">PnL 정의:</span> {doc.pnlDef}
        </p>
      </Section>

      {/* 알 수 있는 것 / 모르는 것 */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-900 dark:bg-emerald-950/40">
          <h4 className="mb-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300">✅ 알 수 있는 것</h4>
          <ul className="space-y-1 text-sm text-emerald-800 dark:text-emerald-300">
            {doc.knowable.map((k, i) => (
              <li key={i}>· {k}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900 dark:bg-red-950/40">
          <h4 className="mb-2 text-sm font-semibold text-red-700 dark:text-red-300">❌ 모르는 것 (이유)</h4>
          {doc.unknowable.length === 0 ? (
            <p className="text-sm text-red-800 dark:text-red-300">— 없음 (모든 지표 수집 가능)</p>
          ) : (
            <ul className="space-y-1 text-sm text-red-800 dark:text-red-300">
              {doc.unknowable.map((u, i) => (
                <li key={i}>· {u}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* 메타 정보 */}
      <Section title="인증 · 보존 · Rate limit · 주의">
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[7rem_1fr]">
          <dt className="font-medium text-zinc-500 dark:text-zinc-400">인증</dt>
          <dd className="text-zinc-700 dark:text-zinc-300">{doc.auth}</dd>
          <dt className="font-medium text-zinc-500 dark:text-zinc-400">보존기간</dt>
          <dd className="text-zinc-700 dark:text-zinc-300">{doc.retention}</dd>
          <dt className="font-medium text-zinc-500 dark:text-zinc-400">Rate limit</dt>
          <dd className="text-zinc-700 dark:text-zinc-300">{doc.rateLimit}</dd>
          <dt className="font-medium text-zinc-500 dark:text-zinc-400">주의사항</dt>
          <dd className="text-zinc-700 dark:text-zinc-300">
            <ul className="space-y-1">
              {doc.caveats.map((c, i) => (
                <li key={i}>· {c}</li>
              ))}
            </ul>
          </dd>
        </dl>
      </Section>
        </>
      )}
    </div>
  );
}
