export interface RequestLogEntry {
  requestNumber: number;    // 요청 번호 (1부터)
  timestamp: string;        // ISO 8601 타임스탬프
  statusCode: number;       // HTTP 상태 코드
  responseTimeMs: number;   // 응답 시간 (ms)
  itemCount: number;        // 반환된 항목 수
  weight: number;           // 이 요청의 weight
  error?: string;           // 에러 메시지 (있을 경우)
  retryAfter?: number;      // 429 응답 시 Retry-After 헤더 값 (초)
  headers?: Record<string, string>;  // 응답 헤더 전체
  responseBody?: string;    // 응답 본문 원본
}

export interface TestSessionSummary {
  totalRequests: number;      // 총 요청 수
  totalWeight: number;        // 누적 weight
  rateLimitReached: boolean;  // 429 도달 여부
  elapsedTimeMs: number;      // 총 소요 시간
  retryAfter?: number;        // Retry-After 헤더 값 (초)
  errorMessage?: string;      // 429 응답 본문 에러 메시지
  rateLimitHeaders?: Record<string, string>;  // 429 응답 전체 헤더
  rateLimitBody?: string;     // 429 응답 본문 원본
  recoveryTimeMs?: number;    // rate-limit 해제까지 걸린 시간 (ms)
  recoveryProbes?: number;    // recovery probe 시도 횟수
}

export interface ApiResponse {
  statusCode: number;
  data: any[];                // userFillsByTime 응답 배열
  responseTimeMs: number;
  headers: Record<string, string>;
  error?: string;
}

export interface TestState {
  status: 'idle' | 'running' | 'completed' | 'stopped';
  address: string;
  addressError: string | null;
  logs: RequestLogEntry[];
  summary: TestSessionSummary | null;
  startedAt: number | null;   // 테스트 시작 시각 (ms)
}
