"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import type { ExchangeId, StoredData, CollectResult, NormalizedRow, CollectMethod } from "@/lib/exchange-pnl/types";
import { EXCHANGES, getExchange, EXCHANGE_COLORS } from "@/lib/exchange-pnl/exchanges";
import {
  loadCredentials,
  saveCredentials,
  loadData,
  saveData,
  clearData,
} from "@/lib/exchange-pnl/storage";
import type { PnlToggles } from "@/lib/exchange-pnl/metrics";
import ExchangeCard, { type CollectState } from "./ExchangeCard";
import MetricsPanel from "./MetricsPanel";
import RawDataView from "./RawDataView";
import MethodDocs from "./MethodDocs";

type Tab = "collect" | "aggregated" | "perExchange" | "raw" | "docs";

// 오늘(UTC)이 속한 월 값 ("YYYY-MM")
function currentMonthValue(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

// 특정 월("YYYY-MM")의 1일~말일 (UTC)
function monthRange(value: string): { start: string; end: string } {
  const [y, m] = value.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");
  return { start: `${y}-${mm}-01`, end: `${y}-${mm}-${String(lastDay).padStart(2, "0")}` };
}

// 기본 기간 = 오늘이 속한 월
function defaultRange() {
  return monthRange(currentMonthValue());
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

export default function ExchangePnl({ method = "position" }: { method?: CollectMethod }) {
  const [creds, setCreds] = useState<Record<string, Record<string, string>>>({});
  const [dataMap, setDataMap] = useState<Partial<Record<ExchangeId, StoredData>>>({});
  const [status, setStatus] = useState<Record<string, { state: CollectState; error?: string }>>({});
  const [range, setRange] = useState(defaultRange);
  const [monthSel, setMonthSel] = useState(() => currentMonthValue()); // 기본: 오늘이 속한 월
  const months = monthOptions();
  const [toggles, setToggles] = useState<PnlToggles>({ includeFee: true, includeFunding: true });
  const [tab, setTab] = useState<Tab>("collect");
  const [selected, setSelected] = useState<Set<ExchangeId>>(new Set());
  const [rawExchange, setRawExchange] = useState<ExchangeId | null>(null);
  const [perExchangeSel, setPerExchangeSel] = useState<ExchangeId | null>(null);
  const [loaded, setLoaded] = useState(false);

  // 초기 로드: localStorage 에서 자격증명/데이터 복원
  useEffect(() => {
    const c: Record<string, Record<string, string>> = {};
    const d: Partial<Record<ExchangeId, StoredData>> = {};
    const sel = new Set<ExchangeId>();
    for (const ex of EXCHANGES) {
      c[ex.id] = loadCredentials(ex.id);
      const stored = loadData(ex.id, method);
      if (stored) {
        d[ex.id] = stored;
        sel.add(ex.id);
        setStatus((s) => ({ ...s, [ex.id]: { state: "done" } }));
      }
    }
    setCreds(c);
    setDataMap(d);
    setSelected(sel);
    setLoaded(true);
  }, [method]);

  const handleCredChange = useCallback((ex: ExchangeId, key: string, value: string) => {
    setCreds((prev) => {
      const next = { ...prev, [ex]: { ...(prev[ex] ?? {}), [key]: value } };
      saveCredentials(ex, next[ex]);
      return next;
    });
  }, []);

  const startMs = useMemo(() => new Date(range.start + "T00:00:00Z").getTime(), [range.start]);
  const endMs = useMemo(() => new Date(range.end + "T23:59:59Z").getTime(), [range.end]);

  const handleCollect = useCallback(
    async (ex: ExchangeId) => {
      setStatus((s) => ({ ...s, [ex]: { state: "loading" } }));
      try {
        const res = await fetch("/api/exchange-pnl", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            exchange: ex,
            credentials: creds[ex] ?? {},
            startTime: startMs,
            endTime: endMs,
            method,
          }),
        });
        const json = await res.json();
        if (json.error) throw new Error(json.error);
        const result = json as CollectResult;

        const stored: StoredData = {
          exchange: ex,
          startTime: startMs,
          endTime: endMs,
          collectedAt: new Date().toISOString(),
          rows: result.rows,
          rawPages: result.rawPages,
          warnings: result.warnings,
          meta: result.meta,
        };
        saveData(stored, method);
        setDataMap((prev) => ({ ...prev, [ex]: stored }));
        setSelected((prev) => new Set(prev).add(ex));
        // row가 0인데 warning이 있으면 사용자에게 알림 위해 error 대신 done 처리
        setStatus((s) => ({ ...s, [ex]: { state: "done" } }));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setStatus((s) => ({ ...s, [ex]: { state: "error", error: msg } }));
      }
    },
    [creds, startMs, endMs, method],
  );

  const handleClearData = useCallback((ex: ExchangeId) => {
    clearData(ex, method);
    setDataMap((prev) => {
      const next = { ...prev };
      delete next[ex];
      return next;
    });
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(ex);
      return next;
    });
    setStatus((s) => ({ ...s, [ex]: { state: "idle" } }));
  }, [method]);

  const collectAll = useCallback(async () => {
    const withCreds = EXCHANGES.filter((ex) => {
      const c = creds[ex.id] ?? {};
      return ex.credFields.every((f) => !f.secret || (c[f.key] ?? "").trim() !== "");
    });
    for (const ex of withCreds) {
      await handleCollect(ex.id);
    }
  }, [creds, handleCollect]);

  const collectedExchanges = EXCHANGES.filter((ex) => dataMap[ex.id]);

  // 합산 대상 row
  const aggregatedRows: NormalizedRow[] = useMemo(() => {
    const out: NormalizedRow[] = [];
    for (const ex of collectedExchanges) {
      if (selected.has(ex.id)) out.push(...(dataMap[ex.id]?.rows ?? []));
    }
    return out;
  }, [collectedExchanges, selected, dataMap]);

  // 합산 보기 차트의 날짜축 = 선택된 거래소들의 수집기간 합집합
  const aggregatedRange = useMemo(() => {
    let s = Number.POSITIVE_INFINITY;
    let e = Number.NEGATIVE_INFINITY;
    for (const ex of collectedExchanges) {
      if (!selected.has(ex.id)) continue;
      const d = dataMap[ex.id];
      if (!d) continue;
      s = Math.min(s, d.startTime);
      e = Math.max(e, d.endTime);
    }
    return Number.isFinite(s) && Number.isFinite(e) ? { start: s, end: e } : undefined;
  }, [collectedExchanges, selected, dataMap]);

  const anyLoading = Object.values(status).some((s) => s.state === "loading");

  const tabCls = (t: Tab) =>
    `px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
      tab === t
        ? "border-blue-500 text-blue-600 dark:text-blue-400"
        : "border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
    }`;

  function toggleSelected(ex: ExchangeId) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(ex)) next.delete(ex);
      else next.add(ex);
      return next;
    });
  }

  if (!loaded) return null;

  return (
    <div className="flex flex-col gap-5">
      {/* 글로벌 컨트롤: 기간 + 토글 */}
      <div className="flex flex-wrap items-end gap-4 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-900">
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">월별 조회</label>
          <select
            value={monthSel}
            onChange={(e) => {
              const v = e.target.value;
              setMonthSel(v);
              const opt = months.find((o) => o.value === v);
              if (opt) setRange({ start: opt.start, end: opt.end });
            }}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
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
          <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">시작</label>
          <input
            type="date"
            value={range.start}
            onChange={(e) => {
              setMonthSel("");
              setRange((r) => ({ ...r, start: e.target.value }));
            }}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
          />
        </div>
        <span className="pb-2 text-zinc-400">~</span>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">종료</label>
          <input
            type="date"
            value={range.end}
            onChange={(e) => {
              setMonthSel("");
              setRange((r) => ({ ...r, end: e.target.value }));
            }}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
          />
        </div>
        <div className="ml-auto flex items-center gap-4">
          <label className="flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-300">
            <input
              type="checkbox"
              checked={toggles.includeFee}
              onChange={(e) => setToggles((t) => ({ ...t, includeFee: e.target.checked }))}
            />
            수수료 반영
          </label>
          <label className="flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-300">
            <input
              type="checkbox"
              checked={toggles.includeFunding}
              onChange={(e) => setToggles((t) => ({ ...t, includeFunding: e.target.checked }))}
            />
            펀딩 반영
          </label>
        </div>
      </div>

      {/* 탭 */}
      <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-700">
        <div className="flex">
          <button className={tabCls("collect")} onClick={() => setTab("collect")}>
            수집 · 설정
          </button>
          <button className={tabCls("aggregated")} onClick={() => setTab("aggregated")} disabled={collectedExchanges.length === 0}>
            합산 보기
          </button>
          <button className={tabCls("perExchange")} onClick={() => setTab("perExchange")} disabled={collectedExchanges.length === 0}>
            거래소별
          </button>
          <button className={tabCls("raw")} onClick={() => setTab("raw")} disabled={collectedExchanges.length === 0}>
            원본 데이터
          </button>
          <button className={tabCls("docs")} onClick={() => setTab("docs")}>
            수집 방식
          </button>
        </div>
      </div>

      {/* === 수집/설정 탭 === */}
      {tab === "collect" && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {method === "trade"
                ? "트레이드 히스토리(실현손익 원장) 기반 수집입니다 — 포지션 종료 여부와 무관하게 거래 발생 시점에 PnL을 귀속합니다. 보유시간·승률은 제공되지 않습니다. "
                : "포지션 히스토리 기반 수집입니다 — 포지션이 완전히 종료된 건만 집계됩니다. "}
              각 거래소의 read-only API key를 입력하고 수집하세요. 입력값과 수집 데이터는 브라우저 localStorage에만 저장됩니다.
            </p>
            <button
              onClick={collectAll}
              disabled={anyLoading}
              className="shrink-0 rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {anyLoading ? "수집 중…" : "입력된 거래소 모두 수집"}
            </button>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {EXCHANGES.map((ex) => (
              <ExchangeCard
                key={ex.id}
                meta={ex}
                creds={creds[ex.id] ?? {}}
                onCredChange={(k, v) => handleCredChange(ex.id, k, v)}
                onCollect={() => handleCollect(ex.id)}
                onClearData={() => handleClearData(ex.id)}
                data={dataMap[ex.id] ?? null}
                state={status[ex.id]?.state ?? "idle"}
                error={status[ex.id]?.error}
                disabled={anyLoading}
                rangeStartMs={startMs}
              />
            ))}
          </div>
        </div>
      )}

      {/* === 합산 보기 탭 === */}
      {tab === "aggregated" && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 px-4 py-3 dark:border-zinc-700">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">합산 대상:</span>
            {collectedExchanges.map((ex) => (
              <label
                key={ex.id}
                className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs"
                style={{ borderColor: selected.has(ex.id) ? EXCHANGE_COLORS[ex.id] : undefined }}
              >
                <input type="checkbox" checked={selected.has(ex.id)} onChange={() => toggleSelected(ex.id)} />
                <span style={{ color: selected.has(ex.id) ? EXCHANGE_COLORS[ex.id] : undefined }}>
                  {ex.name} ({dataMap[ex.id]?.rows.length ?? 0})
                </span>
              </label>
            ))}
          </div>
          <MetricsPanel rows={aggregatedRows} toggles={toggles} showSupportNotes range={aggregatedRange} />
        </div>
      )}

      {/* === 거래소별 탭 === */}
      {tab === "perExchange" && (
        <div className="flex flex-col gap-4">
          {/* 거래소 선택 버튼 */}
          <div className="flex flex-wrap gap-2">
            {collectedExchanges.map((ex) => {
              const isActive = (perExchangeSel ?? collectedExchanges[0]?.id) === ex.id;
              return (
                <button
                  key={ex.id}
                  onClick={() => setPerExchangeSel(ex.id)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                    isActive ? "text-white" : "border border-zinc-300 text-zinc-600 dark:border-zinc-600 dark:text-zinc-400"
                  }`}
                  style={isActive ? { backgroundColor: EXCHANGE_COLORS[ex.id] } : undefined}
                >
                  {ex.name} ({dataMap[ex.id]?.rows.length ?? 0})
                </button>
              );
            })}
          </div>
          {(() => {
            const target = perExchangeSel ?? collectedExchanges[0]?.id;
            const d = target ? dataMap[target] : null;
            if (!d || !target) return null;
            return (
              <div>
                <div className="mb-3 flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: EXCHANGE_COLORS[target] }} />
                  <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{getExchange(target).name}</h3>
                  <span className="text-xs text-zinc-400">{getExchange(target).unit} 단위 · {d.rows.length}건</span>
                </div>
                <MetricsPanel rows={d.rows} toggles={toggles} showSupportNotes range={{ start: d.startTime, end: d.endTime }} />
              </div>
            );
          })()}
        </div>
      )}

      {/* === 원본 데이터 탭 === */}
      {tab === "raw" && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            {collectedExchanges.map((ex) => (
              <button
                key={ex.id}
                onClick={() => setRawExchange(ex.id)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                  (rawExchange ?? collectedExchanges[0]?.id) === ex.id
                    ? "text-white"
                    : "border border-zinc-300 text-zinc-600 dark:border-zinc-600 dark:text-zinc-400"
                }`}
                style={
                  (rawExchange ?? collectedExchanges[0]?.id) === ex.id
                    ? { backgroundColor: EXCHANGE_COLORS[ex.id] }
                    : undefined
                }
              >
                {ex.name}
              </button>
            ))}
          </div>
          {(() => {
            const target = rawExchange ?? collectedExchanges[0]?.id;
            const d = target ? dataMap[target] : null;
            return d ? <RawDataView data={d} /> : null;
          })()}
        </div>
      )}

      {/* === 수집 방식(문서) 탭 === */}
      {tab === "docs" && <MethodDocs method={method} />}
    </div>
  );
}
