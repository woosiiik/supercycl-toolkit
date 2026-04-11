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
  ymEx: number;
  okx: number;
}

interface AffiliateChartPoint {
  time: string;
  youthmeta: number;
  other: number;
}

interface SignupMemoChartPoint {
  time: string;
  mobile: number;
  web: number;
}

interface UserRow {
  created_at: string;
  affiliate_no: number | null;
  signup_memo: string | null;
}

const INTERVAL_OPTIONS: { value: Interval; label: string }[] = [
  { value: "10m", label: "10분" },
  { value: "30m", label: "30분" },
  { value: "1h", label: "1시간" },
  { value: "1d", label: "일" },
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
// ── Bucket helpers ──

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

function countByBucket(dates: string[], interval: Interval) {
  const map = new Map<string, number>();
  for (const d of dates) {
    const key = bucketKey(new Date(d), interval);
    map.set(key, (map.get(key) || 0) + 1);
  }
  return map;
}

// ── Chart builders ──

function buildCumulativeChart(
  users: string[],
  ymUsers: string[],
  ymExDates: string[],
  okxUsers: string[],
  interval: Interval,
): ChartPoint[] {
  const allBuckets = new Set<string>();

  const addBuckets = (dates: string[]) => {
    for (const d of dates) allBuckets.add(bucketKey(new Date(d), interval));
  };
  addBuckets(users);
  addBuckets(ymUsers);
  addBuckets(ymExDates);
  addBuckets(okxUsers);

  const totalMap = countByBucket(users, interval);
  const ymMap = countByBucket(ymUsers, interval);
  const ymExMap = countByBucket(ymExDates, interval);
  const okxMap = countByBucket(okxUsers, interval);

  const sorted = Array.from(allBuckets).sort();
  let cumTotal = 0,
    cumYm = 0,
    cumYmEx = 0,
    cumOkx = 0;

  return sorted.map((time) => {
    cumTotal += totalMap.get(time) || 0;
    cumYm += ymMap.get(time) || 0;
    cumYmEx += ymExMap.get(time) || 0;
    cumOkx += okxMap.get(time) || 0;
    return { time, total: cumTotal, ym: cumYm, ymEx: cumYmEx, okx: cumOkx };
  });
}

function buildAffiliateChart(
  userRows: UserRow[],
  interval: Interval,
): AffiliateChartPoint[] {
  const ymDates: string[] = [];
  const otherDates: string[] = [];

  for (const r of userRows) {
    if (r.affiliate_no === 1) {
      ymDates.push(r.created_at);
    } else {
      otherDates.push(r.created_at);
    }
  }

  const allBuckets = new Set<string>();
  const addBuckets = (dates: string[]) => {
    for (const d of dates) allBuckets.add(bucketKey(new Date(d), interval));
  };
  addBuckets(ymDates);
  addBuckets(otherDates);

  const ymMap = countByBucket(ymDates, interval);
  const otherMap = countByBucket(otherDates, interval);

  const sorted = Array.from(allBuckets).sort();
  let cumYm = 0,
    cumOther = 0;

  return sorted.map((time) => {
    cumYm += ymMap.get(time) || 0;
    cumOther += otherMap.get(time) || 0;
    return { time, youthmeta: cumYm, other: cumOther };
  });
}

function buildSignupMemoChart(
  userRows: UserRow[],
  interval: Interval,
): SignupMemoChartPoint[] {
  const mobileDates: string[] = [];
  const webDates: string[] = [];

  for (const r of userRows) {
    if (r.signup_memo) {
      mobileDates.push(r.created_at);
    } else {
      webDates.push(r.created_at);
    }
  }

  const allBuckets = new Set<string>();
  const addBuckets = (dates: string[]) => {
    for (const d of dates) allBuckets.add(bucketKey(new Date(d), interval));
  };
  addBuckets(mobileDates);
  addBuckets(webDates);

  const mobileMap = countByBucket(mobileDates, interval);
  const webMap = countByBucket(webDates, interval);

  const sorted = Array.from(allBuckets).sort();
  let cumMobile = 0,
    cumWeb = 0;

  return sorted.map((time) => {
    cumMobile += mobileMap.get(time) || 0;
    cumWeb += webMap.get(time) || 0;
    return { time, mobile: cumMobile, web: cumWeb };
  });
}

// ── Data fetching ──

async function fetchAllUsers(): Promise<UserRow[]> {
  const rows: UserRow[] = [];
  let offset = 0;
  const limit = 1000;

  while (true) {
    const url =
      `${SUPABASE_URL}/rest/v1/users` +
      `?select=created_at,affiliate_no,signup_memo&order=created_at.asc` +
      `&offset=${offset}&limit=${limit}`;

    const res = await fetch(url, { headers: supaHeaders });
    if (!res.ok) throw new Error(`HTTP ${res.status} from users`);

    const batch: UserRow[] = await res.json();
    rows.push(...batch);

    if (batch.length < limit) break;
    offset += limit;
  }

  return rows;
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

    const res = await fetch(url, { headers: supaHeaders });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${table}`);

    const batch: { created_at: string }[] = await res.json();
    for (const r of batch) dates.push(r.created_at);

    if (batch.length < limit) break;
    offset += limit;
  }

  return dates;
}

interface YmUserRow {
  ym_uid: string;
  created_at: string;
}

/** ym_uid 기준 unique Ex 계정의 created_at (가장 빠른 것) */
async function fetchUniqueYmExDates(): Promise<string[]> {
  const rows: YmUserRow[] = [];
  let offset = 0;
  const limit = 1000;

  while (true) {
    const url =
      `${SUPABASE_URL}/rest/v1/ym_users` +
      `?select=ym_uid,created_at&order=created_at.asc` +
      `&offset=${offset}&limit=${limit}`;

    const res = await fetch(url, { headers: supaHeaders });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ym_users`);

    const batch: YmUserRow[] = await res.json();
    rows.push(...batch);

    if (batch.length < limit) break;
    offset += limit;
  }

  // ym_uid 기준 첫 등장 시간만 사용 (unique)
  const seen = new Set<string>();
  const dates: string[] = [];
  for (const r of rows) {
    if (!seen.has(r.ym_uid)) {
      seen.add(r.ym_uid);
      dates.push(r.created_at);
    }
  }
  return dates;
}

