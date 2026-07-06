"use client";

import { useState } from "react";
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
import { fmtAmount } from "@/lib/exchange-pnl/format";

// ── WAS 환경 ────────────────────────────────────────────────────────────────
// 테스트용 JWT (Local/Dev 편의). Staging/Production은 직접 입력.
const TEST_JWT =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJHYXRlaW8iOiIxMjQxODE5OSIsIkh5cGVybGlxdWlkIjoiMHgzYjVlNzlhMDVlN2U0YjFhOGQ3YmNmMTUzZWVhYWJkNTIwZDViN2JhIiwidmVyc2lvbiI6InRlc3QiLCJPS1giOiI2NDQ3OTQ2MTg0NTQxNTMzNTIiLCJtYXN0ZXIiOiIweDNiNWU3OWEwNWU3ZTRiMWE4ZDdiY2YxNTNlZWFhYmQ1MjBkNWI3YmEiLCJleHAiOjE4MDcwODg5MTJ9.rI0tVHzIIZIs_Ots6t03xZEiPQUO8lKGLRjA9pDs5U4";

// Local 전용 테스트 JWT (다수 거래소 uid 포함)
const LOCAL_JWT =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJHYXRlaW8iOiIxMjQxODE5OSIsIkJpdGdldCI6IjMzMTY2MjUzODciLCJCaW5hbmNlIjoiNTcxMDc2NTciLCJIeXBlcmxpcXVpZCI6IjB4NWQ1YmVkYTdhOWRkMjAwZDZhYzhkYzQ0NmQ5NDE1OGE5ZDBkMTZkNiIsIkJpbmdYIjoiMzc2NDcyNzUiLCJCeWJpdCI6IjUzMjQ3MTQ5IiwidmVyc2lvbiI6InRlc3QiLCJPS1giOiI2NDQ3OTQ2MTg0NTQxNTMzNTIiLCJtYXN0ZXIiOiIweDVkNWJlZGE3YTlkZDIwMGQ2YWM4ZGM0NDZkOTQxNThhOWQwZDE2ZDYiLCJleHAiOjE4MTQ4NTc5NzN9.2roL7hHH8UJJh11FTLp2eDQQcOEuFsBuTIfEwwUZf2Y";

const WAS_ENVS: { label: string; url: string; defaultJwt: string }[] = [
  { label: "Local", url: "http://localhost:8080", defaultJwt: LOCAL_JWT },
  { label: "Dev", url: "https://pnl-dev.supercycl.io", defaultJwt: TEST_JWT },
  { label: "Staging", url: "https://pnl-stg.supercycl.io", defaultJwt: "" },
  { label: "Production", url: "https://pnl.supercycl.io", defaultJwt: "" },
];

// pnl2 지원 거래소 (응답/필터 표기 순서 고정)
const SUPPORTED_EXCHANGES = [
  "Hyperliquid",
  "Bitget",
  "Gateio",
  "Bybit",
  "OKX",
  "Binance",
  "BingX",
] as const;

// ── 응답 타입 ────────────────────────────────────────────────────────────────
interface WasResponse<T> {
  retCode: number;
  retMessage?: string;
  result: T;
}

interface SyncStatusItem {
  exchange: string;
  lastUpdatedTime: string | null;
}

interface KeyStatusItem {
  exchange: string;
  uid: string | null;
  apiKey: string;
  updatedAt: string;
}

interface KeyStatusResult {
  initialized: boolean;
  exchanges: KeyStatusItem[];
}

interface PositionMetrics {
  countedPositions: number;
  totalPositions: number;
  orphanPositions: number;
  openPositions: number;
  winCount: number;
  lossCount: number;
  winRate: number | null;
  avgWin: number | null;
  avgLoss: number | null;
  avgHoldTimeMs: number | null;
  avgWinHoldTimeMs: number | null;
  avgLossHoldTimeMs: number | null;
}

interface PnlMetrics {
  netPnl: number;
  pricePnl: number;
  fee: number;
  funding: number;
  rowCount: number;
  tradeCount: number;
  avgPnlPerRow: number | null;
  profitSum: number;
  lossSum: number;
}

interface OverviewResult {
  startDate: string;
  endDate: string;
  exchanges: string[];
  syncStatus: SyncStatusItem[];
  positionMetrics: PositionMetrics;
  pnlMetrics: PnlMetrics;
}

