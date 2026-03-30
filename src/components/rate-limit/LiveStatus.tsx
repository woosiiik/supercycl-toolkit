"use client";

interface LiveStatusProps {
  requestCount: number;
  totalWeight: number;
  elapsedTime: number; // ms
  weightLimit: number; // 1200
}

export default function LiveStatus({
  requestCount,
  totalWeight,
  elapsedTime,
  weightLimit,
}: LiveStatusProps) {
  const elapsedSeconds = (elapsedTime / 1000).toFixed(1);
  const percentage = Math.min((totalWeight / weightLimit) * 100, 100);
  const percentageText = percentage.toFixed(1);

  const barColor =
    percentage > 80
      ? "bg-red-500 dark:bg-red-400"
      : percentage >= 50
        ? "bg-yellow-500 dark:bg-yellow-400"
        : "bg-green-500 dark:bg-green-400";

  return (
    <div className="flex flex-col gap-3 rounded-md border border-zinc-300 p-4 dark:border-zinc-600">
      <div className="grid grid-cols-3 gap-4 text-sm">
        <div>
          <span className="text-zinc-500 dark:text-zinc-400">총 요청 수</span>
          <p className="font-medium text-zinc-900 dark:text-zinc-100">
            {requestCount}
          </p>
        </div>
        <div>
          <span className="text-zinc-500 dark:text-zinc-400">누적 Weight</span>
          <p className="font-medium text-zinc-900 dark:text-zinc-100">
            {totalWeight}
          </p>
        </div>
        <div>
          <span className="text-zinc-500 dark:text-zinc-400">경과 시간</span>
          <p className="font-medium text-zinc-900 dark:text-zinc-100">
            {elapsedSeconds}초
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-sm">
          <span className="text-zinc-500 dark:text-zinc-400">
            Weight 사용량
          </span>
          <span className="font-medium text-zinc-900 dark:text-zinc-100">
            {percentageText}%
          </span>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
          <div
            className={`h-full rounded-full transition-all ${barColor}`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
    </div>
  );
}