// ── Main component ──

type Tab = "overview" | "affiliate" | "signup";

export default function UserDashboard() {
  const [interval, setInterval_] = useState<Interval>("1d");
  const [tab, setTab] = useState<Tab>("overview");
  const [data, setData] = useState<ChartPoint[]>([]);
  const [affiliateData, setAffiliateData] = useState<AffiliateChartPoint[]>([]);
  const [signupData, setSignupData] = useState<SignupMemoChartPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [totalCounts, setTotalCounts] = useState({
    total: 0,
    ym: 0,
    ymEx: 0,
    okx: 0,
  });
  const [affiliateCounts, setAffiliateCounts] = useState({
    youthmeta: 0,
    other: 0,
  });
  const [signupCounts, setSignupCounts] = useState({ mobile: 0, web: 0 });

  const fetchData = useCallback(async (iv: Interval) => {
    setLoading(true);
    setError(null);
    try {
      const [userRows, ymDates, ymExDates, okxDates] = await Promise.all([
        fetchAllUsers(),
        fetchAllCreatedAt("ym_users"),
        fetchUniqueYmExDates(),
        fetchAllCreatedAt("okx_users"),
      ]);

      const allUserDates = userRows.map((r) => r.created_at);

      setTotalCounts({
        total: userRows.length,
        ym: ymDates.length,
        ymEx: ymExDates.length,
        okx: okxDates.length,
      });

      // 전체 통계 차트
      const points = buildCumulativeChart(
        allUserDates,
        ymDates,
        ymExDates,
        okxDates,
        iv,
      );
      setData(points);

      // Affiliate 분석 차트
      const ymCount = userRows.filter((r) => r.affiliate_no === 1).length;
      setAffiliateCounts({
        youthmeta: ymCount,
        other: userRows.length - ymCount,
      });
      const affPoints = buildAffiliateChart(userRows, iv);
      setAffiliateData(affPoints);

      // Signup memo 분석 차트
      const mobileCount = userRows.filter((r) => r.signup_memo).length;
      setSignupCounts({
        mobile: mobileCount,
        web: userRows.length - mobileCount,
      });
      const signupPoints = buildSignupMemoChart(userRows, iv);
      setSignupData(signupPoints);

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

      {/* 탭 */}
      <div className="flex border-b border-zinc-200 dark:border-zinc-700">
        <button
          onClick={() => setTab("overview")}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            tab === "overview"
              ? "border-b-2 border-blue-600 text-blue-600 dark:text-blue-400"
              : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          }`}
        >
          전체 통계
        </button>
        <button
          onClick={() => setTab("affiliate")}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            tab === "affiliate"
              ? "border-b-2 border-blue-600 text-blue-600 dark:text-blue-400"
              : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          }`}
        >
          가입 경로 분석
        </button>
        <button
          onClick={() => setTab("signup")}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            tab === "signup"
              ? "border-b-2 border-blue-600 text-blue-600 dark:text-blue-400"
              : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          }`}
        >
          가입 플랫폼 분석
        </button>
      </div>

      {/* 탭 내용 */}
      {tab === "overview" ? (
        <OverviewTab data={data} totalCounts={totalCounts} loading={loading} />
      ) : tab === "affiliate" ? (
        <AffiliateTab
          data={affiliateData}
          counts={affiliateCounts}
          loading={loading}
        />
      ) : (
        <SignupTab data={signupData} counts={signupCounts} loading={loading} />
      )}
    </div>
  );
}

// ── Sub-components ──

function OverviewTab({
  data,
  totalCounts,
  loading,
}: {
  data: ChartPoint[];
  totalCounts: { total: number; ym: number; ymEx: number; okx: number };
  loading: boolean;
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="총 가입자" value={totalCounts.total} color="blue" />
        <StatCard label="YM 가입자" value={totalCounts.ym} color="emerald" />
        <StatCard label="연동 Ex 계정" value={totalCounts.ymEx} color="amber" />
        <StatCard label="등록 OKX 계정" value={totalCounts.okx} color="amber" />
      </div>

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
                contentStyle={CHART_TOOLTIP_STYLE}
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
                name="YM 가입자"
                stroke="#10b981"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="stepAfter"
                dataKey="ymEx"
                name="연동 Ex 계정"
                stroke="#f97316"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="stepAfter"
                dataKey="okx"
                name="등록 OKX 계정"
                stroke="#f59e0b"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        !loading && <EmptyState />
      )}
    </>
  );
}

function AffiliateTab({
  data,
  counts,
  loading,
}: {
  data: AffiliateChartPoint[];
  counts: { youthmeta: number; other: number };
  loading: boolean;
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <StatCard
          label="유스메타 유저 (affiliate_no=1)"
          value={counts.youthmeta}
          color="emerald"
        />
        <StatCard label="일반 유저" value={counts.other} color="blue" />
      </div>

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
                contentStyle={CHART_TOOLTIP_STYLE}
                labelStyle={{ color: "#a1a1aa" }}
              />
              <Legend />
              <Line
                type="stepAfter"
                dataKey="youthmeta"
                name="유스메타 유저"
                stroke="#10b981"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="stepAfter"
                dataKey="other"
                name="일반 유저"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        !loading && <EmptyState />
      )}
    </>
  );
}

function SignupTab({
  data,
  counts,
  loading,
}: {
  data: SignupMemoChartPoint[];
  counts: { mobile: number; web: number };
  loading: boolean;
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <StatCard
          label="모바일 가입 : ym.supercycl 로 가입"
          value={counts.mobile}
          color="emerald"
        />
        <StatCard label="일반 가입" value={counts.web} color="blue" />
      </div>

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
                contentStyle={CHART_TOOLTIP_STYLE}
                labelStyle={{ color: "#a1a1aa" }}
              />
              <Legend />
              <Line
                type="stepAfter"
                dataKey="mobile"
                name="모바일 가입 (ym.supercycl)"
                stroke="#10b981"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="stepAfter"
                dataKey="web"
                name="일반 가입"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        !loading && <EmptyState />
      )}
    </>
  );
}

function EmptyState() {
  return (
    <div className="rounded-md border border-zinc-200 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
      데이터가 없습니다. sync 스크립트를 실행해주세요.
      <br />
      <code className="mt-2 inline-block rounded bg-zinc-100 px-2 py-1 text-xs dark:bg-zinc-800">
        npx tsx scripts/sync-user-stats.ts --loop
      </code>
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
