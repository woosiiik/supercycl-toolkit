"use client";

import { useState, useEffect, useCallback } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

const SUPABASE_URL = "https://crliioegbtkgdlrypnap.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNybGlpb2VnYnRrZ2RscnlwbmFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NjkxNjIsImV4cCI6MjA5MTQ0NTE2Mn0.Yy5pQJoYGiRrDCgJi_a8jEy25vuLstY1TGUeY3GE60c";

type Interval = "10m" | "30m" | "1h" | "1d";

interface ChartPoint {
  time: string;
  total: number;
  ym: number;
  okx: number;
}

const INTERVAL_OPTIONS: { value: Interval; label: string }[] = [
  { value: "10m", label: "10분" },
  { value: "30m", label: "30분" },
  { value: "1h", label: "1시간" },
  { value: "1d", label: "일" },
];

const headers = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
};
// created_at 목록을 시간 버킷별 누적 카운트로 변환
function bucketKey(date: Date, interval: Interval): string {
  const mo = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const m = date.getMinutes();

  switch (interval) {
    case "10m": {
      const bucket = Math.floor(m / 10) * 10;
      return `${mo}/${d} ${h}:${String(bucket).padStart(2, "0")}`;
    }
    case "30m": {
      const bucket = m < 30 ? "00" : "30";
      return `${mo}/${d} ${h}:${bucket}`;
    }
    case "1h":
      return `${mo}/${d} ${h}:00`;
    case "1d":
      return `${date.getFullYear()}-${mo}-${d}`;
  }
}

function buildCumulativeChart(
  users: string[],
  ymUsers: string[],
  okxUsers: string[],
  interval: Interval,
): ChartPoint[] {
  // 모든 시간을 수집하여 버킷별 신규 가입 수 계산
  const allBuckets = new Set<string>();

  const countByBucket = (dates: string[]) => {
    const map = new Map<string, number>();
    for (const d of dates) {
      const key = bucketKey(new Date(d), interval);
      allBuckets.add(key);
      map.set(key, (map.get(key) || 0) + 1);
    }
    return map;
  };

  const totalMap = countByBucket(users);
  const ymMap = countByBucket(ymUsers);
  const okxMap = countByBucket(okxUsers);

  // 버킷을 시간순 정렬
  const sorted = Array.from(allBuckets).sort();

  // 누적 합계 계산
  let cumTotal = 0;
  let cumYm = 0;
  let cumOkx = 0;

  // 차트 시작 전 이미 존재하는 레코드 수 (첫 버킷 이전)
  // → 전체 데이터를 가져오므로 0부터 누적하면 됨
  return sorted.map((time) => {
    cumTotal += totalMap.get(time) || 0;
    cumYm += ymMap.get(time) || 0;
    cumOkx += okxMap.get(time) || 0;
    return { time, total: cumTotal, ym: cumYm, okx: cumOkx };
  });
}

async function fetchAllCreatedAt(table: string): Promise<string[]> {
  const dates: string[] = [];
  let offset = 0;
  const limit = 1000;

  while (true) {
    const url =
      `${SUPABASE_URL}/rest/v1/${table}` +
      `?select=created_at&order=created_at.asc` +
      `&offset=${offset}&limit=${limit}`;

    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${table}`);

    const rows: { created_at: string }[] = await res.json();
    for (const r of rows) dates.push(r.created_at);

    if (rows.length < limit) break;
    offset += limit;
  }

  return dates;
}

export default function UserDashboard() {
  const [interval, setInterval_] = useState<Interval>("1d");
  const [data, setData] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [totalCounts, setTotalCounts] = useState({ total: 0, ym: 0, okx: 0 });

  const fetchData = useCallback(async (iv: Interval) => {
    setLoading(true);
    setError(null);
    try {
      const [users, ymUsers, okxUsers] = await Promise.all([
        fetchAllCreatedAt("users"),
        fetchAllCreatedAt("ym_users"),
        fetchAllCreatedAt("okx_users"),
      ]);

      setTotalCounts({
        total: users.length,
        ym: ymUsers.length,
        okx: okxUsers.length,
      });

      const points = buildCumulativeChart(users, ymUsers, okxUsers, iv);
      setData(points);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (err) {
      setError(err instanceof Error ? err.message : "데이터 조회 실패");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(interval);
  }, [interval, fetchData]);

  // 자동 새로고침 (30초)
  useEffect(() => {
    if (!autoRefresh) return;
    const timer = window.setInterval(() => fetchData(interval), 30_000);
    return () => window.clearInterval(timer);
  }, [autoRefresh, interval, fetchData]);

  return (
    <div className="flex flex-col gap-6">
      {/* 컨트롤 바 */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-md border border-zinc-300 dark:border-zinc-600">
          {INTERVAL_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setInterval_(opt.value)}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                interval === opt.value
                  ? "bg-blue-600 text-white"
                  : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-700"
              } ${opt.value === "10m" ? "rounded-l-md" : ""} ${opt.value === "1d" ? "rounded-r-md" : ""}`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-1.5 text-sm text-zinc-500 dark:text-zinc-400">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
            className="rounded"
          />
          자동 새로고침 (30초)
        </label>

        <button
          onClick={() => fetchData(interval)}
          disabled={loading}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-700"
        >
          {loading ? "조회 중..." : "🔄 새로고침"}
        </button>

        {lastUpdated && (
          <span className="text-xs text-zinc-400">
            마지막 업데이트: {lastUpdated}
          </span>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      {/* 현재 수치 카드 */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="총 가입자" value={totalCounts.total} color="blue" />
        <StatCard label="YM 연동" value={totalCounts.ym} color="emerald" />
        <StatCard label="OKX 연동" value={totalCounts.okx} color="amber" />
      </div>

      {/* 차트 */}
      {data.length > 0 ? (
        <div className="rounded-md border border-zinc-300 bg-white p-4 dark:border-zinc-600 dark:bg-zinc-900">
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={data}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#374151"
                opacity={0.2}
              />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 11 }}
                interval="preserveStartEnd"
              />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#18181b",
                  border: "1px solid #3f3f46",
                  borderRadius: "6px",
                  fontSize: "13px",
                }}
                labelStyle={{ color: "#a1a1aa" }}
              />
              <Legend />
              <Line
                type="stepAfter"
                dataKey="total"
                name="총 가입자"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="stepAfter"
                dataKey="ym"
                name="YM 연동"
                stroke="#10b981"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="stepAfter"
                dataKey="okx"
                name="OKX 연동"
                stroke="#f59e0b"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        !loading && (
          <div className="rounded-md border border-zinc-200 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
            데이터가 없습니다. sync 스크립트를 실행해주세요.
            <br />
            <code className="mt-2 inline-block rounded bg-zinc-100 px-2 py-1 text-xs dark:bg-zinc-800">
              npx tsx scripts/sync-user-stats.ts --loop
            </code>
          </div>
        )
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: "blue" | "emerald" | "amber";
}) {
  const colorMap = {
    blue: "text-blue-600 dark:text-blue-400",
    emerald: "text-emerald-600 dark:text-emerald-400",
    amber: "text-amber-600 dark:text-amber-400",
  };

  return (
    <div className="rounded-md border border-zinc-200 p-4 dark:border-zinc-700">
      <div className="text-xs text-zinc-500 dark:text-zinc-400">{label}</div>
      <div
        className={`mt-1 text-2xl font-bold tabular-nums ${colorMap[color]}`}
      >
        {value.toLocaleString()}
      </div>
    </div>
  );
}
