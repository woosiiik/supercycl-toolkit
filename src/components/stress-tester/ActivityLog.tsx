"use client";

import { useState, useEffect, useRef } from "react";
import type { LogEntry, LogAction } from "@/types/stress";

interface ActivityLogProps {
  logs: LogEntry[];
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  const ms = String(date.getMilliseconds()).padStart(3, "0");
  return `${h}:${m}:${s}.${ms}`;
}

const actionConfig: Record<LogAction, { label: string; className: string }> = {
  connect: {
    label: "WS연결",
    className: "bg-blue-200 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  },
  subscribe: {
    label: "WS채널구독",
    className:
      "bg-purple-200 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
  },
  leverage: {
    label: "레버리지",
    className: "bg-cyan-200 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-300",
  },
  order: {
    label: "주문",
    className:
      "bg-indigo-200 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-300",
  },
  cancel: {
    label: "취소",
    className:
      "bg-orange-200 text-orange-800 dark:bg-orange-900 dark:text-orange-300",
  },
  query: {
    label: "조회",
    className:
      "bg-green-200 text-green-800 dark:bg-green-900 dark:text-green-300",
  },
  error: {
    label: "에러",
    className: "bg-red-200 text-red-800 dark:bg-red-900 dark:text-red-300",
  },
};

export default function ActivityLog({ logs }: ActivityLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const isAtBottomRef = useRef(true);

  // 스크롤 위치 추적: 맨 아래에 있을 때만 자동 스크롤
  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const threshold = 30;
    isAtBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  }

  useEffect(() => {
    const el = scrollRef.current;
    if (el && isAtBottomRef.current) {
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
        onScroll={handleScroll}
      >
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
            <tr>
              <th className="px-3 py-2 font-medium">시간</th>
              <th className="px-3 py-2 font-medium">인스턴스</th>
              <th className="px-3 py-2 font-medium">작업</th>
              <th className="px-3 py-2 font-medium">결과</th>
              <th className="px-3 py-2 font-medium">상세</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-700">
            {logs.map((log, idx) => {
              const action = actionConfig[log.action];
              return (
                <tr key={idx} className="text-zinc-900 dark:text-zinc-100">
                  <td className="whitespace-nowrap px-3 py-1.5 tabular-nums">
                    {formatTimestamp(log.timestamp)}
                  </td>
                  <td className="px-3 py-1.5 tabular-nums">
                    #{log.instanceId}
                  </td>
                  <td className="px-3 py-1.5">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${action.className}`}
                    >
                      {action.label}
                    </span>
                  </td>
                  <td className="px-3 py-1.5">
                    <span
                      className={
                        log.result === "success"
                          ? "text-green-600 dark:text-green-400"
                          : "text-red-600 dark:text-red-400"
                      }
                    >
                      {log.result === "success" ? "성공" : "실패"}
                    </span>
                  </td>
                  <td
                    className="max-w-64 cursor-pointer px-3 py-1.5 text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                    onClick={() =>
                      setExpandedIdx(expandedIdx === idx ? null : idx)
                    }
                    title="클릭하여 상세 보기"
                  >
                    <span
                      className={
                        expandedIdx === idx
                          ? "whitespace-pre-wrap break-all"
                          : "block truncate"
                      }
                    >
                      {log.detail ?? "—"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
