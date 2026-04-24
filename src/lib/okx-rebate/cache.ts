import type { OkxRebateRow, CachedRange, CachedCsvData } from "./types";
import { CACHE_INDEX_KEY } from "./constants";

function getCacheKey(beginDate: string, endDate: string): string {
  return `okx-rebate-${beginDate}-${endDate}`;
}

export function loadCacheIndex(): CachedRange[] {
  try {
    const raw = localStorage.getItem(CACHE_INDEX_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as CachedRange[];
  } catch {
    return [];
  }
}

function saveCacheIndex(index: CachedRange[]): void {
  localStorage.setItem(CACHE_INDEX_KEY, JSON.stringify(index));
}

export function saveCacheData(
  beginDate: string,
  endDate: string,
  rows: OkxRebateRow[],
): void {
  const key = getCacheKey(beginDate, endDate);
  const meta: CachedRange = {
    key,
    beginDate,
    endDate,
    cachedAt: new Date().toISOString(),
    rowCount: rows.length,
  };
  const data: CachedCsvData = { meta, rows };

  try {
    localStorage.setItem(key, JSON.stringify(data));
    const index = loadCacheIndex().filter((e) => e.key !== key);
    index.push(meta);
    saveCacheIndex(index);
  } catch {
    // localStorage 용량 초과 — 조용히 실패
    console.warn("캐시 저장 실패: localStorage 용량 초과");
  }
}

export function loadCacheData(
  beginDate: string,
  endDate: string,
): CachedCsvData | null {
  try {
    const key = getCacheKey(beginDate, endDate);
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as CachedCsvData;
  } catch {
    return null;
  }
}

export function deleteCacheEntry(key: string): void {
  localStorage.removeItem(key);
  const index = loadCacheIndex().filter((e) => e.key !== key);
  saveCacheIndex(index);
}

export function clearAllCache(): void {
  const index = loadCacheIndex();
  for (const entry of index) {
    localStorage.removeItem(entry.key);
  }
  localStorage.removeItem(CACHE_INDEX_KEY);
}

