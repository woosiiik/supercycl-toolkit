"use client";

import { useState, useEffect, useCallback } from "react";
import {
  BarChart,
  Bar,
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

type Interval = "1m" | "10m" | "1h";

interface BarPoint {
  time: string;
  total: number;
  ym: number;
  okx: number;
}

const INTERVAL_OPTIONS: { value: Interval; label: string }[] = [
  { value: "1m", label: "1분" },
  { value: "10m", label: "10분" },
  { value: "1h", label: "1시간" },
];

const supaHeaders = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
};

const CHART_TOOLTIP_STYLE = {
  backgroundColor: "#18181b",
  border: "1px solid #3f3f46",
  borderRadius: "6px",
  fontSize: "13px",
};
function toKST(date: Date): Date {
  return new Date(date.getTime() + 9 * 60 * 60 * 1000);
}

/** KST 기준 오늘 00:00 UTC timestamp */
function getKSTStartOfToday(): Date {
  const now = new Date();
  const kst = toKST(now);
  // KST 기준 오늘 00:00 → UTC로 변환 (-9h)
  const y = kst.getUTCFullYear();
  const m = kst.getUTCMonth();
  const d = kst.getUTCDate();
  return new Date(Date.UTC(y, m, d) - 9 * 60 * 60 * 1000);
}

function bucketLabel(date: Date, interval: Interval): string {
  const kst = toKST(date);
  const mo = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  const h = String(kst.getUTCHours()).padStart(2, "0");
  const min = kst.getUTCMinutes();

  switch (interval) {
    case "1m":
      return `${mo}/${d} ${h}:${String(min).padStart(2, "0")}`;
    case "10m": {
      const bucket = Math.floor(min / 10) * 10;
      return `${mo}/${d} ${h}:${String(bucket).padStart(2, "0")}`;
    }
    case "1h":
      return `${mo}/${d} ${h}:00`;
  }
}

function bucketMs(date: Date, interval: Interval): number {
  const kst = toKST(date);
  const y = kst.getUTCFullYear();
  const mo = kst.getUTCMonth();
  const d = kst.getUTCDate();
  const h = kst.getUTCHours();
  const min = kst.getUTCMinutes();

  switch (interval) {
    case "1m":
      return Date.UTC(y, mo, d, h, min);
    case "10m":
      return Date.UTC(y, mo, d, h, Math.floor(min / 10) * 10);
    case "1h":
      return Date.UTC(y, mo, d, h);
  }
}

function intervalMs(interval: Interval): number {
  switch (interval) {
    case "1m":
      return 60_000;
    case "10m":
      return 600_000;
    case "1h":
      return 3_600_000;
  }
}

function generateAllBuckets(
  startUtc: Date,
  endUtc: Date,
  interval: Interval,
): Map<number, string> {
  const step = intervalMs(interval);
  const startMs = bucketMs(startUtc, interval);
  const kstNow = toKST(endUtc);
  const endMs = Date.UTC(
    kstNow.getUTCFullYear(),
    kstNow.getUTCMonth(),
    kstNow.getUTCDate(),
    kstNow.getUTCHours(),
    kstNow.getUTCMinutes(),
  );

  const map = new Map<number, string>();
  for (let ms = startMs; ms <= endMs; ms += step) {
    // ms는 KST 기준 bucket timestamp
    const d = new Date(ms);
    const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    const h = String(d.getUTCHours()).padStart(2, "0");
    const min = String(d.getUTCMinutes()).padStart(2, "0");

    switch (interval) {
      case "1m":
        map.set(ms, `${mo}/${dd} ${h}:${min}`);
        break;
      case "10m":
        map.set(ms, `${mo}/${dd} ${h}:${min}`);
        break;
      case "1h":
        map.set(ms, `${mo}/${dd} ${h}:00`);
        break;
    }
  }
  return map;
}
function buildBarData(
  userDates: string[],
  ymDates: string[],
  okxDates: string[],
  startUtc: Date,
  endUtc: Date,
  interval: Interval,
): BarPoint[] {
  const allBuckets = generateAllBuckets(startUtc, endUtc, interval);

  // 각 데이터의 bucket별 count
  const count = (dates: string[]) => {
    const map = new Map<number, number>();
    for (const d of dates) {
      const ms = bucketMs(new Date(d), interval);
      map.set(ms, (map.get(ms) || 0) + 1);
    }
    return map;
  };

  const totalMap = count(userDates);
  const ymMap = count(ymDates);
  const okxMap = count(okxDates);

  const points: BarPoint[] = [];
  for (const [ms, label] of allBuckets) {
    points.push({
      time: label,
      total: totalMap.get(ms) || 0,
      ym: ymMap.get(ms) || 0,
      okx: okxMap.get(ms) || 0,
    });
  }
  return points;
}

