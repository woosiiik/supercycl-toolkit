"use client";

import { useState } from "react";

interface DayRow {
  date: string;
  dailySignup: number;
  dailyYm: number;
  dailyEx: number;
  dailyExRate: string;
  cumSignup: number;
  cumYm: number;
  cumEx: number;
  cumExRate: string;
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

function pct(numerator: number, denominator: number): string {
  if (denominator === 0) return "0.00%";
  return ((numerator / denominator) * 100).toFixed(2) + "%";
}

export default function YmSignupStats() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<DayRow[]>([]);

  async function handleFetch() {
    setLoading(true);
    setError(null);
    setRows([]);

    try {
      const res = await fetch("/api/ym-signup-stats");
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const signupMap = new Map<string, number>();
      for (const r of data.signups as Array<{ dt: string; cnt: number }>) {
        signupMap.set(r.dt, Number(r.cnt));
      }

      const ymMap = new Map<string, number>();
      for (const r of data.ymSignups as Array<{ dt: string; cnt: number }>) {
        ymMap.set(r.dt, Number(r.cnt));
      }

      const exMap = new Map<string, number>();
      for (const r of data.exLinks as Array<{ dt: string; cnt: number }>) {
        exMap.set(r.dt, Number(r.cnt));
      }

      // 2026-04-11부터 오늘까지 모든 날짜 생성
      const allDates: string[] = [];
      const start = new Date("2026-04-11");
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
        allDates.push(d.toISOString().slice(0, 10));
      }

      let cumSignup = 0;
      let cumYm = 0;
      let cumEx = 0;
      const result: DayRow[] = [];

      for (const date of allDates) {
        const dailySignup = signupMap.get(date) || 0;
        const dailyYm = ymMap.get(date) || 0;
        const dailyEx = exMap.get(date) || 0;
        cumSignup += dailySignup;
        cumYm += dailyYm;
        cumEx += dailyEx;

        result.push({
          date,
          dailySignup,
          dailyYm,
          dailyEx,
          dailyExRate: pct(dailyEx, dailyYm),
          cumSignup,
          cumYm,
          cumEx,
          cumExRate: pct(cumEx, cumYm),
        });
      }

      setRows(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  function handleExportCsv() {
    const header = "일자,일일 가입자 수,일일 YM 가입자 수,일일 EX 연동자 수,일일 EX 연동률,누적 가입자,누적 YM 가입자,누적 EX 연동자,누적 EX 연동률";
    const lines = [header];
    for (const r of rows) {
      lines.push(
        `${r.date},${r.dailySignup},${r.dailyYm},${r.dailyEx},${r.dailyExRate},${r.cumSignup},${r.cumYm},${r.cumEx},${r.cumExRate}`,
      );
    }
    downloadCsvFile("ym-signup-stats.csv", lines.join("\n"));
  }

  const tdCls = "px-3 py-2 text-sm";
  const thCls =
    "px-3 py-2 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 select-none";
  const borderR = "border-r border-zinc-200 dark:border-zinc-700";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <button
          onClick={handleFetch}
          disabled={loading}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "조회 중..." : "조회"}
        </button>
        {rows.length > 0 && (
          <button
            onClick={handleExportCsv}
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-700"
          >
            CSV 다운로드
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      {rows.length > 0 && (
        <div className="max-h-[600px] overflow-auto rounded-md border border-zinc-200 dark:border-zinc-700">
          <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
            <thead className="sticky top-0 bg-zinc-100 dark:bg-zinc-800">
              <tr>
                <th className={`${thCls} ${borderR}`}>일자</th>
                <th className={`${thCls} ${borderR} text-right`}>일일 가입자 수</th>
                <th className={`${thCls} ${borderR} text-right`}>일일 YM 가입자 수</th>
                <th className={`${thCls} ${borderR} text-right`}>일일 EX 연동자 수</th>
                <th className={`${thCls} ${borderR} text-right`}>일일 EX 연동률</th>
                <th className={`${thCls} ${borderR} text-right`}>누적 가입자</th>
                <th className={`${thCls} ${borderR} text-right`}>누적 YM 가입자</th>
                <th className={`${thCls} ${borderR} text-right`}>누적 EX 연동자</th>
                <th className={`${thCls} text-right`}>누적 EX 연동률</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.date}
                  className="border-t border-zinc-200 text-zinc-900 dark:border-zinc-700 dark:text-zinc-100"
                >
                  <td className={`${tdCls} ${borderR} tabular-nums`}>{r.date}</td>
                  <td className={`${tdCls} ${borderR} text-right tabular-nums`}>{r.dailySignup}</td>
                  <td className={`${tdCls} ${borderR} text-right tabular-nums`}>{r.dailyYm}</td>
                  <td className={`${tdCls} ${borderR} text-right tabular-nums`}>{r.dailyEx}</td>
                  <td className={`${tdCls} ${borderR} text-right tabular-nums`}>{r.dailyExRate}</td>
                  <td className={`${tdCls} ${borderR} text-right tabular-nums font-medium`}>{r.cumSignup}</td>
                  <td className={`${tdCls} ${borderR} text-right tabular-nums font-medium`}>{r.cumYm}</td>
                  <td className={`${tdCls} ${borderR} text-right tabular-nums font-medium`}>{r.cumEx}</td>
                  <td className={`${tdCls} text-right tabular-nums font-medium`}>{r.cumExRate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