interface DailyDetailItem {
  exchange: string;
  symbol: string;
  /** 거래소 마켓 표기 그대로 (예: BTC-USDT-SWAP) */
  marketSymbol?: string;
  pricePnl: number;
  fee: number;
  funding: number;
  netPnl: number;
  rowCount: number;
  tradeCount: number;
}

interface DailyItem {
  date: string;
  pricePnl: number;
  fee: number;
  funding: number;
  netPnl: number;
  rowCount: number;
  tradeCount: number;
  detail?: DailyDetailItem[];
}

interface DailyResult {
  startDate: string;
  endDate: string;
  exchanges: string[];
  syncStatus: SyncStatusItem[];
  days: DailyItem[];
}

interface SymbolItem {
  symbol: string;
  pricePnl: number;
  fee: number;
  funding: number;
  netPnl: number;
  rowCount: number;
  tradeCount: number;
  exchanges: string[];
}

interface SymbolsResult {
  startDate: string;
  endDate: string;
  exchanges: string[];
  syncStatus: SyncStatusItem[];
  symbols: SymbolItem[];
}

interface StatusItem {
  exchange: string;
  lastUpdatedTime: string | null;
  backfillDone: boolean;
  collecting: boolean;
}

interface StatusResult {
  exchanges: StatusItem[];
}

// ── 헬퍼 ─────────────────────────────────────────────────────────────────────
const fmtUsd = fmtAmount;

function pnlColor(n: number): string {
  if (n > 0) return "text-emerald-600 dark:text-emerald-400";
  if (n < 0) return "text-red-600 dark:text-red-400";
  return "text-zinc-500";
}

/** UTC 기준 yyyy-MM-dd */
function toUtcDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// 2025년 1월부터 현재(UTC) 월까지의 월별 조회 옵션 (최신월 먼저)
function monthOptions(): { value: string; label: string; start: string; end: string }[] {
  const now = new Date();
  const endY = now.getUTCFullYear();
  const endM = now.getUTCMonth() + 1; // 1~12
  const opts: { value: string; label: string; start: string; end: string }[] = [];
  for (let y = 2025; y <= endY; y++) {
    const mEnd = y === endY ? endM : 12;
    for (let m = 1; m <= mEnd; m++) {
      const mm = String(m).padStart(2, "0");
      const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
      opts.push({
        value: `${y}-${mm}`,
        label: `${y}년 ${m}월`,
        start: `${y}-${mm}-01`,
        end: `${y}-${mm}-${String(lastDay).padStart(2, "0")}`,
      });
    }
  }
  return opts.reverse();
}

/** ms → "1일 2시간 3분" / null → "—" */
function fmtDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  const totalMin = Math.round(ms / 60000);
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}일`);
  if (h > 0) parts.push(`${h}시간`);
  parts.push(`${m}분`);
  return parts.join(" ");
}

function fmtPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(2)}%`;
}

function fmtInt(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString();
}

const RET_CODE_MSG: Record<number, string> = {
  1000: "파라미터 오류",
  1003: "Access Token 만료",
  1004: "유효하지 않은 Access Token",
  1005: "Access Token 없음",
  9999: "정의되지 않은 서버 오류",
};

