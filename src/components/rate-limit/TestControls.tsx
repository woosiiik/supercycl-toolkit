"use client";

interface TestControlsProps {
  onStart: () => void;
  onStop: () => void;
  isRunning: boolean;
  canStart: boolean;
}

export default function TestControls({
  onStart,
  onStop,
  isRunning,
  canStart,
}: TestControlsProps) {
  return (
    <div className="flex gap-3">
      <button
        type="button"
        onClick={onStart}
        disabled={!canStart || isRunning}
        className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
          !canStart || isRunning
            ? "cursor-not-allowed bg-blue-300 text-blue-100 dark:bg-blue-900 dark:text-blue-700"
            : "bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 dark:bg-blue-500 dark:hover:bg-blue-600 dark:active:bg-blue-700"
        }`}
      >
        테스트 시작
      </button>
      <button
        type="button"
        onClick={onStop}
        disabled={!isRunning}
        className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
          !isRunning
            ? "cursor-not-allowed bg-red-300 text-red-100 dark:bg-red-900 dark:text-red-700"
            : "bg-red-600 text-white hover:bg-red-700 active:bg-red-800 dark:bg-red-500 dark:hover:bg-red-600 dark:active:bg-red-700"
        }`}
      >
        중단
      </button>
    </div>
  );
}
