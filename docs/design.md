# 설계 문서: Supercycl Toolkit

## 개요

Supercycl Toolkit은 코인 선물거래 애그리게이터 Supercycl 개발 과정에서 필요한 테스트/유틸리티 도구를 모아놓은 Next.js 기반 웹 애플리케이션이다.

핵심 설계 원칙:
- **설정 기반 확장**: 새 도구 추가 시 설정 파일에 항목만 추가하면 메뉴와 라우팅이 자동 반영
- **클라이언트 직접 호출**: 브라우저에서 외부 API로 직접 요청 (서버 프록시 없음)

### 기술 스택

| 구분 | 선택 | 이유 |
|------|------|------|
| 프레임워크 | Next.js 14+ App Router | 파일 기반 라우팅, SSG 지원 |
| 언어 | TypeScript | 타입 안전성 |
| 스타일링 | Tailwind CSS | 빠른 UI 구성 |
| API 호출 | fetch API | 브라우저 내장, 추가 의존성 없음 |
| 상태 관리 | React useState/useRef | 단일 페이지 내 상태, 전역 상태 불필요 |

---

## 1. 공통 설계

### 1.1 라우팅 구조

```
app/
├── layout.tsx          # 사이드바 포함 공통 레이아웃
├── page.tsx            # 루트 → 첫 번째 도구로 리다이렉트
└── tools/
    └── [slug]/
        └── page.tsx    # 동적 라우트: 도구별 페이지
```

동적 라우트 `[slug]`를 사용하여 설정 파일의 slug와 매칭한다. 설정에 없는 slug 접근 시 404를 반환한다.

### 1.2 설정 파일 구조

도구 등록은 `src/config/tools.ts`에서 관리한다:

```typescript
export interface ToolConfig {
  slug: string;        // URL 경로 (예: "rate-limit-tester")
  name: string;        // 메뉴 표시명 (예: "HL Rate-Limit Tester")
  description: string; // Tool_Page 상단 설명
  icon?: string;       // 선택적 아이콘
}

export const tools: ToolConfig[] = [
  {
    slug: "hl-rate-limit-tester",
    name: "HL Rate-Limit Tester",
    description: "Hyperliquid API의 IP 기반 rate-limit(분당 weight 1200)이 실제로 어느 시점에 발동되는지 확인하는 도구입니다...",
  },
  // 새 도구 추가 시 여기에 항목 추가
];
```

새 도구 추가 절차:
1. `tools` 배열에 `ToolConfig` 항목 추가
2. `app/tools/[slug]/page.tsx`에서 해당 slug에 대한 컴포넌트 매핑 추가

### 1.3 공통 컴포넌트

```typescript
// Sidebar: 메뉴 설정을 읽어 메뉴 항목 렌더링
interface SidebarProps {
  tools: ToolConfig[];
  currentSlug: string;
}

// ToolHeader: 현재 도구의 설명 표시
interface ToolHeaderProps {
  tool: ToolConfig;
}
```

---

## 2. Hyperliquid Rate-Limit 확인

### 2.1 컴포넌트 구조

```typescript
// AddressInput: 이더리움 주소 입력 및 검증
interface AddressInputProps {
  value: string;
  onChange: (value: string) => void;
  error: string | null;
  disabled: boolean;
}

// TestControls: 시작/중단 버튼
interface TestControlsProps {
  onStart: () => void;
  onStop: () => void;
  isRunning: boolean;
  canStart: boolean;
}

// LiveStatus: 실시간 진행 현황
interface LiveStatusProps {
  requestCount: number;
  totalWeight: number;
  elapsedTime: number;
  weightLimit: number;
}

// TestSummary: 테스트 완료 후 요약
interface TestSummaryProps {
  summary: TestSessionSummary | null;
}

// RequestLog: 요청 로그 테이블
interface RequestLogProps {
  logs: RequestLogEntry[];
}
```

### 2.2 데이터 모델

```typescript
interface RequestLogEntry {
  requestNumber: number;
  timestamp: string;
  statusCode: number;
  responseTimeMs: number;
  itemCount: number;
  weight: number;
  error?: string;
}

interface TestSessionSummary {
  totalRequests: number;
  totalWeight: number;
  rateLimitReached: boolean;
  elapsedTimeMs: number;
  retryAfter?: number;
  errorMessage?: string;
}

interface ApiResponse {
  statusCode: number;
  data: any[];
  responseTimeMs: number;
  headers: Record<string, string>;
  error?: string;
}

interface TestState {
  status: 'idle' | 'running' | 'completed' | 'stopped';
  address: string;
  addressError: string | null;
  logs: RequestLogEntry[];
  summary: TestSessionSummary | null;
  startedAt: number | null;
}
```

### 2.3 핵심 로직

```typescript
// src/lib/hyperliquid.ts

const ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;
function validateAddress(address: string): string | null

async function callUserFillsByTime(
  address: string, startTime: number, endTime: number, signal?: AbortSignal
): Promise<ApiResponse>

function calculateWeight(itemCount: number): number {
  const baseWeight = 20;
  const additionalWeight = Math.floor(itemCount / 20);
  return baseWeight + additionalWeight;
}

async function* runTestSession(
  address: string, signal: AbortSignal
): AsyncGenerator<RequestLogEntry>
```

테스트 실행 흐름:
1. `startTime` = 현재 시각 - 24시간, `endTime` = 현재 시각 (ms 타임스탬프)
2. 루프: `callUserFillsByTime` 호출 → 결과 yield → weight 누적
3. HTTP 429 수신 시 루프 종료, Retry-After 헤더 추출
4. AbortSignal로 사용자 중단 처리

### 2.4 에러 처리

| 에러 상황 | 처리 방식 |
|-----------|-----------|
| 유효하지 않은 주소 입력 | 입력 필드 아래에 에러 메시지 표시, 시작 버튼 비활성화 |
| 네트워크 오류 (fetch 실패) | 로그에 에러 기록, 테스트 중단, 요약에 에러 메시지 포함 |
| HTTP 429 (Rate Limit) | 정상 종료 경로: 테스트 중단, Retry-After 및 에러 메시지 추출 |
| HTTP 4xx/5xx (기타) | 로그에 상태 코드와 에러 기록, 테스트 계속 진행 |
| 사용자 중단 (AbortController) | AbortError 캐치, 현재까지의 결과로 요약 생성 |

---

## 3. (미정) 추가 도구

> 향후 추가될 도구의 설계가 여기에 정리됩니다.