"use client";

import { useState } from "react";
import type { TestSessionSummary } from "@/types/hyperliquid";

interface TestSummaryProps {
  summary: TestSessionSummary | null;
}

export default function TestSummary({ summary }: TestSummaryProps) {
  const [showRawDetails, setShowRawDetails] = useState(false);

  if (!summary) return null;

  const elapsedSeconds = (summary.elapsedTimeMs / 1000).toFixed(1);
  const hasRawDetails =
    (summary.rateLimitHeaders && Object.keys(summary.rateLimitHeaders).length > 0) ||
    summary.rateLimitBody;

  return (
    <div className="flex flex-col gap-3 rounded-md border border-zinc-300 p-4 dark:border-zinc-600">
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        테스트 요약
      </h3>

      <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
        <div>
          <span className="text-zinc-500 dark:text-zinc-400">총 요청 수</span>
          <p className="font-medium text-zinc-900 dark:text-zinc-100">
            {summary.totalRequests}
          </p>
        </div>
        <div>
          <span className="text-zinc-500 dark:text-zinc-400">누적 Weight</span>
          <p className="font-medium text-zinc-900 dark:text-zinc-100">
            {summary.totalWeight}
          </p>
        </div>
        <div>
          <span className="text-zinc-500 dark:text-zinc-400">
            Rate-Limit 도달
          </span>
          <p className="font-medium">
            {summary.rateLimitReached ? (
              <span className="text-red-500 dark:text-red-400">도달</span>
            ) : (
              <span className="text-green-500 dark:text-green-400">미도달</span>
            )}
          </p>
        </div>
        <div>
          <span className="text-zinc-500 dark:text-zinc-400">소요 시간</span>
          <p className="font-medium text-zinc-900 dark:text-zinc-100">
            {elapsedSeconds}초
          </p>
        </div>
      </div>

      {summary.retryAfter != null && (
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          Retry-After: <span className="font-medium">{summary.retryAfter}초</span>
        </p>
      )}

      {summary.recoveryTimeMs != null && (
        <div className="rounded-md bg-green-50 p-3 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-400">
          Rate-limit 해제까지 대기 시간: <span className="font-medium">{(summary.recoveryTimeMs / 1000).toFixed(1)}초</span>
          {summary.recoveryProbes != null && (
            <span className="ml-2 text-green-600 dark:text-green-500">
              (probe {summary.recoveryProbes}회)
            </span>
          )}
        </div>
      )}

      {summary.errorMessage && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {summary.errorMessage}
        </div>
      )}

      {hasRawDetails && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setShowRawDetails((v) => !v)}
            className="self-start text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
          >
            {showRawDetails ? "▼ 429 응답 상세 숨기기" : "▶ 429 응답 상세 보기"}
          </button>

          {showRawDetails && (
            <div className="flex flex-col gap-3 rounded-md bg-zinc-50 p-3 dark:bg-zinc-800/50">
              {summary.rateLimitHeaders && Object.keys(summary.rateLimitHeaders).length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Response Headers
                  </p>
                  <pre className="overflow-x-auto rounded bg-zinc-100 p-2 text-xs text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
{Object.entries(summary.rateLimitHeaders)
  .map(([k, v]) => `${k}: ${v}`)
  .join("\n")}
                  </pre>
                </div>
              )}

              {summary.rateLimitBody && (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Response Body
                  </p>
                  <pre className="overflow-x-auto rounded bg-zinc-100 p-2 text-xs text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
{summary.rateLimitBody}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}