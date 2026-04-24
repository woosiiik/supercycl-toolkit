export const OKX_BASE_URL = "https://www.okx.com" as const;
export const OKX_REBATE_PATH =
  "/api/v5/broker/fd/rebate-per-orders" as const;

// GET 다운로드 링크 조회: 분당 2회 제한 → 30초 간격
export const POLL_INTERVAL_MS = 30_000; // 30초
// CSV 생성까지 최대 2시간 → 30초 × 240 = 2시간
export const POLL_MAX_ATTEMPTS = 240;

export const DB_BATCH_SIZE = 500; // IN 절 배치 크기

export const CACHE_INDEX_KEY = "okx-rebate-cache-index" as const;
