"use client";

import type { StressMetrics } from "@/types/stress";

interface MetricsDashboardProps {
  metrics: StressMetrics;
  isRunning: boolean;
}

const metricCards: { key: keyof StressMetrics; label: string; color: string }[] = [
  { key: "wsConnections", label: "WS 연결", color: "text-blue-600 dark:text-blue-400" },
  { key: "channelSubscriptions", label: "채널 구독", color: "text-purple-600 dark:text-purple-400" },
  { key: "getRequests", label: "GET 요청", color: "text-green-600 dark:text-green-400" },
  { key: "postRequests", label: "POST 요청", color: "text-cyan-600 dark:text-cyan-400" },
  { key: "errors", label: "에러", color: "text-red-600 dark:text-red-400" },
  { key: "rateLimits", label: "Rate-Limit", color: "text-yellow-600 dark:text-yellow-400" },
];

export default function MetricsDashboard({ metrics, isRunning }: MetricsDashboardProps) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-zinc-300 p-4 dark:border-zinc-600">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
          실시간 메트릭
        </h3>
        {isRunning && (
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-green-500" />
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {metricCards.map(({ key, label, color }) => (
          <div
            key={key}
            className="flex flex-col gap-1 rounded-md border border-zinc-200 p-3 dark:border-zinc-700"
          >
            <span className="text-xs text-zinc-500 dark:text-zinc-400">{label}</span>
            <span className={`text-lg font-semibold tabular-nums ${color}`}>
              {metrics[key]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
