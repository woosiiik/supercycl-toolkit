"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";

const SignalChart = dynamic(() => import("./SignalChart"), { ssr: false });

type DbEnv = "local" | "dev" | "prod";
type SortMode = "major" | "recent" | "alpha";

interface CoinLatest {
  symbol: string;
  position: string | null;
  signal_type: string | null;
  timestamp: number | null;
}

interface SignalRow {
  signal_no: number;
  symbol: string;
  position: string;
  signal_type: string;
  timestamp: number;
  created_at: string;
}

const INTERVALS = ["1m", "5m", "15m", "1h", "4h", "1d"] as const;

const MAJOR_COINS = [
  "BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "BNBUSDT",
  "DOGEUSDT", "ADAUSDT", "TRXUSDT", "AVAXUSDT", "LINKUSDT",
  "DOTUSDT", "SUIUSDT", "TONUSDT", "SHIBUSDT", "XLMUSDT",
  "LTCUSDT", "NEARUSDT", "UNIUSDT", "APTUSDT", "PEPEUSDT",
  "ICPUSDT", "FILUSDT", "ARBUSDT", "OPUSDT", "MATICUSDT",
  "ATOMUSDT", "RENDERUSDT", "INJUSDT", "FETUSDT", "TIAUSDT",
];

function isLong(position: string): boolean {
  return position.startsWith("L");
}

function coinLabel(coin: CoinLatest): string {
  if (!coin.position) return "-";
  // LL, SS는 그대로
  if (coin.position === "LL" || coin.position === "SS") return coin.position;
  // L1~L3, S1~S3는 확정/미확정 표시
  if (coin.signal_type === "CONFIRMED_PREMIUM") return `${coin.position} 확정`;
  if (coin.signal_type === "REALTIME_PREMIUM") return `${coin.position} 미확정`;
  return coin.position;
}

