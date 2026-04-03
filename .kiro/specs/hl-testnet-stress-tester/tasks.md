# 구현 계획: HL Testnet Stress Tester

## 개요

Hyperliquid 테스트넷 스트레스 테스터를 기존 Supercycl Toolkit에 세 번째 도구로 추가한다. @nktkas/hyperliquid SDK의 WalletClient, EventClient, PublicClient, WebSocketTransport를 활용하여 N개의 독립 인스턴스가 동시에 WebSocket 구독, 레버리지 변경, limit order를 수행한다.

## Tasks

- [x] 1. 도구 등록 및 라우팅
  - [x] 1.1 tools.ts에 Stress Tester 항목 추가
    - `src/config/tools.ts`의 tools 배열에 slug `hl-testnet-stress-tester`, name `HL Testnet Stress Tester` 항목 추가
    - description에 도구 설명 작성 (테스트넷 스트레스 내성 확인 도구)
    - _Requirements: 4.1.1, 4.1.3_
  - [x] 1.2 동적 라우트 page.tsx에 slug 매핑 추가
    - `src/app/tools/[slug]/page.tsx`에서 `hl-testnet-stress-tester` slug일 때 StressTester 컴포넌트 렌더링하도록 분기 추가
    - StressTester import 추가 (컴포넌트는 이후 태스크에서 구현)
    - _Requirements: 4.1.2_

- [x] 2. 타입 정의 및 상수
  - [x] 2.1 스트레스 테스터 타입 정의
    - `src/types/stress.ts` 생성
    - CoinInfo, InstanceStatus, InstanceState, StressMetrics, LogEntry, LogAction 인터페이스/타입 정의
    - PRIVATE_KEY_REGEX 상수 정의
    - _Requirements: 4.2.3, 4.7.1~4.7.6, 4.10.2_
  - [x] 2.2 상수 파일 생성
    - `src/lib/stress/constants.ts` 생성
    - TESTNET_WS_URL, TESTNET_HTTP_URL, LOOP_INTERVAL_MS(10초), MAX_LOG_ENTRIES(500), LEVERAGE_MIN/MAX, ORDER_PRICE_RATIO(0.5), ORDER_SIZE 정의
    - _Requirements: 4.4.1, 4.5.1, 4.5.4, 4.10.4_

- [ ] 3. 코인 라이브러리 구현
  - [x] 3.1 coins.ts 구현
    - `src/lib/stress/coins.ts` 생성
    - `createSharedPublicClient()`: HttpTransport + PublicClient 생성 (테스트넷 URL)
    - `fetchCoinList(client, signal?)`: PublicClient.meta()로 코인 목록 조회, CoinInfo[] 반환
    - `fetchAllMids(client, signal?)`: PublicClient.allMids()로 mid price 조회
    - `pickRandomCoin(coins)`: 배열에서 랜덤 코인 선택
    - `calculateLimitPrice(midPrice, szDecimals)`: mid price × 0.5 계산, szDecimals에 맞게 반올림
    - _Requirements: 4.6.1, 4.6.2, 4.4.2, 4.5.2, 4.5.3, 4.5.4_
  - [ ]* 3.2 Property 5: 랜덤 코인 선택 범위 테스트
    - **Property 5: 랜덤 코인 선택 범위**
    - fast-check으로 비어있지 않은 CoinInfo 배열에 대해 pickRandomCoin 반환값이 배열에 포함되는지 검증
    - **Validates: Requirements 4.4.2, 4.5.2**
  - [ ]* 3.3 Property 6: Limit Order 가격 계산 테스트
    - **Property 6: Limit Order 가격 계산**
    - fast-check으로 양의 mid price에 대해 calculateLimitPrice 결과가 mid price의 50%이며 szDecimals에 맞게 반올림되는지 검증
    - **Validates: Requirements 4.5.4**

- [ ] 4. 메트릭 라이브러리 구현
  - [x] 4.1 metrics.ts 구현
    - `src/lib/stress/metrics.ts` 생성
    - `createMetrics()`: 모든 카운터 0으로 초기화된 StressMetrics 반환
    - `incrementMetric(metrics, key)`: 해당 키 값 +1, 나머지 불변, 새 객체 반환
    - `decrementMetric(metrics, key)`: wsConnections/channelSubscriptions 키 값 -1, 새 객체 반환
    - _Requirements: 4.7.1~4.7.5_
  - [ ]* 4.2 Property 10: 메트릭 증가 정확성 테스트
    - **Property 10: 메트릭 증가 정확성**
    - fast-check으로 임의의 StressMetrics와 키에 대해 incrementMetric 호출 시 해당 키만 +1 되는지 검증
    - **Validates: Requirements 4.7.3, 4.7.4**

