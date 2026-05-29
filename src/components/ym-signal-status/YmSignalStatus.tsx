"use client";

import { useState, useRef, useCallback, useEffect } from "react";

type DbEnv = "local" | "dev" | "prod";

interface PremiumSignal {
  symbol: string;
  position: string;
  confirmed: boolean;
  timestamp: number;
}

interface SmartSignal {
  symbol: string;
  position: string;
  timestamp: number;
}

interface HistoryRow {
  signal_history_no: number;
  signal_type: string;
  raw_data: string;
  created_at: string;
}

const btnCls =
  "rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700";
const btnGrayCls =
  "rounded-md bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-200";

function formatTs(ts: number) {
  return new Date(ts * 1000).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

function formatDatetime(dt: string) {
  // DB에 UTC로 저장되어 있으므로 UTC로 파싱 후 KST 변환
  const utcDate = dt.endsWith("Z") ? dt : dt.replace(" ", "T") + "Z";
  return new Date(utcDate).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

export default function YmSignalStatus() {
  const [env, setEnv] = useState<DbEnv>("local");

  // Redis state
  const [premium, setPremium] = useState<PremiumSignal[]>([]);
  const [smart, setSmart] = useState<SmartSignal[]>([]);
  const [redisLoading, setRedisLoading] = useState(false);
  const [redisError, setRedisError] = useState<string | null>(null);

  // History state
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [selectedRow, setSelectedRow] = useState<HistoryRow | null>(null);
  const LIMIT = 30;

  async function fetchRedis() {
    setRedisLoading(true);
    setRedisError(null);
    try {
      const res = await fetch(`/api/ym-signal-status?type=redis&env=${env}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setPremium(data.premium || []);
      setSmart(data.smart || []);
    } catch (e) {
      setRedisError(e instanceof Error ? e.message : String(e));
    } finally {
      setRedisLoading(false);
    }
  }

  async function fetchHistory(page: number = 1) {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const res = await fetch(
        `/api/ym-signal-status?type=history&env=${env}&page=${page}&limit=${LIMIT}`,
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setHistory(data.data || []);
      setHistoryTotal(data.total || 0);
      setHistoryPage(page);
    } catch (e) {
      setHistoryError(e instanceof Error ? e.message : String(e));
    } finally {
      setHistoryLoading(false);
    }
  }

  const totalPages = Math.ceil(historyTotal / LIMIT);

  // Premium 시그널을 symbol 기준 그룹핑
  const premiumBySymbol = premium.reduce(
    (acc, sig) => {
      if (!acc[sig.symbol]) acc[sig.symbol] = [];
      acc[sig.symbol].push(sig);
      return acc;
    },
    {} as Record<string, PremiumSignal[]>,
  );

  return (
    <div className="space-y-6">
      {/* 환경 선택 */}
      <Section title="환경">
        <div className="flex gap-2">
          {(["local", "dev", "prod"] as const).map((e) => (
            <button
              key={e}
              onClick={() => setEnv(e)}
              className={`px-3 py-1.5 text-sm rounded-md border ${
                env === e
                  ? "bg-blue-600 border-blue-600 text-white"
                  : "bg-white border-zinc-300 text-zinc-500 hover:border-zinc-400"
              }`}
            >
              {e === "local" ? "Local" : e === "dev" ? "Dev" : "Prod"}
            </button>
          ))}
        </div>
      </Section>

      {/* Redis 현재 시그널 */}
      <Section title="현재 유효 시그널 (Redis)">
        <button
          onClick={fetchRedis}
          disabled={redisLoading}
          className={`${btnCls} mb-4 ${redisLoading ? "opacity-50" : ""}`}
        >
          {redisLoading ? "조회 중..." : "조회"}
        </button>
        {redisError && (
          <p className="text-red-600 text-sm mb-3">{redisError}</p>
        )}

        {(premium.length > 0 || smart.length > 0) && (
          <div className="grid grid-cols-2 gap-4">
            {/* Premium */}
            <div>
              <h4 className="text-xs font-semibold text-zinc-500 mb-2 uppercase">
                ym:signal:premium ({premium.length})
              </h4>
              {premium.length === 0 ? (
                <p className="text-xs text-zinc-500">(empty)</p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-zinc-500 border-b border-zinc-200">
                      <th className="pb-1 pr-2">Symbol</th>
                      <th className="pb-1 pr-2">Position</th>
                      <th className="pb-1 pr-2">Confirmed</th>
                      <th className="pb-1">Timestamp (KST)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(premiumBySymbol)
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([symbol, sigs]) =>
                        sigs
                          .sort((a, b) => a.position.localeCompare(b.position))
                          .map((sig, i) => (
                            <tr
                              key={`${symbol}:${sig.position}`}
                              className="border-b border-zinc-100"
                            >
                              <td className="py-1 pr-2 text-zinc-700 font-mono">
                                {i === 0 ? symbol : ""}
                              </td>
                              <td className="py-1 pr-2">
                                <span
                                  className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                                    sig.position.startsWith("L")
                                      ? "bg-green-100 text-green-800"
                                      : "bg-red-100 text-red-800"
                                  }`}
                                >
                                  {sig.position}
                                </span>
                              </td>
                              <td className="py-1 pr-2">
                                {sig.confirmed ? (
                                  <span className="text-green-600">Y</span>
                                ) : (
                                  <span className="text-yellow-600">N</span>
                                )}
                              </td>
                              <td className="py-1 text-zinc-500">
                                {formatTs(sig.timestamp)}
                              </td>
                            </tr>
                          )),
                      )}
                  </tbody>
                </table>
              )}
            </div>

            {/* Smart */}
            <div>
              <h4 className="text-xs font-semibold text-zinc-500 mb-2 uppercase">
                ym:signal:smart ({smart.length})
              </h4>
              {smart.length === 0 ? (
                <p className="text-xs text-zinc-500">(empty)</p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-zinc-500 border-b border-zinc-200">
                      <th className="pb-1 pr-2">Symbol</th>
                      <th className="pb-1 pr-2">Position</th>
                      <th className="pb-1">Timestamp (KST)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {smart
                      .sort((a, b) => a.symbol.localeCompare(b.symbol))
                      .map((sig) => (
                        <tr
                          key={sig.symbol}
                          className="border-b border-zinc-100"
                        >
                          <td className="py-1 pr-2 text-zinc-700 font-mono">
                            {sig.symbol}
                          </td>
                          <td className="py-1 pr-2">
                            <span
                              className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                                sig.position === "LL"
                                  ? "bg-green-100 text-green-800"
                                  : "bg-red-100 text-red-800"
                              }`}
                            >
                              {sig.position}
                            </span>
                          </td>
                          <td className="py-1 text-zinc-500">
                            {formatTs(sig.timestamp)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </Section>

      {/* 시그널 히스토리 (MySQL) */}
      <Section title="시그널 히스토리 (MySQL: t_ym_signal_history)">
        <button
          onClick={() => fetchHistory(1)}
          disabled={historyLoading}
          className={`${btnCls} mb-4 ${historyLoading ? "opacity-50" : ""}`}
        >
          {historyLoading ? "조회 중..." : "조회"}
        </button>
        {historyError && (
          <p className="text-red-600 text-sm mb-3">{historyError}</p>
        )}

        {history.length > 0 && (
          <div className="flex gap-4">
            {/* 왼쪽: 테이블 + 페이징 */}
            <div className={selectedRow ? "w-1/2" : "w-full"}>
              <p className="text-xs text-zinc-500 mb-2">
                총 {historyTotal}건 (Page {historyPage}/{totalPages})
              </p>
              <div className="overflow-auto max-h-[600px]">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-white">
                    <tr className="text-left text-zinc-500 border-b border-zinc-200">
                      <th className="pb-1 pr-2 w-16">No</th>
                      <th className="pb-1 pr-2 w-28">Type</th>
                      <th className="pb-1 pr-2 w-44">Signal Time (KST)</th>
                      <th className="pb-1 w-44">Created At (KST)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((row) => (
                      <tr
                        key={row.signal_history_no}
                        onClick={() =>
                          setSelectedRow(
                            selectedRow?.signal_history_no === row.signal_history_no
                              ? null
                              : row,
                          )
                        }
                        className={`border-b border-zinc-100 cursor-pointer hover:bg-zinc-50 ${
                          selectedRow?.signal_history_no === row.signal_history_no
                            ? "bg-blue-50"
                            : ""
                        }`}
                      >
                        <td className="py-1.5 pr-2 text-zinc-500">
                          {row.signal_history_no}
                        </td>
                        <td className="py-1.5 pr-2">
                          <TypeBadge type={row.signal_type} />
                        </td>
                        <td className="py-1.5 pr-2 text-zinc-700 font-medium">
                          {extractSignalTime(row.raw_data)}
                        </td>
                        <td className="py-1.5 text-zinc-500">
                          {formatDatetime(row.created_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => fetchHistory(historyPage - 1)}
                    disabled={historyPage <= 1 || historyLoading}
                    className={`${btnGrayCls} ${historyPage <= 1 ? "opacity-30" : ""}`}
                  >
                    Prev
                  </button>
                  <button
                    onClick={() => fetchHistory(historyPage + 1)}
                    disabled={historyPage >= totalPages || historyLoading}
                    className={`${btnGrayCls} ${historyPage >= totalPages ? "opacity-30" : ""}`}
                  >
                    Next
                  </button>
                </div>
              )}
            </div>

            {/* 오른쪽: 상세 보기 */}
            {selectedRow && (
              <DetailPanel
                row={selectedRow}
                onClose={() => setSelectedRow(null)}
              />
            )}
          </div>
        )}
      </Section>
    </div>
  );
}

function DetailPanel({ row, onClose }: { row: HistoryRow; onClose: () => void }) {
  const [search, setSearch] = useState("");
  const [currentIdx, setCurrentIdx] = useState(0);
  const preRef = useRef<HTMLPreElement>(null);
  const formatted = formatRawData(row.raw_data);
  const matchCount = search
    ? formatted.split(search).length - 1
    : 0;

  const scrollToMatch = useCallback((idx: number) => {
    if (!preRef.current) return;
    const marks = preRef.current.querySelectorAll("mark");
    if (marks.length === 0) return;
    const safeIdx = ((idx % marks.length) + marks.length) % marks.length;
    setCurrentIdx(safeIdx);
    marks.forEach((m, i) => {
      (m as HTMLElement).style.backgroundColor = i === safeIdx ? "#f97316" : "";
      (m as HTMLElement).style.color = i === safeIdx ? "white" : "";
    });
    marks[safeIdx].scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  useEffect(() => {
    if (search && matchCount > 0) {
      setCurrentIdx(0);
      // DOM 업데이트 후 스크롤
      setTimeout(() => scrollToMatch(0), 0);
    }
  }, [search, matchCount, scrollToMatch]);

  function prev() { scrollToMatch(currentIdx - 1); }
  function next() { scrollToMatch(currentIdx + 1); }

  return (
    <div className="w-1/2 border border-zinc-200 rounded-lg p-4 sticky top-0 self-start">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-semibold text-zinc-500">
          #{row.signal_history_no} —{" "}
          <TypeBadge type={row.signal_type} /> —{" "}
          {formatDatetime(row.created_at)}
        </h4>
        <button
          onClick={onClose}
          className="text-xs text-zinc-500 hover:text-zinc-900"
        >
          닫기
        </button>
      </div>
      <div className="flex items-center gap-2 mb-2">
        <input
          className="flex-1 px-2 py-1 border border-zinc-300 rounded text-xs text-zinc-900 bg-white"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && matchCount > 0) {
              e.shiftKey ? prev() : next();
            }
          }}
          placeholder="검색... (Enter: 다음, Shift+Enter: 이전)"
        />
        {search && matchCount > 0 && (
          <>
            <button onClick={prev} className="px-1.5 py-0.5 border border-zinc-300 rounded text-xs text-zinc-600 hover:bg-zinc-100">
              ▲
            </button>
            <button onClick={next} className="px-1.5 py-0.5 border border-zinc-300 rounded text-xs text-zinc-600 hover:bg-zinc-100">
              ▼
            </button>
            <span className="text-xs text-zinc-500 whitespace-nowrap">
              {currentIdx + 1}/{matchCount}
            </span>
          </>
        )}
        {search && matchCount === 0 && (
          <span className="text-xs text-red-500 whitespace-nowrap">없음</span>
        )}
      </div>
      <pre ref={preRef} className="bg-zinc-50 rounded p-3 text-xs text-zinc-700 overflow-auto max-h-[500px] whitespace-pre-wrap">
        {search ? highlightText(formatted, search) : formatted}
      </pre>
    </div>
  );
}

function highlightText(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const parts = text.split(query);
  return parts.map((part, i) => (
    <span key={i}>
      {part}
      {i < parts.length - 1 && (
        <mark className="bg-yellow-300 text-zinc-900 rounded-sm px-0.5">{query}</mark>
      )}
    </span>
  ));
}

function TypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    REALTIME: "bg-blue-100 text-blue-800",
    CONFIRMED: "bg-purple-100 text-purple-800",
    MEMBER_NOTIFY: "bg-yellow-100 text-yellow-800",
  };
  return (
    <span
      className={`px-1.5 py-0.5 rounded text-xs font-medium ${colors[type] || "bg-zinc-100 text-zinc-700"}`}
    >
      {type}
    </span>
  );
}

function extractSignalTime(raw: string): string {
  try {
    const parsed = JSON.parse(raw);
    const ts = parsed?.data?.timestamp;
    if (ts) return formatTs(ts);
  } catch {}
  return "-";
}

function formatRawData(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-zinc-200 rounded-lg p-4 bg-white">
      <h3 className="text-sm font-semibold text-zinc-900 mb-3">{title}</h3>
      {children}
    </div>
  );
}
