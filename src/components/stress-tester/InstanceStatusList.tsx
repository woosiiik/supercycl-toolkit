"use client";

import type { InstanceState, InstanceStatus } from "@/types/stress";

interface InstanceStatusListProps {
  instances: InstanceState[];
}

const statusConfig: Record<
  InstanceStatus,
  { label: string; className: string }
> = {
  idle: {
    label: "대기",
    className: "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300",
  },
  connecting: {
    label: "연결 중",
    className:
      "bg-yellow-200 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
  },
  running: {
    label: "실행 중",
    className:
      "bg-green-200 text-green-800 dark:bg-green-900 dark:text-green-300",
  },
  error: {
    label: "에러",
    className: "bg-red-200 text-red-800 dark:bg-red-900 dark:text-red-300",
  },
  stopped: {
    label: "중단",
    className: "bg-zinc-300 text-zinc-600 dark:bg-zinc-600 dark:text-zinc-300",
  },
};

export default function InstanceStatusList({
  instances,
}: InstanceStatusListProps) {
  if (instances.length === 0) {
    return (
      <div className="rounded-md border border-zinc-300 p-4 dark:border-zinc-600">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          인스턴스 없음
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-zinc-300 dark:border-zinc-600">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
            <tr>
              <th className="px-3 py-2 font-medium">ID</th>
              <th className="px-3 py-2 font-medium">상태</th>
              <th className="px-3 py-2 font-medium">WS</th>
              <th className="px-3 py-2 font-medium">채널</th>
              <th className="px-3 py-2 font-medium">에러</th>
              <th className="px-3 py-2 font-medium">마지막 작업</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-700">
            {instances.map((inst) => {
              const cfg = statusConfig[inst.status];
              return (
                <tr key={inst.id} className="text-zinc-900 dark:text-zinc-100">
                  <td className="px-3 py-1.5 tabular-nums">#{inst.id}</td>
                  <td className="px-3 py-1.5">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${cfg.className}`}
                    >
                      {cfg.label}
                    </span>
                  </td>
                  <td className="px-3 py-1.5">
                    <span
                      className={
                        inst.wsConnected
                          ? "text-green-600 dark:text-green-400"
                          : "text-zinc-400 dark:text-zinc-500"
                      }
                    >
                      {inst.wsConnected ? "연결됨" : "끊김"}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 tabular-nums">
                    {inst.channelCount}
                  </td>
                  <td className="px-3 py-1.5 tabular-nums">{inst.errors}</td>
                  <td className="max-w-48 truncate px-3 py-1.5 text-zinc-500 dark:text-zinc-400">
                    {inst.lastAction ?? "—"}
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
