"use client";

import type { RecoveryProbeResult } from "@/lib/hyperliquid";

interface RecoveryStatusProps {
  probes: RecoveryProbeResult[];
}

export default function RecoveryStatus({ probes }: RecoveryStatusProps) {
  if (probes.length === 0) {
    return (
      <div className="rounded-md border border-yellow-300 bg-yellow-50 p-4 dark:border-yellow-700 dark:bg-yellow-900/20">
        <p className="text-sm text-yellow-700 dark:text-yellow-400">
          ⏳ Rate-limit 해제 대기 중... (5초 간격으로 확인)
        </p>
      </div>
    );
  }

  const lastProbe = probes[probes.length - 1];
  const elapsedSec = (lastProbe.elapsedSinceRateLimitMs / 1000).toFixed(1);

  return (
    <div
      className={`rounded-md border p-4 ${
        lastProbe.recovered
          ? "border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-900/20"
          : "border-yellow-300 bg-yellow-50 dark:border-yellow-700 dark:bg-yellow-900/20"
      }`}
    >
      {lastProbe.recovered ? (
        <p className="text-sm text-green-700 dark:text-green-400">
          ✅ Rate-limit 해제됨 — 대기 시간: {elapsedSec}초 (probe{" "}
          {lastProbe.attempt}회)
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          <p className="text-sm text-yellow-700 dark:text-yellow-400">
            ⏳ Rate-limit 해제 대기 중... ({elapsedSec}초 경과, probe{" "}
            {lastProbe.attempt}회)
          </p>
          <p className="text-xs text-yellow-600 dark:text-yellow-500">
            마지막 probe: HTTP {lastProbe.statusCode}
          </p>
        </div>
      )}
    </div>
  );
}
