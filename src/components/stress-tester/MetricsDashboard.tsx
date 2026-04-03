"use client";

import { useRef, useEffect } from "react";
import type { StressMetrics, MinuteMetrics } from "@/types/stress";

interface MetricsDashboardProps {
  metrics: StressMetrics;
  isRunning: boolean;
  minuteHistory: MinuteMetrics[];
}

const metricCards: { key: keyof StressMetrics; label: string; color: string }[] = [
  { key: "wsConnections", label: "WS 연결", color: "text-blue-600 dark:text-blue-400" },
  { key: "channelSubscriptions", label: "채널 구독", color: "text-purple-600 dark:text-purple-400" },
  { key: "getRequests", label: "GET 요청", color: "text-green-600 dark:text-green-400" },
  { key: "postRequests", label: "POST 요청", color: "text-cyan-600 dark:text-cyan-400" },
  { key: "errors", label: "에러", color: "text-red-600 dark:text-red-400" },
  { key: "rateLimits", label: "Rate-Limit", color: "text-yellow-600 dark:text-yellow-400" },
];

export default function MetricsDashboard({ metrics, isRunning, minuteHistory }: MetricsDashboardProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [minuteHistory]);

  return (
    <div className="flex flex-col gap-4 rounded-md border border-zinc-300 p-4 dark:border-zinc-600">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
          실시간 메트릭 (누적)
        </h3>
        {isRunning && (
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-green-500" />
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {metricCards.map(({ key, label, color }) => (
          <div key={key} className="flex flex-col gap-1 rounded-md border border-zinc-200 p-3 dark:border-zinc-700">
            <span className="text-xs text-zinc-500 dark:text-zinc-400">{label}</span>
            <span className={`text-lg font-semibold tabular-nums ${color}`}>{metrics[key]}</span>
          </div>
        ))}
      </div>

      {/* 1분 단위 히스토리 */}
      {minuteHistory.length > 0 && (
        <div className="flex flex-col gap-2">
          <h4 className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
            1분 단위 통계
          </h4>
          <div ref={scrollRef} className="max-h-48 overflow-y-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                <tr>
                  <th className="px-3 py-1.5 font-medium">시간</th>
                  <th className="px-3 py-1.5 font-medium">GET</th>
                  <th className="px-3 py-1.5 font-medium">POST</th>
                  <th className="px-3 py-1.5 font-medium">에러</th>
                  <th className="px-3 py-1.5 font-medium">Rate-Limit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-700">
                {minuteHistory.map((m, i) => (
                  <tr key={i} className="text-zinc-900 dark:text-zinc-100">
                    <td className="px-3 py-1 tabular-nums">{m.startTime}</td>
                    <td className="px-3 py-1 tabular-nums text-green-600 dark:text-green-400">{m.getRequests}</td>
                    <td className="px-3 py-1 tabular-nums text-cyan-600 dark:text-cyan-400">{m.postRequests}</td>
                    <td className="px-3 py-1 tabular-nums text-red-600 dark:text-red-400">{m.errors}</td>
                    <td className="px-3 py-1 tabular-nums text-yellow-600 dark:text-yellow-400">{m.rateLimits}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}