- [ ] 5. Checkpoint — 라이브러리 테스트 확인
  - 모든 테스트가 통과하는지 확인하고, 질문이 있으면 사용자에게 문의한다.

- [ ] 6. StressInstance 클래스 구현
  - [x] 6.1 instance.ts 기본 구조 구현
    - `src/lib/stress/instance.ts` 생성
    - StressInstance 클래스: constructor(id, privateKey, publicClient, coins, onMetric, onLog, onStateChange)
    - WebSocketTransport, EventClient, WalletClient 초기화 로직
    - getState() 메서드
    - _Requirements: 4.3.2, 4.3.3, 4.3.4_
  - [x] 6.2 채널 구독 구현
    - subscribeChannels(): webData2, orderUpdates, l2Book(BTC, nSigFigs 5) 구독
    - 구독 성공 시 onMetric('channelSubscriptions') 호출, 로그 기록
    - 연결 실패 시 에러 로그 기록 및 인스턴스 'error' 상태 전환
    - _Requirements: 4.3.5, 4.3.6_
  - [x] 6.3 레버리지 변경 루프 구현
    - startLeverageLoop(): setInterval(10초)로 주기적 실행
    - pickRandomCoin → WalletClient.updateLeverage({ asset, isCross: true, leverage: random(1~min(20, maxLeverage)) })
    - 실패 시 에러 로그 기록, 다음 주기 재시도
    - onMetric('postRequests') 호출
    - _Requirements: 4.4.1, 4.4.2, 4.4.3, 4.4.4_
  - [x] 6.4 Limit Order 루프 구현
    - startOrderLoop(): setInterval(10초)로 주기적 실행
    - pickRandomCoin → fetchAllMids → calculateLimitPrice
    - webData2에서 해당 코인 open order 확인 → 존재 시 WalletClient.cancel
    - WalletClient.order({ orders: [{ a, b: true, p, s: ORDER_SIZE, r: false, t: { limit: { tif: 'Gtc' } } }], grouping: 'na' })
    - 실패 시 에러 로그 기록, 다음 주기 재시도
    - onMetric('postRequests'), onMetric('getRequests') 호출
    - _Requirements: 4.5.1~4.5.7_
  - [x] 6.5 stop 및 cleanup 구현
    - stop(): clearInterval(leverageInterval, orderInterval), AbortController.abort()
    - cleanupOrders(): webData2에서 open order 목록 확인 → WalletClient.cancel로 전체 취소
    - WebSocketTransport.close() 호출
    - onMetric('wsConnections') 감소, 상태 'stopped' 전환
    - _Requirements: 4.8.4, 4.8.5_
  - [x] 6.6 start 메서드 구현
    - start(): WS 연결 → subscribeChannels → startLeverageLoop → startOrderLoop
    - 성공 시 상태 'running', onMetric('wsConnections') 증가
    - 실패 시 상태 'error', 에러 로그 기록
    - _Requirements: 4.3.1~4.3.7, 4.9.1, 4.9.2_

- [ ] 7. Checkpoint — StressInstance 구현 확인
  - 모든 테스트가 통과하는지 확인하고, 질문이 있으면 사용자에게 문의한다.

