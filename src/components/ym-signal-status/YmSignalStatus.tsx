"use client";

import { useState } from "react";

type DbEnv = "local" | "dev";

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
  "rounded-md bg-gray-700 px-3 py-1.5 text-xs font-medium text-gray-300 hover:bg-gray-600";

function formatTs(ts: number) {
  return new Date(ts * 1000).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

function formatDatetime(dt: string) {
  return new Date(dt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
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
          {(["local", "dev"] as const).map((e) => (
            <button
              key={e}
              onClick={() => setEnv(e)}
              className={`px-3 py-1.5 text-sm rounded-md border ${
                env === e
                  ? "bg-blue-600 border-blue-600 text-white"
                  : "bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-400"
              }`}
            >
              {e === "local" ? "Local" : "Dev"}
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
          <p className="text-red-400 text-sm mb-3">{redisError}</p>
        )}

        {(premium.length > 0 || smart.length > 0) && (
          <div className="grid grid-cols-2 gap-4">
            {/* Premium */}
            <div>
              <h4 className="text-xs font-semibold text-gray-400 mb-2 uppercase">
                ym:signal:premium ({premium.length})
              </h4>
              {premium.length === 0 ? (
                <p className="text-xs text-gray-500">(empty)</p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-gray-500 border-b border-gray-700">
                      <th className="pb-1 pr-2">Symbol</th>
                      <th className="pb-1 pr-2">Position</th>
                      <th className="pb-1 pr-2">Confirmed</th>
                      <th className="pb-1">Timestamp</th>
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
                              className="border-b border-gray-800"
                            >
                              <td className="py-1 pr-2 text-gray-300 font-mono">
                                {i === 0 ? symbol : ""}
                              </td>
                              <td className="py-1 pr-2">
                                <span
                                  className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                                    sig.position.startsWith("L")
                                      ? "bg-green-900 text-green-300"
                                      : "bg-red-900 text-red-300"
                                  }`}
                                >
                                  {sig.position}
                                </span>
                              </td>
                              <td className="py-1 pr-2">
                                {sig.confirmed ? (
                                  <span className="text-green-400">Y</span>
                                ) : (
                                  <span className="text-yellow-400">N</span>
                                )}
                              </td>
                              <td className="py-1 text-gray-500">
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
              <h4 className="text-xs font-semibold text-gray-400 mb-2 uppercase">
                ym:signal:smart ({smart.length})
              </h4>
              {smart.length === 0 ? (
                <p className="text-xs text-gray-500">(empty)</p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-gray-500 border-b border-gray-700">
                      <th className="pb-1 pr-2">Symbol</th>
                      <th className="pb-1 pr-2">Position</th>
                      <th className="pb-1">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {smart
                      .sort((a, b) => a.symbol.localeCompare(b.symbol))
                      .map((sig) => (
                        <tr
                          key={sig.symbol}
                          className="border-b border-gray-800"
                        >
                          <td className="py-1 pr-2 text-gray-300 font-mono">
                            {sig.symbol}
                          </td>
                          <td className="py-1 pr-2">
                            <span
                              className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                                sig.position === "LL"
                                  ? "bg-green-900 text-green-300"
                                  : "bg-red-900 text-red-300"
                              }`}
                            >
                              {sig.position}
                            </span>
                          </td>
                          <td className="py-1 text-gray-500">
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
          <p className="text-red-400 text-sm mb-3">{historyError}</p>
        )}

        {history.length > 0 && (
          <div className="flex gap-4">
            {/* 왼쪽: 테이블 + 페이징 */}
            <div className={selectedRow ? "w-1/2" : "w-full"}>
              <p className="text-xs text-gray-500 mb-2">
                총 {historyTotal}건 (Page {historyPage}/{totalPages})
              </p>
              <div className="overflow-auto max-h-[600px]">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-gray-900">
                    <tr className="text-left text-gray-500 border-b border-gray-700">
                      <th className="pb-1 pr-2 w-16">No</th>
                      <th className="pb-1 pr-2 w-28">Type</th>
                      <th className="pb-1 w-40">Created At</th>
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
                        className={`border-b border-gray-800 cursor-pointer hover:bg-gray-800 ${
                          selectedRow?.signal_history_no === row.signal_history_no
                            ? "bg-blue-900/30"
                            : ""
                        }`}
                      >
                        <td className="py-1.5 pr-2 text-gray-400">
                          {row.signal_history_no}
                        </td>
                        <td className="py-1.5 pr-2">
                          <TypeBadge type={row.signal_type} />
                        </td>
                        <td className="py-1.5 text-gray-500">
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
              <div className="w-1/2 border border-gray-700 rounded-lg p-4 sticky top-0 self-start">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-semibold text-gray-400">
                    #{selectedRow.signal_history_no} —{" "}
                    <TypeBadge type={selectedRow.signal_type} /> —{" "}
                    {formatDatetime(selectedRow.created_at)}
                  </h4>
                  <button
                    onClick={() => setSelectedRow(null)}
                    className="text-xs text-gray-500 hover:text-gray-300"
                  >
                    닫기
                  </button>
                </div>
                <pre className="bg-gray-900 rounded p-3 text-xs text-gray-300 overflow-auto max-h-[540px] whitespace-pre-wrap">
                  {formatRawData(selectedRow.raw_data)}
                </pre>
              </div>
            )}
          </div>
        )}
      </Section>
    </div>
  );
}

function TypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    REALTIME: "bg-blue-900 text-blue-300",
    CONFIRMED: "bg-purple-900 text-purple-300",
    MEMBER_NOTIFY: "bg-yellow-900 text-yellow-300",
  };
  return (
    <span
      className={`px-1.5 py-0.5 rounded text-xs font-medium ${colors[type] || "bg-gray-700 text-gray-300"}`}
    >
      {type}
    </span>
  );
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
    <div className="border border-gray-700 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-gray-300 mb-3">{title}</h3>
      {children}
    </div>
  );
}
