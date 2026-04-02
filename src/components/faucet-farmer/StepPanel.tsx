"use client";

import type { StepSummary } from "@/types/faucet";

interface StepPanelProps {
  title: string;
  description: string;
  onExecute: () => void;
  onRetry?: () => void;
  disabled: boolean;
  isRunning: boolean;
  summary?: StepSummary;
}

export default function StepPanel({
  title,
  description,
  onExecute,
  onRetry,
  disabled,
  isRunning,
  summary,
}: StepPanelProps) {
  return (
    <div className="flex flex-col gap-3 rounded-md border border-zinc-300 p-4 dark:border-zinc-600">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
          {title}
        </h3>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {description}
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onExecute}
          disabled={disabled || isRunning}
          className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-blue-500 dark:hover:bg-blue-600"
        >
          {isRunning && (
            <svg
              className="h-4 w-4 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
          )}
          {isRunning ? "실행 중..." : "실행"}
        </button>

        {summary && summary.failed > 0 && onRetry && (
          <button
            type="button"
            onClick={onRetry}
            disabled={isRunning}
            className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-900/20"
          >
            실패 재시도 ({summary.failed})
          </button>
        )}
      </div>

      {/* Summary */}
      {summary && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800/50">
          <span className="text-zinc-500 dark:text-zinc-400">
            전체{" "}
            <span className="font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
              {summary.total}
            </span>
          </span>
          <span className="text-green-600 dark:text-green-400">
            성공{" "}
            <span className="font-medium tabular-nums">
              {summary.success}
            </span>
          </span>
          <span className="text-red-600 dark:text-red-400">
            실패{" "}
            <span className="font-medium tabular-nums">{summary.failed}</span>
          </span>
          {summary.totalAmount && (
            <span className="text-zinc-500 dark:text-zinc-400">
              총액{" "}
              <span className="font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
                {summary.totalAmount} USDC
              </span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