- [ ] 8. UI 컴포넌트 구현
  - [x] 8.1 StressConfig 컴포넌트 구현
    - `src/components/stress-tester/StressConfig.tsx` 생성
    - Private key 입력 필드 (마스킹 표시: 처음 6자 + 마지막 4자)
    - 인스턴스 수(N) 입력 필드 (기본값: 1, 최솟값: 1)
    - Private key 검증 (0x + 64자리 hex), 에러 메시지 표시
    - 시작/중단 버튼 (isRunning 상태에 따라 토글)
    - private key를 localStorage에 저장하지 않음
    - _Requirements: 4.2.1~4.2.6, 4.8.1~4.8.3_
  - [ ]* 8.2 Property 1: Private Key 검증 테스트
    - **Property 1: Private Key 검증**
    - fast-check으로 임의의 문자열에 대해 validatePrivateKey가 0x + 64자리 hex만 유효로 판정하는지 검증
    - **Validates: Requirements 4.2.3**
  - [ ]* 8.3 Property 2: Private Key 마스킹 테스트
    - **Property 2: Private Key 마스킹**
    - fast-check으로 유효한 private key에 대해 maskPrivateKey가 처음 6자와 마지막 4자만 노출하는지 검증
    - **Validates: Requirements 4.2.5**
  - [x] 8.4 MetricsDashboard 컴포넌트 구현
    - `src/components/stress-tester/MetricsDashboard.tsx` 생성
    - 활성 WS 연결 수, 채널 구독 수, 누적 GET/POST 요청 수, 에러 수, rate-limit 수 표시
    - isRunning 상태에 따라 실시간 갱신
    - _Requirements: 4.7.1~4.7.5_
  - [x] 8.5 InstanceStatusList 컴포넌트 구현
    - `src/components/stress-tester/InstanceStatusList.tsx` 생성
    - 각 인스턴스의 id, status, wsConnected, channelCount, errors, lastAction 표시
    - 상태별 시각적 구분 (idle/connecting/running/error/stopped)
    - _Requirements: 4.7.6_
  - [x] 8.6 ActivityLog 컴포넌트 구현
    - `src/components/stress-tester/ActivityLog.tsx` 생성
    - 스크롤 가능한 로그 영역
    - 각 로그에 타임스탬프, 인스턴스 번호, 작업 유형, 결과(성공/실패), 상세 정보 표시
    - 최근 500건 유지
    - _Requirements: 4.10.1~4.10.4_
  - [ ]* 8.7 Property 9: 로그 버퍼 상한 테스트
    - **Property 9: 로그 버퍼 상한**
    - fast-check으로 500건 초과 로그 추가 시 배열 길이가 500을 넘지 않고 최신 500건만 유지되는지 검증
    - **Validates: Requirements 4.10.4**

- [ ] 9. 메인 StressTester 컴포넌트 구현
  - [x] 9.1 StressTester 오케스트레이션 컴포넌트 구현
    - `src/components/stress-tester/StressTester.tsx` 생성
    - 상태 관리: instances[], metrics, logs[], isRunning
    - 시작 흐름: private key 검증 → createSharedPublicClient → fetchCoinList → N개 StressInstance 생성 → 각 instance.start()
    - 코인 목록 조회 실패 시 에러 메시지 표시 및 시작 중단
    - 중단 흐름: 모든 instance.stop() → 최종 메트릭 요약 표시
    - onMetric 콜백으로 metrics 상태 갱신
    - onLog 콜백으로 logs 상태 갱신 (MAX_LOG_ENTRIES 제한)
    - onStateChange 콜백으로 instances 상태 갱신
    - StressConfig, MetricsDashboard, InstanceStatusList, ActivityLog 조합
    - _Requirements: 4.3.1, 4.6.1~4.6.3, 4.7.5, 4.8.1~4.8.6, 4.9.1~4.9.4_

- [x] 10. 통합 및 연결
  - [x] 10.1 page.tsx에 StressTester 컴포넌트 연결
    - `src/app/tools/[slug]/page.tsx`에서 StressTester import 확인 및 slug 분기 동작 검증
    - 사이드바에서 선택 시 정상 렌더링 확인
    - _Requirements: 4.1.1, 4.1.2, 4.1.3_
  - [ ]* 10.2 도구 등록 단위 테스트
    - tools 배열에 `hl-testnet-stress-tester` slug 존재 확인 테스트
    - _Requirements: 4.1.1_

- [ ] 11. Final Checkpoint — 전체 테스트 및 빌드 확인
  - 모든 테스트가 통과하는지 확인하고, 질문이 있으면 사용자에게 문의한다.

## Notes

- `*` 표시된 태스크는 선택 사항이며 빠른 MVP를 위해 건너뛸 수 있다
- 각 태스크는 특정 요구사항을 참조하여 추적 가능하다
- Checkpoint에서 점진적 검증을 수행한다
- Property 테스트는 설계 문서의 정확성 속성을 검증한다
- 기존 도구(Rate-Limit Tester, Faucet Farmer)와 동일한 프로젝트 구조 패턴을 따른다
