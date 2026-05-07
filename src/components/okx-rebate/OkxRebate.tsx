"use client";

import { useState, useCallback, useEffect } from "react";
import type {
  OkxRebateRow,
  TradeRecord,
  AddressRebateSummary,
  UnmatchedOrder,
  AllOrderRow,
  RebateSummary,
  StepStatus,
  CachedRange,
} from "@/lib/okx-rebate/types";
import {
  aggregateByAddress,
  filterByAffiliate,
  recalculateSummary,
} from "@/lib/okx-rebate/aggregator";
import {
  loadCacheIndex,
  loadCacheData,
  saveCacheData,
  deleteCacheEntry,
  clearAllCache,
} from "@/lib/okx-rebate/cache";
import { POLL_INTERVAL_MS, POLL_MAX_ATTEMPTS } from "@/lib/okx-rebate/constants";
import CredentialsForm from "./CredentialsForm";
import ProgressSteps from "./ProgressSteps";
import SummaryPanel from "./SummaryPanel";
import RebateTable from "./RebateTable";
import AllOrdersTable from "./AllOrdersTable";
import CacheManager from "./CacheManager";
import DailyStatsTable from "./DailyStatsTable";

type Tab = "result" | "daily" | "allorders" | "cache";

function makeSteps(overrides?: Partial<Record<number, Partial<StepStatus>>>): StepStatus[] {
  const defaults: StepStatus[] = [
    { label: "CSV 생성 요청", state: "pending" },
    { label: "링크 대기", state: "pending" },
    { label: "CSV 다운로드", state: "pending" },
    { label: "DB 매핑", state: "pending" },
    { label: "집계 완료", state: "pending" },
  ];
  if (overrides) {
    for (const [idx, patch] of Object.entries(overrides)) {
      Object.assign(defaults[Number(idx)], patch);
    }
  }
  return defaults;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function downloadCsvFile(filename: string, content: string) {
  const blob = new Blob(["\uFEFF" + content], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function fmtNum(n: number): string {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
}

// CSV용 — 콤마 없이 숫자만
function csvNum(n: number): string {
  return n.toFixed(4);
}

export default function OkxRebate() {
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<StepStatus[]>(makeSteps());
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("result");
  const [affiliateOnly, setAffiliateOnly] = useState(false);
  const [exFilter, setExFilter] = useState<"all" | "with_ex" | "without_ex">("all");

  // 데이터
  const [addressSummaries, setAddressSummaries] = useState<AddressRebateSummary[]>([]);
  const [unmatchedOrders, setUnmatchedOrders] = useState<UnmatchedOrder[]>([]);
  const [allOrders, setAllOrders] = useState<AllOrderRow[]>([]);
  const [summary, setSummary] = useState<RebateSummary | null>(null);
  const [affiliateUsers, setAffiliateUsers] = useState<Set<string>>(new Set());
  const [rawCsvRows, setRawCsvRows] = useState<OkxRebateRow[]>([]);
  const [dateRange, setDateRange] = useState({ begin: "", end: "" });

  // 캐시
  const [cachedRanges, setCachedRanges] = useState<CachedRange[]>([]);

  useEffect(() => {
    setCachedRanges(loadCacheIndex());
  }, []);

  // affiliate + EX 필터 적용된 데이터
  const displayRows = (() => {
    let filtered = addressSummaries;
    if (affiliateOnly) filtered = filterByAffiliate(filtered, affiliateUsers);
    if (exFilter === "with_ex") filtered = filtered.filter((r) => r.exAccountId !== "");
    else if (exFilter === "without_ex") filtered = filtered.filter((r) => r.exAccountId === "");
    return filtered;
  })();

  const displaySummary =
    (affiliateOnly || exFilter !== "all") && summary
      ? recalculateSummary(displayRows, unmatchedOrders)
      : summary;

  const updateStep = useCallback(
    (idx: number, patch: Partial<StepStatus>) => {
      setSteps((prev) => {
        const next = [...prev];
        next[idx] = { ...next[idx], ...patch };
        return next;
      });
    },
    [],
  );

  // CSV 확보 후 공통 처리: DB 매핑 → 집계
  async function processAfterCsv(csvRows: OkxRebateRow[]) {
    updateStep(3, { state: "running" });
    const orderIds = [...new Set(csvRows.map((r) => r.orderId))];

    const lookupRes = await fetch("/api/okx-rebate/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderIds }),
    });
    const lookupData = await lookupRes.json();
    if (lookupData.error) throw new Error(lookupData.error);

    const trades = lookupData.trades as TradeRecord[];
    const unmappedOrderIds = lookupData.unmappedOrderIds as string[];
    const affUsers = lookupData.affiliateUsers as string[];
    const exAccountIdMap = (lookupData.exAccountIdMap || {}) as Record<string, string>;
    const registeredDateMap = (lookupData.registeredDateMap || {}) as Record<string, string>;
    const exchangeUidToAddress = (lookupData.exchangeUidToAddress || {}) as Record<string, string>;
    const crossCheckMap = (lookupData.crossCheckMap || {}) as Record<string, import("@/lib/okx-rebate/types").CrossCheckResult>;
    setAffiliateUsers(new Set(affUsers));
    updateStep(3, { state: "done", detail: `${orderIds.length} orders → ${trades.length} trades` });

    updateStep(4, { state: "running" });
    const result = aggregateByAddress(csvRows, trades, unmappedOrderIds, exAccountIdMap, registeredDateMap, exchangeUidToAddress, crossCheckMap);
    setAddressSummaries(result.addressSummaries);
    setUnmatchedOrders(result.unmatchedOrders);
    setAllOrders(result.allOrders);
    setSummary(result.summary);
    updateStep(4, { state: "done" });
  }

  // 기존 링크로 바로 다운로드
  async function handleUseExistingLink(downloadUrl: string, beginDate: string, endDate: string) {
    setRunning(true);
    setError(null);
    setSteps(makeSteps({
      0: { state: "done", detail: "기존 링크 사용" },
      1: { state: "done", detail: "기존 링크 사용" },
    }));
    setAddressSummaries([]);
    setUnmatchedOrders([]);
    setAllOrders([]);
    setSummary(null);
    setDateRange({ begin: beginDate, end: endDate });

    try {
      updateStep(2, { state: "running" });
      const dlRes = await fetch("/api/okx-rebate/csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "download-csv", downloadUrl }),
      });
      const dlData = await dlRes.json();
      if (dlData.error) throw new Error(dlData.error);
      const csvRows = dlData.rows as OkxRebateRow[];

      saveCacheData(beginDate, endDate, csvRows);
      setCachedRanges(loadCacheIndex());
      setRawCsvRows(csvRows);
      updateStep(2, { state: "done", detail: `${csvRows.length}행` });

      await processAfterCsv(csvRows);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setSteps((prev) =>
        prev.map((s) =>
          s.state === "running" ? { ...s, state: "error", detail: msg } : s,
        ),
      );
    } finally {
      setRunning(false);
    }
  }

  async function handleSubmit(params: { beginDate: string; endDate: string; forceDownload: boolean }) {
    setRunning(true);
    setError(null);
    setSteps(makeSteps());
    setAddressSummaries([]);
    setUnmatchedOrders([]);
    setAllOrders([]);
    setSummary(null);
    setDateRange({ begin: params.beginDate, end: params.endDate });

    let csvRows: OkxRebateRow[] = [];

    try {
      // === CSV 확보 (캐시 or OKX API) ===
      const cached =
        !params.forceDownload
          ? loadCacheData(params.beginDate, params.endDate)
          : null;

      if (cached) {
        // 캐시 사용 — 1~3 단계 건너뜀
        csvRows = cached.rows;
        updateStep(0, { state: "done", detail: "캐시 사용" });
        updateStep(1, { state: "done", detail: "캐시 사용" });
        updateStep(2, { state: "done", detail: `${cached.rows.length}행 (캐시)` });
      } else {
        // Step 1: CSV 생성 요청
        updateStep(0, { state: "running" });
        const createRes = await fetch("/api/okx-rebate/csv", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "create-link",
            beginDate: params.beginDate,
            endDate: params.endDate,
          }),
        });
        const createData = await createRes.json();
        if (createData.error) throw new Error(createData.error);
        const requestId = createData.requestId as number;
        updateStep(0, { state: "done" });

        // Step 2: 링크 폴링
        updateStep(1, { state: "running" });
        let downloadUrl: string | null = null;
        for (let attempt = 1; attempt <= POLL_MAX_ATTEMPTS; attempt++) {
          updateStep(1, {
            state: "running",
            detail: `폴링 ${attempt}/${POLL_MAX_ATTEMPTS}...`,
          });

          // Java 코드와 동일: begin=requestId 날짜, end=오늘
          const checkBegin = new Date(requestId).toISOString().slice(0, 10);
          const checkEnd = new Date().toISOString().slice(0, 10);

          const checkRes = await fetch("/api/okx-rebate/csv", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "check-link",
              requestId,
              beginDate: checkBegin,
              endDate: checkEnd,
            }),
          });
          const checkData = await checkRes.json();
          if (checkData.error) throw new Error(checkData.error);

          if (checkData.ready) {
            downloadUrl = checkData.downloadUrl;
            break;
          }

          await sleep(POLL_INTERVAL_MS);
        }

        if (!downloadUrl) {
          throw new Error(
            `CSV 생성 대기 타임아웃 (${POLL_MAX_ATTEMPTS}회, ${(POLL_MAX_ATTEMPTS * POLL_INTERVAL_MS) / 1000}초 초과)`,
          );
        }
        updateStep(1, { state: "done" });

        // Step 3: CSV 다운로드
        updateStep(2, { state: "running" });
        const dlRes = await fetch("/api/okx-rebate/csv", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "download-csv",
            downloadUrl,
          }),
        });
        const dlData = await dlRes.json();
        if (dlData.error) throw new Error(dlData.error);
        csvRows = dlData.rows as OkxRebateRow[];

        // 캐시 저장
        saveCacheData(params.beginDate, params.endDate, csvRows);
        setCachedRanges(loadCacheIndex());

        updateStep(2, { state: "done", detail: `${csvRows.length}행` });
      }

      setRawCsvRows(csvRows);
      await processAfterCsv(csvRows);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      // 현재 running인 step을 error로
      setSteps((prev) =>
        prev.map((s) =>
          s.state === "running" ? { ...s, state: "error", detail: msg } : s,
        ),
      );
    } finally {
      setRunning(false);
    }
  }

  function handleExportRawCsv() {
    const header = "BrokerCode,Level,InstId,OrderId,SpotTradeAmt,DerivativeTradeAmt,Fee,BrokerRebate,NetFee,SettlementFee,SubBrokerRebate,UserRebate,Affiliate,TS";
    const lines = [header];
    for (const r of rawCsvRows) {
      lines.push(
        `${r.brokerCode},${r.level},${r.instId},${r.orderId},${r.spotTradeAmt},${r.derivativeTradeAmt},${r.fee},${r.brokerRebate},${r.netFee},${r.settlementFee},${r.subBrokerRebate},${r.userRebate},${r.affiliated},${r.ts}`,
      );
    }
    downloadCsvFile(
      `okx-rebate-raw-${dateRange.begin}-to-${dateRange.end}.csv`,
      lines.join("\n"),
    );
  }

  function handleExportSummaryCsv() {
    const header = "Address,EX 계정 ID,누적 거래량(USD),누적 수수료(USD),누적 브로커피(USD),브로커피/수수료(%),브로커피/거래량(%),가입일자";
    const lines = [header];
    for (const r of displayRows) {
      const rebateFeeRatio = r.totalFee > 0 ? ((r.totalRebate / r.totalFee) * 100).toFixed(4) : "0";
      const rebateVolumeRatio = r.totalVolume > 0 ? ((r.totalRebate / r.totalVolume) * 100).toFixed(4) : "0";
      lines.push(
        `${r.address},${r.exAccountId},${csvNum(r.totalVolume)},${csvNum(r.totalFee)},${csvNum(r.totalRebate)},${rebateFeeRatio},${rebateVolumeRatio},${r.registeredDate}`,
      );
    }
    downloadCsvFile(
      `okx-rebate-summary-${dateRange.begin}-to-${dateRange.end}.csv`,
      lines.join("\n"),
    );
  }

  function handleExportDetailCsv() {
    const header = "Address,OrderId,TradeId,Symbol,Direction,Price,Quantity,Volume,Fee(CSV),BrokerRebate,TradedAt";
    const lines = [header];
    for (const r of displayRows) {
      for (const d of r.details) {
        lines.push(
          `${r.address},${d.orderId},${d.tradeId},${d.symbol},${d.direction},${csvNum(d.price)},${csvNum(d.quantity)},${csvNum(d.price * d.quantity)},${csvNum(Math.abs(d.csvFee))},${csvNum(d.brokerRebate)},${d.tradedAt || ""}`,
        );
      }
    }
    downloadCsvFile(
      `okx-rebate-detail-${dateRange.begin}-to-${dateRange.end}.csv`,
      lines.join("\n"),
    );
  }

  function handleExportAllOrdersCsv(filtered: AllOrderRow[]) {
    const header = "상태,노트,OrderId,종목,Fee,NetFee,BrokerRebate,거래량,ExchangeUID,Address,시각(UTC)";
    const lines = [header];
    for (const r of filtered) {
      const reason = r.unmapReason === "no_trade" ? "DB 미존재" : r.unmapReason === "no_address" ? "주소 유추" : "";
      const utc = new Date(r.ts).toISOString().replace("T", " ").slice(0, 19);
      lines.push(
        `${r.mapped ? "매핑" : "미매핑"},${reason},${r.orderId},${r.instId},${csvNum(Math.abs(r.fee))},${csvNum(Math.abs(r.netFee))},${csvNum(r.brokerRebate)},${csvNum(r.derivativeTradeAmt)},${r.exchangeUid || ""},${r.address || ""},${utc}`,
      );
    }
    downloadCsvFile(
      `okx-rebate-orders-${dateRange.begin}-to-${dateRange.end}.csv`,
      lines.join("\n"),
    );
  }

  function handleSelectCache(beginDate: string, endDate: string) {
    // 캐시 데이터로 바로 조회 (OKX API 호출 없음)
    handleSubmit({ beginDate, endDate, forceDownload: false });
  }

  async function handleSelectMultipleCache(keys: string[]) {
    setRunning(true);
    setError(null);
    setSteps(makeSteps({
      0: { state: "done", detail: "캐시 합산" },
      1: { state: "done", detail: "캐시 합산" },
      2: { state: "done", detail: `${keys.length}건 병합` },
    }));
    setAddressSummaries([]);
    setUnmatchedOrders([]);
    setAllOrders([]);
    setSummary(null);

    try {
      // 선택된 캐시들의 CSV rows를 모두 합침
      const allRows: OkxRebateRow[] = [];
      const ranges: string[] = [];
      for (const key of keys) {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const data = JSON.parse(raw) as { meta: CachedRange; rows: OkxRebateRow[] };
        allRows.push(...data.rows);
        ranges.push(`${data.meta.beginDate}~${data.meta.endDate}`);
      }

      if (allRows.length === 0) throw new Error("선택된 캐시에 데이터가 없습니다.");

      setDateRange({ begin: ranges[0].split("~")[0], end: ranges[ranges.length - 1].split("~")[1] });
      setRawCsvRows(allRows);
      updateStep(2, { state: "done", detail: `${allRows.length}행 (${keys.length}건 합산)` });

      await processAfterCsv(allRows);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setSteps((prev) =>
        prev.map((s) =>
          s.state === "running" ? { ...s, state: "error", detail: msg } : s,
        ),
      );
    } finally {
      setRunning(false);
    }
  }

  function handleDeleteCache(key: string) {
    deleteCacheEntry(key);
    setCachedRanges(loadCacheIndex());
  }

  function handleClearAllCache() {
    clearAllCache();
    setCachedRanges([]);
  }

  const hasData = summary !== null;

  const tabCls = (t: Tab) =>
    `px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
      tab === t
        ? "border-blue-500 text-blue-600 dark:text-blue-400"
        : "border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
    }`;

  return (
    <div className="flex flex-col gap-5">
      <CredentialsForm
        onSubmit={handleSubmit}
        onUseExistingLink={handleUseExistingLink}
        disabled={running}
        cachedRanges={cachedRanges}
      />

      {/* 진행 상태 */}
      {(running || steps.some((s) => s.state !== "pending")) && (
        <ProgressSteps steps={steps} />
      )}

      {/* 에러 */}
      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      {/* 결과 영역 */}
      {hasData && (
        <>
          {/* 탭 + affiliate 필터 */}
          <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-700">
            <div className="flex">
              <button className={tabCls("result")} onClick={() => setTab("result")}>
                매핑 결과
              </button>
              <button className={tabCls("daily")} onClick={() => setTab("daily")}>
                일별 통계
              </button>
              <button className={tabCls("allorders")} onClick={() => setTab("allorders")}>
                전체 주문 ({allOrders.length})
              </button>
              <button className={tabCls("cache")} onClick={() => setTab("cache")}>
                캐시 관리
              </button>
            </div>
            <div className="flex items-center gap-3 pr-2">
              {rawCsvRows.length > 0 && (
                <button
                  onClick={handleExportRawCsv}
                  className="rounded-md border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-700"
                >
                  OKX 원본 CSV ({rawCsvRows.length}행)
                </button>
              )}
              {tab === "result" && (
                <>
                  <label className="flex items-center gap-1.5 text-sm text-zinc-500 dark:text-zinc-400">
                    <input
                      type="checkbox"
                      checked={affiliateOnly}
                      onChange={(e) => setAffiliateOnly(e.target.checked)}
                      className="rounded"
                    />
                    affiliate_no=1 만
                  </label>
                  <select
                    value={exFilter}
                    onChange={(e) => setExFilter(e.target.value as "all" | "with_ex" | "without_ex")}
                    className="rounded-md border border-zinc-300 px-2 py-1 text-sm text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                  >
                    <option value="all">EX 계정: 전체</option>
                    <option value="with_ex">EX 계정 있음</option>
                    <option value="without_ex">EX 계정 없음</option>
                  </select>
                </>
              )}
            </div>
          </div>

          {tab === "result" && (
            <div className="flex flex-col gap-4">
              {displaySummary && <SummaryPanel summary={displaySummary} />}
              <RebateTable
                rows={displayRows}
                onExportSummaryCsv={handleExportSummaryCsv}
                onExportDetailCsv={handleExportDetailCsv}
              />
            </div>
          )}

          {tab === "daily" && (
            <DailyStatsTable
              rows={addressSummaries}
              affiliateUsers={affiliateUsers}
              dateRange={dateRange}
            />
          )}

          {tab === "allorders" && (
            <AllOrdersTable
              rows={allOrders}
              onExportCsv={handleExportAllOrdersCsv}
            />
          )}

          {tab === "cache" && (
            <CacheManager
              entries={cachedRanges}
              onSelect={handleSelectCache}
              onSelectMultiple={handleSelectMultipleCache}
              onDelete={handleDeleteCache}
              onClearAll={handleClearAllCache}
              disabled={running}
            />
          )}
        </>
      )}

      {/* 데이터 로딩 전 캐시 관리 */}
      {!hasData && !running && cachedRanges.length > 0 && (
        <div className="rounded-md border border-zinc-200 p-4 dark:border-zinc-700">
          <h3 className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            캐시 관리
          </h3>
          <CacheManager
            entries={cachedRanges}
            onSelect={handleSelectCache}
            onSelectMultiple={handleSelectMultipleCache}
            onDelete={handleDeleteCache}
            onClearAll={handleClearAllCache}
            disabled={running}
          />
        </div>
      )}
    </div>
  );
}