// ── 컴포넌트 ─────────────────────────────────────────────────────────────────
export default function ExchangePnlWas() {
  const [wasUrl, setWasUrl] = useState(WAS_ENVS[0].url);
  const [jwt, setJwt] = useState(WAS_ENVS[0].defaultJwt);

  // API-Key 목록
  const [keyStatus, setKeyStatus] = useState<KeyStatusResult | null>(null);
  // 거래소별 마지막 수집 시각 (/v1/pnl2/status 기반)
  const [keySyncTimes, setKeySyncTimes] = useState<Record<string, string | null>>({});
  const [keyLoading, setKeyLoading] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);

  // 조회 파라미터
  const today = new Date();
  const defaultEnd = toUtcDate(today);
  const defaultStart = toUtcDate(new Date(today.getTime() - 29 * 86400000));
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [monthSel, setMonthSel] = useState(""); // "" = 직접 선택
  const months = monthOptions();
  const [exFilter, setExFilter] = useState<string[]>([]); // 빈 배열 = 전체

  // PNL 결과
  const [overview, setOverview] = useState<OverviewResult | null>(null);
  const [daily, setDaily] = useState<DailyResult | null>(null);
  const [symbols, setSymbols] = useState<SymbolsResult | null>(null);
  // rawSymbol=true — 거래소 표기 그대로 (정규화 머지와 비교용)
  const [symbolsRaw, setSymbolsRaw] = useState<SymbolsResult | null>(null);
  const [status, setStatus] = useState<StatusResult | null>(null);
  const [pnlLoading, setPnlLoading] = useState(false);
  const [pnlError, setPnlError] = useState<string | null>(null);

  // 공통 WAS GET
  async function wasGet<T>(
    path: string,
    params?: Record<string, string | undefined>,
  ): Promise<WasResponse<T>> {
    const url = new URL(wasUrl.replace(/\/$/, "") + path);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v != null && v !== "") url.searchParams.set(k, v);
      }
    }
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${jwt}` },
    });
    return (await res.json()) as WasResponse<T>;
  }

  function retError(r: WasResponse<unknown>): string {
    return `retCode=${r.retCode} · ${r.retMessage || RET_CODE_MSG[r.retCode] || "오류"}`;
  }

  // 서버 저장 API-Key 목록 조회
  async function fetchKeys() {
    if (!jwt.trim()) {
      setKeyError("JWT를 입력하세요");
      return;
    }
    setKeyLoading(true);
    setKeyError(null);
    setKeyStatus(null);
    setKeySyncTimes({});
    try {
      // 마지막 수집 시각은 /v1/pnl2/status에서 가져와 거래소명으로 매핑
      const [r, stR] = await Promise.all([
        wasGet<KeyStatusResult>("/v1/sync/exchange/status"),
        wasGet<StatusResult>("/v1/pnl2/status"),
      ]);
      if (r.retCode !== 0) {
        setKeyError(retError(r));
        return;
      }
      setKeyStatus(r.result);
      if (stR.retCode === 0) {
        setKeySyncTimes(
          Object.fromEntries(
            stR.result.exchanges.map((s) => [s.exchange, s.lastUpdatedTime]),
          ),
        );
      }
      // 저장된 거래소로 필터 초기화(전체 선택 상태 유지 위해 비움 = 전체)
      setExFilter([]);
    } catch (e) {
      setKeyError(`요청 실패: ${e}`);
    } finally {
      setKeyLoading(false);
    }
  }

  // PNL 조회 (overview + daily + symbols + status 병렬)
  async function fetchPnl() {
    if (!jwt.trim()) {
      setPnlError("JWT를 입력하세요");
      return;
    }
    setPnlLoading(true);
    setPnlError(null);
    const exchangesCsv = exFilter.length > 0 ? exFilter.join(",") : undefined;
    const dateParams = { startDate, endDate, exchanges: exchangesCsv };
    try {
      const [ovR, dyR, syR, syRawR, stR] = await Promise.all([
        wasGet<OverviewResult>("/v1/pnl2/overview", dateParams),
        wasGet<DailyResult>("/v1/pnl2/daily", { ...dateParams, includeDetail: "true" }),
        wasGet<SymbolsResult>("/v1/pnl2/symbols", dateParams),
        wasGet<SymbolsResult>("/v1/pnl2/symbols", { ...dateParams, rawSymbol: "true" }),
        wasGet<StatusResult>("/v1/pnl2/status", { exchanges: exchangesCsv }),
      ]);
      const bad = [ovR, dyR, syR, syRawR, stR].find((r) => r.retCode !== 0);
      if (bad) {
        setPnlError(retError(bad));
        setOverview(null);
        setDaily(null);
        setSymbols(null);
        setSymbolsRaw(null);
        setStatus(null);
        return;
      }
      setOverview(ovR.result);
      setDaily(dyR.result);
      setSymbols(syR.result);
      setSymbolsRaw(syRawR.result);
      setStatus(stR.result);
    } catch (e) {
      setPnlError(`요청 실패: ${e}`);
    } finally {
      setPnlLoading(false);
    }
  }

  function toggleExchange(ex: string) {
    setExFilter((prev) =>
      prev.includes(ex) ? prev.filter((x) => x !== ex) : [...prev, ex],
    );
  }

  // 필터 후보: 저장된 키의 거래소 우선, 없으면 지원 전체
  const filterCandidates =
    keyStatus && keyStatus.exchanges.length > 0
      ? keyStatus.exchanges.map((e) => e.exchange)
      : [...SUPPORTED_EXCHANGES];

  const master = parseJwtClaim(jwt, "master");

  return (
    <div className="flex flex-col gap-5 max-w-7xl">
      {/* 1. WAS 환경 + JWT */}
      <Section title="1. 환경 · 인증">
        <label className="block text-sm text-zinc-500 mb-1">환경</label>
        <div className="flex flex-wrap gap-2">
          {WAS_ENVS.map((env) => (
            <button
              key={env.label}
              onClick={() => {
                setWasUrl(env.url);
                setJwt(env.defaultJwt);
                setKeyStatus(null);
                setKeyError(null);
              }}
              className={`px-3 py-1.5 text-sm rounded-md border ${
                wasUrl === env.url
                  ? "bg-blue-600 border-blue-600 text-white"
                  : "bg-white border-zinc-300 text-zinc-500 hover:border-zinc-400"
              }`}
            >
              {env.label}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-zinc-500 font-mono">{wasUrl}</p>

        <label className="block text-sm text-zinc-500 mt-3 mb-1">
          Access Token (JWT)
        </label>
        <input
          className="w-full p-2 bg-white border border-zinc-300 rounded text-zinc-900 font-mono text-sm"
          value={jwt}
          onChange={(e) => setJwt(e.target.value)}
          placeholder="eyJhbGciOiJIUzI1NiIs..."
        />
        {master && (
          <p className="mt-1 text-xs text-zinc-500">
            master: <span className="text-green-600 font-mono">{master}</span>
          </p>
        )}
      </Section>

      {/* 2. 서버 저장 API-Key 목록 */}
      <Section title="2. 서버 저장 API-Key">
        <button
          onClick={fetchKeys}
          disabled={keyLoading}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {keyLoading ? "조회 중…" : "API-Key 목록 조회"}
        </button>
        <span className="ml-2 text-xs text-zinc-400">
          GET /v1/sync/exchange/status
        </span>

        {keyError && (
          <p className="mt-2 text-sm text-red-600">❌ {keyError}</p>
        )}

        {keyStatus && (
          <div className="mt-3">
            <p className="mb-2 text-xs text-zinc-500">
              initialized:{" "}
              <span
                className={
                  keyStatus.initialized
                    ? "text-emerald-600 font-medium"
                    : "text-amber-500 font-medium"
                }
              >
                {String(keyStatus.initialized)}
              </span>{" "}
              · 저장 거래소 {keyStatus.exchanges.length}개
            </p>
            {keyStatus.exchanges.length === 0 ? (
              <p className="text-sm text-zinc-400">저장된 API-Key가 없습니다.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
                <table className="w-full text-sm">
                  <thead className="bg-zinc-50 text-xs text-zinc-500 dark:bg-zinc-800">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">거래소</th>
                      <th className="px-3 py-2 text-left font-medium">UID</th>
                      <th className="px-3 py-2 text-left font-medium">API Key</th>
                      <th className="px-3 py-2 text-left font-medium">마지막 수집(UTC)</th>
                      <th className="px-3 py-2 text-left font-medium">수정 시각(UTC)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {keyStatus.exchanges.map((k) => (
                      <tr
                        key={k.exchange}
                        className="border-t border-zinc-100 dark:border-zinc-800"
                      >
                        <td className="px-3 py-1.5 font-medium text-zinc-700 dark:text-zinc-300">
                          {k.exchange}
                        </td>
                        <td className="px-3 py-1.5 font-mono text-zinc-500">
                          {k.uid ?? "—"}
                        </td>
                        <td className="px-3 py-1.5 font-mono text-zinc-500">
                          {k.apiKey}
                        </td>
                        <td className="px-3 py-1.5 font-mono text-zinc-400">
                          {keySyncTimes[k.exchange] ?? "미수집"}
                        </td>
                        <td className="px-3 py-1.5 font-mono text-zinc-400">
                          {k.updatedAt}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Section>

      {/* 3. 조회 파라미터 */}
      <Section title="3. PNL 조회">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs text-zinc-500 mb-1">월별 조회</label>
            <select
              value={monthSel}
              onChange={(e) => {
                const v = e.target.value;
                setMonthSel(v);
                const opt = months.find((o) => o.value === v);
                if (opt) {
                  setStartDate(opt.start);
                  setEndDate(opt.end);
                }
              }}
              className="p-2 bg-white border border-zinc-300 rounded text-zinc-900 text-sm"
            >
              <option value="">직접 선택</option>
              {months.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">시작일 (UTC)</label>
            <input
              type="date"
              className="p-2 bg-white border border-zinc-300 rounded text-zinc-900 text-sm"
              value={startDate}
              onChange={(e) => {
                setMonthSel("");
                setStartDate(e.target.value);
              }}
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">종료일 (UTC)</label>
            <input
              type="date"
              className="p-2 bg-white border border-zinc-300 rounded text-zinc-900 text-sm"
              value={endDate}
              onChange={(e) => {
                setMonthSel("");
                setEndDate(e.target.value);
              }}
            />
          </div>
          <button
            onClick={fetchPnl}
            disabled={pnlLoading}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {pnlLoading ? "조회 중…" : "조회"}
          </button>
        </div>

        <div className="mt-3">
          <label className="block text-xs text-zinc-500 mb-1">
            거래소 필터 (미선택 = 토큰 보유 전체)
          </label>
          <div className="flex flex-wrap gap-2">
            {filterCandidates.map((ex) => {
              const on = exFilter.includes(ex);
              return (
                <button
                  key={ex}
                  onClick={() => toggleExchange(ex)}
                  className={`px-2.5 py-1 text-xs rounded-md border ${
                    on
                      ? "bg-blue-600 border-blue-600 text-white"
                      : "bg-white border-zinc-300 text-zinc-500 hover:border-zinc-400"
                  }`}
                >
                  {ex}
                </button>
              );
            })}
          </div>
        </div>

        {pnlError && <p className="mt-3 text-sm text-red-600">❌ {pnlError}</p>}
      </Section>

      {/* 4. 결과 */}
      {overview && (
        <>
          <SyncStatusPanel status={status} syncStatus={overview.syncStatus} exchanges={overview.exchanges} />
          <Section title="포지션 지표">
            <PositionMetricsView m={overview.positionMetrics} />
          </Section>
          <Section title="손익 지표">
            <PnlMetricsView m={overview.pnlMetrics} />
          </Section>
          {daily && <DailyChart daily={daily} />}
          {symbols && (
            <div className="grid items-start gap-5 xl:grid-cols-2">
              <SymbolsTable symbols={symbols.symbols} title="심볼별 PnL — 정규화 머지" />
              {symbolsRaw && (
                <SymbolsTable
                  symbols={symbolsRaw.symbols}
                  title="심볼별 PnL — 원본 표기 (rawSymbol=true)"
                />
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── syncStatus / status 패널 ─────────────────────────────────────────────────
function SyncStatusPanel({
  status,
  syncStatus,
  exchanges,
}: {
  status: StatusResult | null;
  syncStatus: SyncStatusItem[];
  exchanges: string[];
}) {
  const statusMap = new Map(status?.exchanges.map((s) => [s.exchange, s]) ?? []);
  return (
    <Section title="수집 상태">
      {exchanges.length === 0 ? (
        <p className="text-sm text-amber-500">
          토큰에 유효한 거래소 uid가 없습니다 (빈 결과).
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {syncStatus.map((s) => {
            const st = statusMap.get(s.exchange);
            const synced = s.lastUpdatedTime != null;
            return (
              <div
                key={s.exchange}
                className="rounded-lg border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                    {s.exchange}
                  </span>
                  {st?.collecting ? (
                    <span className="rounded bg-amber-100 px-1.5 py-px text-[10px] font-medium text-amber-700 dark:bg-amber-900 dark:text-amber-300">
                      수집 중
                    </span>
                  ) : synced ? (
                    <span className="rounded bg-emerald-100 px-1.5 py-px text-[10px] font-medium text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
                      동기화됨
                    </span>
                  ) : (
                    <span className="rounded bg-zinc-100 px-1.5 py-px text-[10px] font-medium text-zinc-500 dark:bg-zinc-800">
                      대기
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-[10px] text-zinc-400 font-mono">
                  {s.lastUpdatedTime ?? "미수집 (백필 중)"}
                </div>
                {st && (
                  <div className="text-[10px] text-zinc-400">
                    backfill: {String(st.backfillDone)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}

// ── 포지션 지표 ──────────────────────────────────────────────────────────────
function PositionMetricsView({ m }: { m: PositionMetrics }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
      <Card label="지표 모수 (counted)" value={fmtInt(m.countedPositions)} sub={`전체 ${fmtInt(m.totalPositions)}`} />
      <Card label="진행 중 (open)" value={fmtInt(m.openPositions)} sub="기간 무관" />
      <Card label="재구성 불완전 (orphan)" value={fmtInt(m.orphanPositions)} />
      <Card
        label="승률"
        value={fmtPct(m.winRate)}
        sub={`${fmtInt(m.winCount)}승 / ${fmtInt(m.lossCount)}패`}
        valueClass={m.winRate != null && m.winRate >= 0.5 ? pnlColor(1) : undefined}
      />
      <Card label="평균 익절 (avgWin)" value={m.avgWin != null ? fmtUsd(m.avgWin) : "—"} valueClass={pnlColor(1)} />
      <Card label="평균 손절 (avgLoss)" value={m.avgLoss != null ? fmtUsd(m.avgLoss) : "—"} valueClass={pnlColor(-1)} />
      <Card label="평균 보유시간" value={fmtDuration(m.avgHoldTimeMs)} />
      <div className={CARD_CLS}>
        <div className={CARD_LABEL}>보유시간 (승/패)</div>
        <div className="mt-0.5 space-y-0.5">
          <MiniRow label="승" value={fmtDuration(m.avgWinHoldTimeMs)} />
          <MiniRow label="패" value={fmtDuration(m.avgLossHoldTimeMs)} />
        </div>
      </div>
    </div>
  );
}

// ── 손익 지표 ────────────────────────────────────────────────────────────────
function PnlMetricsView({ m }: { m: PnlMetrics }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
      <Card label="Net PnL" value={fmtUsd(m.netPnl)} valueClass={pnlColor(m.netPnl)} sub={`${fmtInt(m.rowCount)}행`} />
      <Card label="가격손익" value={fmtUsd(m.pricePnl)} valueClass={pnlColor(m.pricePnl)} />
      <Card label="수수료" value={fmtUsd(m.fee)} valueClass={pnlColor(m.fee)} />
      <Card label="펀딩" value={fmtUsd(m.funding)} valueClass={pnlColor(m.funding)} />
      <Card label="체결 건수" value={fmtInt(m.tradeCount)} />
      <Card label="평균 PnL/행" value={m.avgPnlPerRow != null ? fmtUsd(m.avgPnlPerRow) : "—"} valueClass={m.avgPnlPerRow != null ? pnlColor(m.avgPnlPerRow) : undefined} />
      <div className={CARD_CLS}>
        <div className={CARD_LABEL}>이익 / 손실 합</div>
        <div className="mt-0.5 space-y-0.5">
          <MiniRow label="이익" value={fmtUsd(m.profitSum)} valueClass="text-emerald-600 dark:text-emerald-400" />
          <MiniRow label="손실" value={fmtUsd(m.lossSum)} valueClass="text-red-600 dark:text-red-400" />
        </div>
      </div>
    </div>
  );
}

// ── 일별 차트 ────────────────────────────────────────────────────────────────
function DailyChart({ daily }: { daily: DailyResult }) {
  const [pinnedDate, setPinnedDate] = useState<string | null>(null);
  const data = daily.days.map((d) => ({ ...d, net: d.netPnl }));

  if (data.length === 0) {
    return (
      <Section title="일별 Net PnL">
        <p className="text-sm text-zinc-400">데이터가 없습니다.</p>
      </Section>
    );
  }

  return (
    <Section title="일별 Net PnL">
      <p className="mb-2 text-[10px] text-zinc-400">
        · 막대를 클릭하면 상세가 아래에 고정됩니다
      </p>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart
          data={data}
          margin={{ top: 8, right: 8, left: 8, bottom: 8 }}
          onClick={(state) => {
            const lbl = state?.activeLabel;
            if (lbl != null) setPinnedDate(String(lbl));
          }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#88888830" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d: string) => d.slice(5)} />
          <YAxis tick={{ fontSize: 11 }} width={56} tickFormatter={(v: number) => fmtUsd(v)} />
          <Tooltip content={<DailyTooltip />} cursor={{ fill: "#8888881a" }} />
          <Bar dataKey="net" name="Net PnL" cursor="pointer">
            {data.map((d) => (
              <Cell key={d.date} fill={d.net >= 0 ? "#10b981" : "#ef4444"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {pinnedDate &&
        (() => {
          const dp = daily.days.find((d) => d.date === pinnedDate);
          if (!dp) return null;
          return (
            <div className="mt-3 overflow-x-auto">
              <DailyDetail dp={dp} onClose={() => setPinnedDate(null)} />
            </div>
          );
        })()}
    </Section>
  );
}

function DailyTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: DailyItem }> }) {
  if (!active || !payload?.length) return null;
  return <DailyDetail dp={payload[0].payload} />;
}

function DailyDetail({ dp, onClose }: { dp: DailyItem; onClose?: () => void }) {
  const detail = dp.detail ?? [];
  const num = (n: number) => `px-3 py-2 text-right align-middle tabular-nums ${pnlColor(n)}`;
  return (
    <div className="min-w-[30rem] max-w-2xl rounded-lg border border-zinc-200 bg-white text-xs shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
      <div className="flex items-center justify-between gap-4 border-b border-zinc-200 px-4 py-2.5 dark:border-zinc-700">
        <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{dp.date}</span>
        <span className="flex items-center gap-3">
          <span className="text-sm">
            <span className="text-zinc-400">Net </span>
            <span className={`font-bold tabular-nums ${pnlColor(dp.netPnl)}`}>{fmtUsd(dp.netPnl)}</span>
          </span>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="상세 닫기"
              className="rounded p-1 leading-none text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800"
            >
              ✕
            </button>
          )}
        </span>
      </div>
      {detail.length === 0 ? (
        <div className="px-4 py-3 text-zinc-400">
          {dp.rowCount === 0 ? "거래 없음" : "상세 없음 (includeDetail)"}
        </div>
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
            {detail.map((e, i) => (
              <tr key={i} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                <td className="px-4 py-2 align-middle">
                  <span className="text-zinc-400">{e.exchange}</span>{" "}
                  <span className="font-medium text-zinc-700 dark:text-zinc-200">{e.symbol || "—"}</span>
                  {e.marketSymbol && (
                    <span className="ml-1 font-mono text-[10px] text-zinc-400">({e.marketSymbol})</span>
                  )}
                  {e.tradeCount > 0 && <span className="ml-1 text-[10px] text-zinc-400">·{e.tradeCount}건</span>}
                </td>
                <td className={num(e.pricePnl)}>{fmtUsd(e.pricePnl)}</td>
                <td className={num(e.fee)}>{fmtUsd(e.fee)}</td>
                <td className={num(e.funding)}>{fmtUsd(e.funding)}</td>
                <td className={`px-3 py-2 text-right align-middle font-semibold tabular-nums ${pnlColor(e.netPnl)}`}>
                  {fmtUsd(e.netPnl)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-zinc-300 bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800">
              <td className="px-4 py-2 font-semibold text-zinc-600 dark:text-zinc-300">합계</td>
              <td className={`${num(dp.pricePnl)} font-semibold`}>{fmtUsd(dp.pricePnl)}</td>
              <td className={`${num(dp.fee)} font-semibold`}>{fmtUsd(dp.fee)}</td>
              <td className={`${num(dp.funding)} font-semibold`}>{fmtUsd(dp.funding)}</td>
              <td className={`px-3 py-2 text-right font-bold tabular-nums ${pnlColor(dp.netPnl)}`}>{fmtUsd(dp.netPnl)}</td>
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  );
}

// ── 심볼 테이블 ──────────────────────────────────────────────────────────────
type SymbolSortKey = "symbol" | "netPnl" | "pricePnl" | "fee" | "funding" | "rowCount" | "tradeCount";

function SymbolsTable({ symbols, title = "심볼별 PnL" }: { symbols: SymbolItem[]; title?: string }) {
  const [sort, setSort] = useState<{ key: SymbolSortKey; dir: "asc" | "desc" }>({
    key: "netPnl",
    dir: "desc",
  });

  if (symbols.length === 0) {
    return (
      <Section title={title}>
        <p className="text-sm text-zinc-400">데이터가 없습니다.</p>
      </Section>
    );
  }

  const onSort = (key: SymbolSortKey) =>
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "symbol" ? "asc" : "desc" },
    );

  const dir = sort.dir === "asc" ? 1 : -1;
  const sorted = [...symbols].sort((a, b) =>
    sort.key === "symbol"
      ? a.symbol.localeCompare(b.symbol) * dir
      : ((a[sort.key] as number) - (b[sort.key] as number)) * dir,
  );

  return (
    <Section title={`${title} (${symbols.length}종)`}>
      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-xs text-zinc-500 dark:bg-zinc-800">
            <tr>
              <SortTh label="심볼" k="symbol" sort={sort} onSort={onSort} align="left" />
              <SortTh label="Net" k="netPnl" sort={sort} onSort={onSort} />
              <SortTh label="가격손익" k="pricePnl" sort={sort} onSort={onSort} />
              <SortTh label="수수료" k="fee" sort={sort} onSort={onSort} />
              <SortTh label="펀딩" k="funding" sort={sort} onSort={onSort} />
              <SortTh label="전체행" k="rowCount" sort={sort} onSort={onSort} />
              <SortTh label="거래건수" k="tradeCount" sort={sort} onSort={onSort} />
            </tr>
          </thead>
          <tbody>
            {sorted.map((s) => (
              <tr key={s.symbol} className="border-t border-zinc-100 dark:border-zinc-800">
                <td className="px-3 py-1.5 font-medium text-zinc-700 dark:text-zinc-300">
                  {s.symbol || "—"}
                  {s.exchanges.length > 0 && (
                    <span className="ml-2 text-[10px] text-zinc-400">
                      {s.exchanges.join(" · ")}
                    </span>
                  )}
                </td>
                <td className={`px-3 py-1.5 text-right tabular-nums ${pnlColor(s.netPnl)}`}>{fmtUsd(s.netPnl)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-zinc-500">{fmtUsd(s.pricePnl)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-zinc-500">{fmtUsd(s.fee)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-zinc-500">{fmtUsd(s.funding)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-zinc-400">{fmtInt(s.rowCount)}</td>
                <td className="px-3 py-1.5 text-right font-medium tabular-nums text-zinc-600 dark:text-zinc-300">
                  {fmtInt(s.tradeCount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function SortTh({
  label,
  k,
  sort,
  onSort,
  align = "right",
}: {
  label: string;
  k: SymbolSortKey;
  sort: { key: SymbolSortKey; dir: "asc" | "desc" };
  onSort: (k: SymbolSortKey) => void;
  align?: "left" | "right";
}) {
  const active = sort.key === k;
  return (
    <th
      className={`cursor-pointer select-none px-3 py-2 ${align === "left" ? "text-left" : "text-right"} hover:text-zinc-700 dark:hover:text-zinc-200`}
      onClick={() => onSort(k)}
    >
      <span className={`inline-flex items-center gap-0.5 ${align === "left" ? "" : "flex-row-reverse"}`}>
        <span>{label}</span>
        <span className={active ? "text-blue-500" : "text-transparent"}>
          {active && sort.dir === "asc" ? "▲" : "▼"}
        </span>
      </span>
    </th>
  );
}

// ── 공통 UI ──────────────────────────────────────────────────────────────────
const CARD_CLS = "rounded-lg border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900";
const CARD_LABEL = "text-[13px] font-semibold text-zinc-700 dark:text-zinc-200";

function Card({
  label,
  value,
  sub,
  valueClass,
}: {
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
}) {
  return (
    <div className={CARD_CLS}>
      <div className={CARD_LABEL}>{label}</div>
      <div className={`mt-0.5 text-base font-semibold tabular-nums ${valueClass ?? "text-zinc-900 dark:text-zinc-100"}`}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[10px] text-zinc-400">{sub}</div>}
    </div>
  );
}

function MiniRow({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[11px] text-zinc-400">{label}</span>
      <span className={`text-sm font-semibold tabular-nums ${valueClass ?? "text-zinc-700 dark:text-zinc-200"}`}>
        {value}
      </span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-zinc-200 rounded-lg p-4 bg-white dark:border-zinc-700 dark:bg-zinc-900">
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-3">{title}</h3>
      {children}
    </div>
  );
}

/** JWT payload에서 특정 클레임 추출 */
function parseJwtClaim(token: string, claim: string): string | null {
  try {
    const payload = token.split(".")[1];
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json)[claim] || null;
  } catch {
    return null;
  }
}
