"use client";

import { useState } from "react";
import type { CachedRange } from "@/lib/okx-rebate/types";

interface CacheManagerProps {
  entries: CachedRange[];
  onSelect?: (beginDate: string, endDate: string) => void;
  onSelectMultiple?: (keys: string[]) => void;
  onDelete: (key: string) => void;
  onClearAll: () => void;
  disabled?: boolean;
}

export default function CacheManager({
  entries,
  onSelect,
  onSelectMultiple,
  onDelete,
  onClearAll,
  disabled,
}: CacheManagerProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  if (entries.length === 0) {
    return (
      <p className="text-xs text-zinc-400">캐시 데이터 없음</p>
    );
  }

  function toggleSelect(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === entries.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(entries.map((e) => e.key)));
    }
  }

  const totalRows = entries
    .filter((e) => selected.has(e.key))
    .reduce((sum, e) => sum + e.rowCount, 0);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            캐시 {entries.length}건
          </span>
          {onSelectMultiple && selected.size >= 2 && (
            <button
              onClick={() => onSelectMultiple([...selected])}
              disabled={disabled}
              className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              선택 합산 조회 ({selected.size}건, {totalRows.toLocaleString()}행)
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          {onSelectMultiple && entries.length >= 2 && (
            <button
              onClick={toggleAll}
              className="text-xs text-blue-500 hover:text-blue-600"
            >
              {selected.size === entries.length ? "전체 해제" : "전체 선택"}
            </button>
          )}
          <button
            onClick={onClearAll}
            className="text-xs text-red-500 hover:text-red-600"
          >
            전체 삭제
          </button>
        </div>
      </div>
      <div className="space-y-1">
        {entries.map((e) => (
          <div
            key={e.key}
            className="flex items-center justify-between rounded-md border border-zinc-200 px-3 py-1.5 text-xs dark:border-zinc-700"
          >
            <div className="flex items-center gap-2">
              {onSelectMultiple && (
                <input
                  type="checkbox"
                  checked={selected.has(e.key)}
                  onChange={() => toggleSelect(e.key)}
                  className="rounded"
                />
              )}
              <span className="text-zinc-700 dark:text-zinc-300">
                {e.beginDate} ~ {e.endDate}{" "}
                <span className="text-zinc-400">({e.rowCount.toLocaleString()}행)</span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              {onSelect && (
                <button
                  onClick={() => onSelect(e.beginDate, e.endDate)}
                  disabled={disabled}
                  className="rounded bg-blue-600 px-2.5 py-0.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
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
