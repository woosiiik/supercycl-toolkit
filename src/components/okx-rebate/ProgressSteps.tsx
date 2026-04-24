"use client";

import type { StepStatus } from "@/lib/okx-rebate/types";

interface ProgressStepsProps {
  steps: StepStatus[];
}

const stateStyles: Record<string, string> = {
  pending: "border-zinc-300 bg-zinc-100 text-zinc-400 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-500",
  running: "border-blue-400 bg-blue-50 text-blue-600 dark:border-blue-500 dark:bg-blue-950 dark:text-blue-400",
  done: "border-green-400 bg-green-50 text-green-600 dark:border-green-500 dark:bg-green-950 dark:text-green-400",
  error: "border-red-400 bg-red-50 text-red-600 dark:border-red-500 dark:bg-red-950 dark:text-red-400",
};

const stateIcons: Record<string, string> = {
  pending: "\u25CB",  // ○
  running: "\u25D4",  // ◔
  done: "\u2713",     // ✓
  error: "\u2717",    // ✗
};

export default function ProgressSteps({ steps }: ProgressStepsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {steps.map((step, i) => (
        <div
          key={i}
          className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium ${stateStyles[step.state]}`}
        >
          <span className="text-sm">{stateIcons[step.state]}</span>
          <span>{step.label}</span>
          {step.detail && (
            <span className="font-normal opacity-70">{step.detail}</span>
          )}
        </div>
      ))}
    </div>
  );
}
