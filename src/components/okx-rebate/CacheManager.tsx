"use client";

import type { CachedRange } from "@/lib/okx-rebate/types";

interface CacheManagerProps {
  entries: CachedRange[];
  onSelect?: (beginDate: string, endDate: string) => void;
  onDelete: (key: string) => void;
  onClearAll: () => void;
}

export default function CacheManager({
  entries,
  onSelect,
  onDelete,
  onClearAll,
}: CacheManagerProps) {
  if (entries.length === 0) {
    return (
      <p className="text-xs text-zinc-400">캐시 데이터 없음</p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          캐시 {entries.length}건
        </span>
        <button
          onClick={onClearAll}
          className="text-xs text-red-500 hover:text-red-600"
        >
          전체 삭제
        </button>
      </div>
      <div className="space-y-1">
        {entries.map((e) => (
          <div
            key={e.key}
            className="flex items-center justify-between rounded-md border border-zinc-200 px-3 py-1.5 text-xs dark:border-zinc-700"
          >
            <span className="text-zinc-700 dark:text-zinc-300">
              {e.beginDate} ~ {e.endDate}{" "}
              <span className="text-zinc-400">({e.rowCount.toLocaleString()}행)</span>
            </span>
            <div className="flex items-center gap-2">
              {onSelect && (
                <button
                  onClick={() => onSelect(e.beginDate, e.endDate)}
                  className="rounded bg-blue-600 px-2.5 py-0.5 text-xs font-medium text-white hover:bg-blue-700"
                >
                  조회
                </button>
              )}
              <button
                onClick={() => onDelete(e.key)}
                className="text-zinc-400 hover:text-red-500"
              >
                삭제
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
