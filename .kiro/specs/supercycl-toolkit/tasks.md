# 구현 계획: Supercycl Toolkit

## 개요

Next.js 14+ App Router 기반의 Supercycl Toolkit 웹 애플리케이션을 구현한다. 설정 파일 기반 확장 가능한 메뉴 시스템과 첫 번째 도구인 Hyperliquid Rate-Limit Tester를 포함한다. 클라이언트에서 Hyperliquid API로 직접 요청한다.

## Tasks

- [x] 1. 프로젝트 초기 설정 및 공통 구조

  - [x] 1.1 Next.js 프로젝트 생성 및 기본 설정

    - `npx create-next-app@latest` 으로 Next.js 14+ App Router + TypeScript + Tailwind CSS 프로젝트 생성
    - `tsconfig.json`, `tailwind.config.ts` 기본 설정 확인
    - _Requirements: 1.1-1, 1.1-2, 1.1-3_

  - [x] 1.2 도구 설정 파일 생성 (`src/config/tools.ts`)

    - `ToolConfig` 인터페이스 정의 (slug, name, description, icon?)
    - `tools` 배열에 HL Rate-Limit Tester 항목 등록
    - _Requirements: 1.2-5, 1.2-7_

  - [x] 1.3 공통 레이아웃 및 Sidebar 컴포넌트 구현

    - `app/layout.tsx`: Sidebar + 메인 콘텐츠 영역 레이아웃
    - `src/components/Sidebar.tsx`: tools 설정을 읽어 메뉴 항목 렌더링, 현재 slug 활성 표시
    - `src/components/ToolHeader.tsx`: 현재 도구의 description 표시
    - _Requirements: 1.2-1, 1.2-2, 1.2-3, 1.2-4, 1.2-6, 1.2-7_

  - [x] 1.4 동적 라우트 페이지 구현
    - `app/page.tsx`: 루트 경로에서 첫 번째 도구로 리다이렉트
    - `app/tools/[slug]/page.tsx`: slug 기반 도구 페이지 렌더링, 존재하지 않는 slug는 notFound() 호출
    - _Requirements: 1.1-1, 1.2-3, 1.2-5_

- [x] 2. Hyperliquid Rate-Limit Tester - 핵심 로직 구현

  - [x] 2.1 데이터 모델 타입 정의 (`src/types/hyperliquid.ts`)

    - RequestLogEntry, TestSessionSummary, ApiResponse, TestState 인터페이스 정의
    - _Requirements: 2.2-2, 2.2-3, 2.3-4, 2.3-5_

  - [x] 2.2 주소 검증 함수 구현 (`src/lib/validation.ts`)

    - `validateAddress(address: string): string | null` 함수 구현
    - `^0x[0-9a-fA-F]{40}$` 정규식 기반 검증
    - 유효하지 않은 경우 "유효한 이더리움 주소를 입력해주세요 (0x로 시작하는 42자리)" 에러 메시지 반환
    - _Requirements: 2.1-2, 2.1-3_

  - [x] 2.3 Weight 계산 및 API 호출 함수 구현 (`src/lib/hyperliquid.ts`)
    - `calculateWeight(itemCount: number): number` — 기본 weight 20 + Math.floor(itemCount / 20)
    - `callUserFillsByTime(address, startTime, endTime, signal?): Promise<ApiResponse>` — POST https://api.hyperliquid.xyz/info
    - `createTestSummary(logs, startedAt, rateLimitResponse?): TestSessionSummary` — 요약 집계
    - `runTestSession(address, signal): AsyncGenerator<RequestLogEntry>` — 연속 요청 루프, 429 시 중단
    - _Requirements: 2.1-4, 2.1-5, 2.2-1, 2.2-4, 2.2-5, 2.3-1, 2.3-2, 2.3-3, 2.4-1, 2.4-2_

- [x] 3. Hyperliquid Rate-Limit Tester - UI 컴포넌트 구현

  - [x] 3.1 AddressInput 컴포넌트 구현 (`src/components/rate-limit/AddressInput.tsx`)

    - 주소 입력 필드, 실시간 검증, 에러 메시지 표시
    - disabled 상태 지원 (테스트 실행 중)
    - _Requirements: 2.1-1, 2.1-2, 2.1-3_

  - [x] 3.2 TestControls 컴포넌트 구현 (`src/components/rate-limit/TestControls.tsx`)

    - 시작/중단 버튼, isRunning 상태에 따른 활성화/비활성화
    - canStart: 주소 유효 && 실행 중 아님
    - _Requirements: 2.2-1, 2.2-5, 2.2-6_

  - [x] 3.3 LiveStatus 컴포넌트 구현 (`src/components/rate-limit/LiveStatus.tsx`)

    - 총 요청 수, 누적 weight, 경과 시간, weight 1200 대비 백분율 프로그레스 바
    - _Requirements: 2.2-2, 2.2-3, 2.4-3_

  - [x] 3.4 TestSummary 컴포넌트 구현 (`src/components/rate-limit/TestSummary.tsx`)

    - 테스트 완료 후 요약 (총 요청 수, 누적 weight, rate-limit 도달 여부, 소요 시간)
    - Retry-After 값, 에러 메시지 표시
    - _Requirements: 2.3-1, 2.3-2, 2.3-3_

  - [x] 3.5 RequestLog 컴포넌트 구현 (`src/components/rate-limit/RequestLog.tsx`)
    - 스크롤 가능한 요청 로그 테이블
    - 요청 번호, 타임스탬프, HTTP 상태 코드, 응답 시간(ms), 반환 항목 수, weight 표시
    - _Requirements: 2.3-4, 2.3-5_

- [x] 4. Hyperliquid Rate-Limit Tester - 통합 및 연결

  - [x] 4.1 RateLimitTester 메인 컴포넌트 구현 (`src/components/rate-limit/RateLimitTester.tsx`)

    - TestState 상태 관리 (useState)
    - AbortController를 이용한 테스트 시작/중단 로직
    - runTestSession 제너레이터를 소비하며 실시간 로그 업데이트
    - 테스트 완료 시 createTestSummary로 요약 생성
    - AddressInput, TestControls, LiveStatus, TestSummary, RequestLog 하위 컴포넌트 조합
    - _Requirements: 2.1-1, 2.2-1, 2.2-2, 2.2-3, 2.2-4, 2.2-5, 2.2-6_

  - [x] 4.2 동적 라우트에 RateLimitTester 연결
    - `app/tools/[slug]/page.tsx`에서 slug === "hl-rate-limit-tester"일 때 RateLimitTester 렌더링
    - ToolHeader로 도구 설명 표시
    - _Requirements: 1.2-6, 1.2-7, 2.1-1_
