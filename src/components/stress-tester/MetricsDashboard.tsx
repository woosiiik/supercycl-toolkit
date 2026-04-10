"use client";

import { useRef, useEffect } from "react";
import type { StressMetrics, MinuteMetrics } from "@/types/stress";

interface MetricsDashboardProps {
  metrics: StressMetrics;
  isRunning: boolean;
  minuteHistory: MinuteMetrics[];
  accountAddress?: string;
  externalIp: string;
}

export default function MetricsDashboard({
  metrics,
  isRunning,
  minuteHistory,
  accountAddress,
  externalIp,
}: MetricsDashboardProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [minuteHistory]);

  const cellBase = "px-4 py-2 text-center tabular-nums";
  const borderR = "border-r border-zinc-200 dark:border-zinc-700";
  const rowLabel = `${borderR} bg-zinc-50 px-4 py-2 font-medium dark:bg-zinc-800/50`;

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
      <div className="text-xs text-zinc-500 dark:text-zinc-400">
        {accountAddress && (
          <div>
            Account:{" "}
            <span className="font-mono">
              {accountAddress.slice(0, 7)}...{accountAddress.slice(-5)}
            </span>
          </div>
        )}
        <div>
          IP: <span className="font-mono">{externalIp}</span>
        </div>
      </div>

      {/* WS 메트릭 */}
      <div className="overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-700">
        <table
          className="w-full text-sm"
          style={{ borderCollapse: "collapse" }}
        >
          <thead>
            <tr className="bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
              <th className={`${borderR} px-4 py-2 text-left font-medium`}>
                WebSocket
              </th>
              <th className={`${borderR} px-4 py-2 text-center font-medium`}>
                수
              </th>
              <th className={`${borderR} px-4 py-2 text-center font-medium`}>
                에러
              </th>
              <th className="px-4 py-2 text-center font-medium">Rate-Limit</th>
            </tr>
          </thead>
          <tbody className="text-zinc-900 dark:text-zinc-100">
            <tr className="border-t border-zinc-200 dark:border-zinc-700">
              <td className={rowLabel}>WS 연결</td>
              <td
                className={`${borderR} ${cellBase} text-blue-600 dark:text-blue-400`}
              >
                {metrics.wsConnections}
              </td>
              <td
                className={`${borderR} ${cellBase} text-pink-600 dark:text-pink-400`}
                rowSpan={2}
              >
                {metrics.wsErrors}
              </td>
              <td
                className={`${cellBase} text-orange-600 dark:text-orange-400`}
                rowSpan={2}
              >
                {metrics.wsRateLimits}
              </td>
            </tr>
            <tr className="border-t border-zinc-100 dark:border-zinc-800">
              <td className={rowLabel}>WS 채널구독</td>
              <td
                className={`${borderR} ${cellBase} text-purple-600 dark:text-purple-400`}
              >
                {metrics.channelSubscriptions}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* API 메트릭 */}
      <div className="overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-700">
        <table
          className="w-full text-sm"
          style={{ borderCollapse: "collapse" }}
        >
          <thead>
            <tr className="bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
              <th className={`${borderR} px-4 py-2 text-left font-medium`}>
                API
              </th>
              <th className={`${borderR} px-4 py-2 text-center font-medium`}>
                요청
              </th>
              <th className={`${borderR} px-4 py-2 text-center font-medium`}>
                성공
              </th>
              <th className={`${borderR} px-4 py-2 text-center font-medium`}>
                에러
              </th>
              <th className="px-4 py-2 text-center font-medium">Rate-Limit</th>
            </tr>
          </thead>
          <tbody className="text-zinc-900 dark:text-zinc-100">
            <tr className="border-t border-zinc-200 dark:border-zinc-700">
              <td className={rowLabel}>Public</td>
              <td
                className={`${borderR} ${cellBase} text-green-600 dark:text-green-400`}
              >
                {metrics.getRequests}
              </td>
              <td
                className={`${borderR} ${cellBase} text-green-700 dark:text-green-300`}
              >
                {metrics.getRequests - metrics.publicErrors}
              </td>
              <td
                className={`${borderR} ${cellBase} text-red-600 dark:text-red-400`}
              >
                {metrics.publicErrors}
              </td>
              <td
                className={`${cellBase} text-yellow-600 dark:text-yellow-400`}
              >
                {metrics.getRateLimits}
              </td>
            </tr>
            <tr className="border-t border-zinc-200 dark:border-zinc-700">
              <td className={rowLabel}>Private</td>
              <td
                className={`${borderR} ${cellBase} text-cyan-600 dark:text-cyan-400`}
              >
                {metrics.postRequests}
              </td>
              <td
                className={`${borderR} ${cellBase} text-cyan-700 dark:text-cyan-300`}
              >
                {metrics.postRequests - metrics.privateErrors}
              </td>
              <td
                className={`${borderR} ${cellBase} text-red-600 dark:text-red-400`}
              >
                {metrics.privateErrors}
              </td>
              <td className={`${cellBase} text-amber-600 dark:text-amber-400`}>
                {metrics.postRateLimits}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* 1분 단위 히스토리 */}
      {minuteHistory.length > 0 && (
        <div className="flex flex-col gap-2">
          <h4 className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
            1분 단위 통계
          </h4>
          <div
            ref={scrollRef}
            className="max-h-64 overflow-y-auto rounded-md border border-zinc-200 dark:border-zinc-700"
          >
            <table
              className="w-full text-sm"
              style={{ borderCollapse: "collapse" }}
            >
              <thead className="sticky top-0 bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                <tr>
                  <th
                    className={`${borderR} px-3 py-1.5 text-left font-medium`}
                  >
                    시간
                  </th>
                  <th
                    className={`${borderR} px-3 py-1.5 text-center font-medium`}
                  >
                    WS연결
                  </th>
                  <th
                    className={`${borderR} px-3 py-1.5 text-center font-medium`}
                  >
                    Public
                  </th>
                  <th
                    className={`${borderR} px-3 py-1.5 text-center font-medium`}
                  >
                    Private
                  </th>
                  <th
                    className={`${borderR} px-3 py-1.5 text-center font-medium`}
                  >
                    WS에러
                  </th>
                  <th
                    className={`${borderR} px-3 py-1.5 text-center font-medium`}
                  >
                    Pub에러
                  </th>
                  <th
                    className={`${borderR} px-3 py-1.5 text-center font-medium`}
                  >
                    Prv에러
                  </th>
                  <th
                    className={`${borderR} px-3 py-1.5 text-center font-medium`}
                  >
                    Pub RL
                  </th>
                  <th
                    className={`${borderR} px-3 py-1.5 text-center font-medium`}
                  >
                    Prv RL
                  </th>
                  <th className="px-3 py-1.5 text-center font-medium">WS RL</th>
                </tr>
              </thead>
              <tbody>
                {minuteHistory.map((m, i) => (
                  <tr
                    key={i}
                    className="border-t border-zinc-200 text-zinc-900 dark:border-zinc-700 dark:text-zinc-100"
                  >
                    <td className={`${borderR} px-3 py-1 tabular-nums`}>
                      {m.startTime}
                    </td>
                    <td
                      className={`${borderR} px-3 py-1 text-center tabular-nums text-blue-600 dark:text-blue-400`}
                    >
                      {m.wsConnections}
                    </td>
                    <td
                      className={`${borderR} px-3 py-1 text-center tabular-nums text-green-600 dark:text-green-400`}
                    >
                      {m.getRequests}
                    </td>
                    <td
                      className={`${borderR} px-3 py-1 text-center tabular-nums text-cyan-600 dark:text-cyan-400`}
                    >
                      {m.postRequests}
                    </td>
                    <td
                      className={`${borderR} px-3 py-1 text-center tabular-nums text-pink-600 dark:text-pink-400`}
                    >
                      {m.wsErrors}
                    </td>
                    <td
                      className={`${borderR} px-3 py-1 text-center tabular-nums text-red-600 dark:text-red-400`}
                    >
                      {m.publicErrors}
                    </td>
                    <td
                      className={`${borderR} px-3 py-1 text-center tabular-nums text-red-600 dark:text-red-400`}
                    >
                      {m.privateErrors}
                    </td>
                    <td
                      className={`${borderR} px-3 py-1 text-center tabular-nums text-yellow-600 dark:text-yellow-400`}
                    >
                      {m.getRateLimits}
                    </td>
                    <td
                      className={`${borderR} px-3 py-1 text-center tabular-nums text-amber-600 dark:text-amber-400`}
                    >
                      {m.postRateLimits}
                    </td>
                    <td className="px-3 py-1 text-center tabular-nums text-orange-600 dark:text-orange-400">
                      {m.wsRateLimits}
                    </td>
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