// ── Data fetching (최근 2일) ──

async function fetchRecentDates(
  table: string,
  since: string,
): Promise<string[]> {
  const dates: string[] = [];
  let offset = 0;
  const limit = 1000;

  while (true) {
    const url =
      `${SUPABASE_URL}/rest/v1/${table}` +
      `?select=created_at&created_at=gte.${since}&order=created_at.asc` +
      `&offset=${offset}&limit=${limit}`;

    const res = await fetch(url, { headers: supaHeaders });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${table}`);

    const batch: { created_at: string }[] = await res.json();
    for (const r of batch) dates.push(r.created_at);

    if (batch.length < limit) break;
    offset += limit;
  }
  return dates;
}

export default function UserSignupDetail() {
  const [interval, setInterval_] = useState<Interval>("1h");
  const [data, setData] = useState<BarPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchData = useCallback(async (iv: Interval) => {
    setLoading(true);
    setError(null);
    try {
      // 인터벌별 조회 범위: 1h=2일, 10m=24시간, 1m=12시간
      const now = new Date();
      const rangeMs =
        iv === "1h"
          ? 2 * 24 * 60 * 60 * 1000
          : iv === "10m"
            ? 24 * 60 * 60 * 1000
            : 2 * 60 * 60 * 1000;
      const sinceUtc = new Date(now.getTime() - rangeMs);
      const sinceIso = sinceUtc.toISOString();

      const [userDates, ymDates, okxDates] = await Promise.all([
        fetchRecentDates("users", sinceIso),
        fetchRecentDates("ym_users", sinceIso),
        fetchRecentDates("okx_users", sinceIso),
      ]);

      const points = buildBarData(
        userDates,
        ymDates,
        okxDates,
        sinceUtc,
        new Date(),
        iv,
      );
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

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = window.setInterval(() => fetchData(interval), 30_000);
    return () => window.clearInterval(timer);
  }, [autoRefresh, interval, fetchData]);

  return (
    <div className="flex flex-col gap-6">
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
              } ${opt.value === "1m" ? "rounded-l-md" : ""} ${opt.value === "1h" ? "rounded-r-md" : ""}`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <span className="text-xs text-zinc-400">
          KST 기준{" "}
          {interval === "1h"
            ? "최근 2일"
            : interval === "10m"
              ? "최근 24시간"
              : "최근 2시간"}
        </span>

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
          <span className="text-xs text-zinc-400">마지막: {lastUpdated}</span>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      {data.length > 0 ? (
        <div className="rounded-md border border-zinc-300 bg-white p-4 dark:border-zinc-600 dark:bg-zinc-900">
          <ResponsiveContainer width="100%" height={450}>
            <BarChart data={data}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#374151"
                opacity={0.2}
              />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 10 }}
                interval="preserveStartEnd"
                angle={-45}
                textAnchor="end"
                height={60}
              />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip
                contentStyle={CHART_TOOLTIP_STYLE}
                labelStyle={{ color: "#a1a1aa" }}
              />
              <Legend />
              <Bar dataKey="total" name="총 가입" fill="#3b82f6" />
              <Bar dataKey="ym" name="YM 가입" fill="#10b981" />
              <Bar dataKey="okx" name="OKX 등록" fill="#f59e0b" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        !loading && (
          <div className="rounded-md border border-zinc-200 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
            데이터가 없습니다.
          </div>
        )
      )}
    </div>
  );
}
