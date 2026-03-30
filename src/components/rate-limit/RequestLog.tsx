"use client";

import { useEffect, useRef } from "react";
import type { RequestLogEntry } from "@/types/hyperliquid";

interface RequestLogProps {
  logs: RequestLogEntry[];
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  const ms = String(date.getMilliseconds()).padStart(3, "0");
  return `${h}:${m}:${s}.${ms}`;
}

function statusColor(code: number): string {
  if (code === 200) return "text-green-500 dark:text-green-400";
  if (code === 429) return "text-red-500 dark:text-red-400";
  return "text-yellow-500 dark:text-yellow-400";
}

export default function RequestLog({ logs }: RequestLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [logs]);

  if (logs.length === 0) {
    return (
      <div className="rounded-md border border-zinc-300 p-4 dark:border-zinc-600">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">로그 없음</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-zinc-300 dark:border-zinc-600">
      <div
        ref={scrollRef}
        className="max-h-80 overflow-y-auto"
      >
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
            <tr>
              <th className="px-3 py-2 font-medium">#</th>
              <th className="px-3 py-2 font-medium">타임스탬프</th>
              <th className="px-3 py-2 font-medium">상태 코드</th>
              <th className="px-3 py-2 font-medium">응답 시간(ms)</th>
              <th className="px-3 py-2 font-medium">항목 수</th>
              <th className="px-3 py-2 font-medium">Weight</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-700">
            {logs.map((log) => (
              <tr
                key={log.requestNumber}
                className="text-zinc-900 dark:text-zinc-100"
              >
                <td className="px-3 py-1.5 tabular-nums">{log.requestNumber}</td>
                <td className="px-3 py-1.5 tabular-nums">{formatTimestamp(log.timestamp)}</td>
                <td className={`px-3 py-1.5 font-medium ${statusColor(log.statusCode)}`}>
                  {log.statusCode}
                </td>
                <td className="px-3 py-1.5 tabular-nums">{log.responseTimeMs}</td>
                <td className="px-3 py-1.5 tabular-nums">{log.itemCount}</td>
                <td className="px-3 py-1.5 tabular-nums">{log.weight}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