function formatTs(ts: number) {
  return new Date(ts * 1000).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

function signalTypeBadge(signalType: string) {
  const colors: Record<string, string> = {
    REALTIME_PREMIUM: "bg-blue-100 text-blue-800",
    CONFIRMED_PREMIUM: "bg-purple-100 text-purple-800",
    CONFIRMED_SMART: "bg-indigo-100 text-indigo-800",
    CANCELED: "bg-zinc-200 text-zinc-600",
  };
  return (
    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${colors[signalType] || "bg-zinc-100 text-zinc-600"}`}>
      {signalType}
    </span>
  );
}

function sortCoins(coins: CoinLatest[], mode: SortMode): CoinLatest[] {
  const sorted = [...coins];
  switch (mode) {
    case "major": {
      const majorIndex = new Map(MAJOR_COINS.map((s, i) => [s, i]));
      return sorted.sort((a, b) => {
        const ai = majorIndex.get(a.symbol);
        const bi = majorIndex.get(b.symbol);
        if (ai !== undefined && bi !== undefined) return ai - bi;
        if (ai !== undefined) return -1;
        if (bi !== undefined) return 1;
        return a.symbol.localeCompare(b.symbol);
      });
    }
    case "recent":
      return sorted.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
    case "alpha":
      return sorted.sort((a, b) => a.symbol.localeCompare(b.symbol));
    default:
      return sorted;
  }
}

export default function YmSignalDetail() {
  const [env, setEnv] = useState<DbEnv>("dev");
  const [coins, setCoins] = useState<CoinLatest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("major");

  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [interval, setInterval] = useState<string>("15m");
  const [signals, setSignals] = useState<SignalRow[]>([]);
  const [sigLoading, setSigLoading] = useState(false);

  const fetchCoins = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/ym-signal-detail?env=${env}&type=coins`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setCoins(data.data || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [env]);

  useEffect(() => {
    fetchCoins();
  }, [fetchCoins]);

  const sortedCoins = useMemo(() => sortCoins(coins, sortMode), [coins, sortMode]);

  async function selectCoin(symbol: string) {
    setSelectedSymbol(symbol);
    setSigLoading(true);
    try {
      const res = await fetch(
        `/api/ym-signal-detail?env=${env}&type=history&symbol=${symbol}&limit=500`,
      );
      const data = await res.json();
      if (!data.error) setSignals(data.data || []);
    } finally {
      setSigLoading(false);
    }
  }

  const SORT_OPTIONS: { value: SortMode; label: string }[] = [
    { value: "major", label: "주요코인순" },
    { value: "recent", label: "최근시그널순" },
    { value: "alpha", label: "가나다순" },
  ];

  return (
    <div className="space-y-6">
      {/* 환경 선택 */}
      <Section title="환경">
        <div className="flex gap-2">
          {(["local", "dev", "prod"] as const).map((e) => (
            <button
              key={e}
              onClick={() => { setEnv(e); setSelectedSymbol(null); }}
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

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="flex gap-4 items-start">
        {/* 왼쪽: 코인 목록 */}
        <div className="w-64 shrink-0">
          {/* 정렬 */}
          <div className="flex gap-1 mb-2">
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setSortMode(opt.value)}
                className={`px-2 py-1 text-xs rounded border ${
                  sortMode === opt.value
                    ? "bg-blue-600 border-blue-600 text-white"
                    : "bg-white border-zinc-300 text-zinc-500 hover:border-zinc-400"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {/* 코인 리스트 */}
          <div className="space-y-1">
            {loading ? (
              <p className="text-sm text-zinc-500">로딩 중...</p>
            ) : (
              sortedCoins.map((coin) => (
                <button
                  key={coin.symbol}
                  onClick={() => selectCoin(coin.symbol)}
                  className={`w-full text-left px-3 py-2 rounded text-sm flex items-center justify-between ${
                    selectedSymbol === coin.symbol
                      ? "bg-blue-50 border border-blue-200"
                      : "hover:bg-zinc-50 border border-transparent"
                  }`}
                >
                  <span className="font-mono font-medium text-zinc-900">
                    {coin.symbol}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>

        {/* 오른쪽: 차트 + 시그널 이력 */}
        <div className="flex-1 space-y-4">
          {selectedSymbol ? (
            <>
              {/* 차트 */}
              <Section title={selectedSymbol}>
                <div className="flex gap-2 mb-3">
                  {INTERVALS.map((iv) => (
                    <button
                      key={iv}
                      onClick={() => setInterval(iv)}
                      className={`px-2 py-1 text-xs rounded border ${
                        interval === iv
                          ? "bg-blue-600 border-blue-600 text-white"
                          : "bg-white border-zinc-300 text-zinc-500 hover:border-zinc-400"
                      }`}
                    >
                      {iv}
                    </button>
                  ))}
                </div>
                <SignalChart
                  symbol={selectedSymbol}
                  signals={signals}
                  interval={interval}
                />
              </Section>

              {/* 시그널 이력 */}
              <Section title={`시그널 이력 (${signals.length}건)`}>
                {sigLoading ? (
                  <p className="text-sm text-zinc-500">로딩 중...</p>
                ) : signals.length === 0 ? (
                  <p className="text-sm text-zinc-500">시그널 이력이 없습니다.</p>
                ) : (
                  <div className="overflow-auto max-h-[400px]">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-white">
                        <tr className="text-left text-zinc-500 border-b border-zinc-200">
                          <th className="pb-1 pr-2 w-12">No</th>
                          <th className="pb-1 pr-2 w-16">Position</th>
                          <th className="pb-1 pr-2">Type</th>
                          <th className="pb-1 pr-2 w-44">Signal Time (KST)</th>
                          <th className="pb-1 w-44">Created At (KST)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {signals.map((sig) => (
                          <tr key={sig.signal_no} className="border-b border-zinc-100">
                            <td className="py-1.5 pr-2 text-zinc-500">{sig.signal_no}</td>
                            <td className="py-1.5 pr-2">
                              <span
                                className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                                  sig.signal_type === "CANCELED"
                                    ? "bg-zinc-200 text-zinc-600"
                                    : isLong(sig.position)
                                      ? "bg-green-100 text-green-800"
                                      : "bg-red-100 text-red-800"
                                }`}
                              >
                                {sig.position}
                              </span>
                            </td>
                            <td className="py-1.5 pr-2">
                              {signalTypeBadge(sig.signal_type)}
                            </td>
                            <td className="py-1.5 pr-2 text-zinc-700 font-medium">
                              {formatTs(sig.timestamp)}
                            </td>
                            <td className="py-1.5 text-zinc-500">
                              {formatCreatedAt(sig.created_at)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Section>
            </>
          ) : (
            <Section title="차트">
              <p className="text-sm text-zinc-500">왼쪽에서 코인을 선택하세요.</p>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}

function formatCreatedAt(dt: string) {
  const utcDate = typeof dt === "string" && !dt.endsWith("Z")
    ? dt.replace(" ", "T") + "Z"
    : dt;
  return new Date(utcDate).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
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
