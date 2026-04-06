# 요구사항 문서

## 소개

Supercycl Toolkit은 코인 선물거래 애그리게이터 서비스인 Supercycl의 개발 과정에서 필요한 다양한 테스트 및 유틸리티 도구들을 모아놓은 Next.js 기반 웹 애플리케이션이다.

## 용어 정의

- **Toolkit_App**: Supercycl Toolkit Next.js 웹 애플리케이션 전체 시스템
- **Menu_System**: 좌측 사이드바를 통해 각 도구에 접근할 수 있는 메뉴 시스템
- **Tool_Page**: 개별 도구의 기능을 제공하는 페이지 컴포넌트
- **Rate_Limit_Tester**: Hyperliquid API의 rate-limit 임계값을 테스트하는 도구
- **Address**: 0x로 시작하는 이더리움 주소
- **Faucet_Farmer**: 테스트넷 USDC 확보 절차를 자동화하는 도구
- **Main_Account**: 사용자가 직접 입력하는 Arbitrum 메인넷 계정
- **Sub_Account**: Faucet_Farmer가 자동 생성하는 Arbitrum 계정
- **Account_Store**: Sub_Account의 private key와 address를 관리하는 저장소
- **USDC_Contract**: Arbitrum USDC (0xaf88d065e77c8cc2239327c5edb3a432268e5831, 6 decimals)
- **Bridge_Address**: Hyperliquid bridge (0x2df1c51e09aecf9cacb7bc98cb1742757f163df7)
- **DepositWithPermit**: EIP-2612 Permit으로 ETH gas 없이 deposit하는 방식
- **Faucet_API**: POST https://api-ui.hyperliquid-testnet.xyz/info
- **Mainnet_API**: https://api-ui.hyperliquid.xyz/info
- **USD_Send**: Hyperliquid 내부 USDC 전송 기능
- **Arbitrum_RPC**: https://arb1.arbitrum.io/rpc

---

## 1. 공통 요구사항

### 1.1 프로젝트 구조 및 초기 설정

1. THE Toolkit_App SHALL Next.js App Router + TypeScript로 구성한다
2. THE Toolkit_App SHALL localhost에서 실행 가능하다
3. THE Toolkit_App SHALL 프로덕션 빌드를 생성할 수 있다

### 1.2 메뉴 시스템

1. THE Menu_System SHALL 사이드바 형태로 모든 페이지에서 표시된다
2. THE Menu_System SHALL 등록된 모든 Tool_Page 목록을 표시한다
3. WHEN 메뉴 항목 클릭 시, 해당 Tool_Page로 네비게이션한다
4. THE Menu_System SHALL 현재 활성 Tool_Page를 시각적으로 구분한다
5. 새 Tool_Page 추가 시 설정 파일에 항목만 추가하면 메뉴에 반영된다
6. Tool_Page 상단에 도구 설명 영역을 표시한다
7. 설명 영역은 설정 파일에서 읽어온다

---

## 2. Hyperliquid Rate-Limit 확인

### 2.1 입력 및 설정

1. Address 입력 필드를 제공한다
2. 0x로 시작하는 42자리 16진수 형식 검증
3. 유효하지 않으면 오류 메시지 표시
4. userFillsByTime API로 rate-limit 테스트 수행
5. startTime/endTime 자동 설정 (최근 6개월)

### 2.2 테스트 실행

1. 시작 버튼 클릭 시 연속 요청 전송
2. 각 요청 결과를 실시간 표시
3. 총 요청 수, 누적 Weight, 경과 시간 표시
4. HTTP 429 수신 시 테스트 중단 및 결과 기록
5. 중단 버튼으로 즉시 중단 가능
6. 실행 중 시작 버튼 비활성화, 중단 버튼 활성화

### 2.3 결과 분석 및 표시

1. 완료 시 요약 정보 표시
2. 429 수신 시 Retry-After 추출 표시
3. 429 수신 시 전체 헤더와 본문 상세 보기
4. 요청 로그를 스크롤 가능한 목록에 표시
5. 로그에 요청 번호, 타임스탬프, HTTP 상태, 응답 시간, 항목 수 포함

### 2.4 Request Weight 계산

1. 기본 Weight 20 적용
2. 반환 항목 수 20개당 추가 weight 1
3. weight 1200 대비 백분율 표시

### 2.5 Rate-Limit Recovery 측정

1. 429 수신 시 자동 5초 간격 recovery probe 시작
2. 경과 시간, probe 횟수, 마지막 HTTP 상태 실시간 표시
3. 200 수신 시 해제까지 걸린 시간 표시
4. recovery probe 시 조회 범위 최근 1초 (weight 최소화)

---

## 3. HL Testnet Faucet Farmer

### 3.1 도구 등록 및 라우팅

1. tools 배열에 slug "hl-testnet-faucet-farmer" 항목 포함
2. 사이드바 선택 시 Faucet_Farmer 컴포넌트 렌더링
3. slug 매핑

### 3.2 Sub_Account 생성

1. 생성할 계정 수(N) 입력 필드 (기본값: 1)
2. "계정 생성" 클릭 시 N개 Arbitrum 계정 생성
3. 생성된 Sub_Account address 목록 표시
4. localStorage에 저장
5. 생성 완료 시 JSON 파일 자동 다운로드 백업
6. IF 기존 Sub_Account가 존재하는 상태에서 새로 생성하려 하면, 기존 계정 JSON 백업 다운로드를 먼저 수행한 후 기존 데이터를 교체한다

### 3.3 Main_Account 입력 및 잔액 확인

1. Main_Account private key와 address 입력 필드
2. private key 입력 시 Arbitrum_RPC로 USDC 잔액 조회 및 표시
3. USDC 잔액을 소수점 2자리까지 USD 단위로 표시
4. ETH 잔액(Arbitrum tx fee용)을 소수점 6자리까지 표시
5. USDC 잔액이 (N × 5.5) 미만이면 "잔액 부족" 경고 및 전송 버튼 비활성화

### 3.4 Main→Sub USDC 전송

1. "USDC 전송" 클릭 시 각 Sub_Account로 5.5 USDC 순차 전송
2. 각 Sub_Account별 상태(대기/진행/성공/실패) 실시간 표시
3. 실패 시 해당 계정 실패 표시, 나머지 계속 진행
4. 완료 시 성공/실패 건수 요약

### 3.5 Hyperliquid 메인넷 Deposit

1. "Deposit 실행" 클릭 시 DepositWithPermit으로 5 USDC deposit
2. EIP-2612 Permit 서명으로 ETH gas 없이 수행
3. Permit domain: {name: "USD Coin", version: "2", chainId: 42161, verifyingContract: USDC_Contract}
4. 각 Sub_Account별 상태 실시간 표시
5. 실패 시 해당 계정 실패 표시, 나머지 계속
6. 완료 시 성공/실패 요약

### 3.6 Deposit 완료 모니터링

1. "Deposit 확인" 클릭 시 각 Sub_Account Hyperliquid 잔액 조회
2. 각 Sub_Account별 deposit 완료 상태 표시
3. deposit 완료된 계정 수 요약

### 3.7 테스트넷 Faucet Claim

1. "Faucet Claim" 클릭 시 deposit 완료된 Sub_Account에 POST 요청
2. body: {"type": "claimDrip", "user": "<address>"}
3. 각 Sub_Account별 상태 실시간 표시
4. 실패 시 해당 계정 실패 표시, 나머지 계속
5. 완료 시 성공/실패 요약

### 3.8 테스트넷 USDC 회수

1. "테스트넷 USDC 회수" 클릭 시 테스트넷 잔액 조회
2. USD_Send로 테스트넷 USDC 전액을 Main_Account로 전송
3. 각 Sub_Account별 상태 실시간 표시
4. 실패 시 해당 계정 실패 표시, 나머지 계속
5. 완료 시 총 회수 금액 및 성공/실패 요약

### 3.9 메인넷 USDC 회수

1. "메인넷 USDC 회수" 클릭 시 Hyperliquid 메인넷 잔액 조회
2. USD_Send로 메인넷 USDC 전액을 Main_Account로 전송 (withdraw 수수료 회피)
3. 각 Sub_Account별 상태 실시간 표시
4. 실패 시 해당 계정 실패 표시, 나머지 계속
5. 완료 시 총 회수 금액 및 성공/실패 요약

### 3.10 에러 복구 및 재시작

1. 각 단계를 독립적으로 실행 가능한 UI
2. Sub_Account를 localStorage에 영속 저장
3. 페이지 새로고침 시 localStorage에서 복원
4. 실패한 계정에 대해서만 재시도 버튼
5. JSON 파일 업로드로 Sub_Account 복원 가능

### 3.11 Private Key 보안 및 백업

1. 도구 상단에 보안 경고 상시 표시
2. Sub_Account 생성 시 JSON 파일 자동 다운로드
3. "키 백업 다운로드" 버튼 제공
4. private key 기본 마스킹, 클릭 시 전체 표시
5. Main_Account private key는 localStorage에 저장하지 않음

### 3.12 테스트 용이성

1. 계정 수(N) 기본값 1
2. N=1일 때 모든 단계 정상 동작
3. 각 단계 실행 결과를 상세 로그로 표시

---

## 4. HL Testnet Stress Tester

### 용어 정의 (추가)

- **Stress_Tester**: Hyperliquid 테스트넷의 스트레스 내성을 확인하는 도구
- **Stress_Instance**: 하나의 WebSocket 연결과 독립적인 구독/주문/레버리지 변경 루프를 가진 실행 단위
- **Instance_Manager**: N개의 Stress_Instance를 생성하고 관리하는 컨트롤러
- **Metrics_Dashboard**: WebSocket 연결 수, 채널 구독 수, GET/POST 요청 수 등 실시간 메트릭을 표시하는 UI 영역
- **HL_SDK**: @nktkas/hyperliquid npm 패키지 (WalletClient, EventClient, WebSocketTransport 포함)
- **EventClient**: HL_SDK의 WebSocket 구독 클라이언트 (webData2, orderUpdates, l2Book 등 채널 구독)
- **WalletClient**: HL_SDK의 거래 클라이언트 (order, cancel, updateLeverage 등 exchange 작업)
- **WebSocketTransport**: HL_SDK의 WebSocket 전송 계층 (테스트넷 URL: wss://api.hyperliquid-testnet.xyz/ws)
- **Coin_List**: Hyperliquid 테스트넷에서 거래 가능한 200개 이상의 코인 목록

### 4.1 도구 등록 및 라우팅

**User Story:** 개발자로서, 사이드바에서 Stress Tester를 선택하여 접근하고 싶다.

#### Acceptance Criteria

1. THE Toolkit_App SHALL tools 배열에 slug "hl-testnet-stress-tester", name "HL Testnet Stress Tester" 항목을 포함한다
2. WHEN 사이드바에서 "HL Testnet Stress Tester" 클릭 시, THE Toolkit_App SHALL Stress_Tester 컴포넌트를 렌더링한다
3. THE Tool_Page SHALL 도구 설명을 상단에 표시한다

### 4.2 입력 및 설정

**User Story:** 개발자로서, private key와 인스턴스 수를 입력하여 스트레스 테스트를 구성하고 싶다.

#### Acceptance Criteria

1. THE Stress_Tester SHALL Hyperliquid 테스트넷 계정의 private key 입력 필드를 제공한다
2. THE Stress_Tester SHALL 인스턴스 수(N) 입력 필드를 제공한다 (기본값: 1, 최솟값: 1)
3. WHEN private key 입력 시, THE Stress_Tester SHALL 0x 접두사 66자리 16진수 형식을 검증한다
4. IF 유효하지 않은 private key가 입력되면, THEN THE Stress_Tester SHALL 입력 필드 아래에 에러 메시지를 표시하고 시작 버튼을 비활성화한다
5. THE Stress_Tester SHALL private key를 마스킹하여 표시한다 (처음 6자와 마지막 4자만 노출)
6. THE Stress_Tester SHALL private key를 localStorage에 저장하지 않는다

### 4.3 인스턴스 생성 및 WebSocket 연결

**User Story:** 개발자로서, N개의 독립적인 인스턴스를 생성하여 동시에 테스트넷에 부하를 가하고 싶다.

#### Acceptance Criteria

1. WHEN "시작" 버튼 클릭 시, THE Instance_Manager SHALL N개의 Stress_Instance를 생성한다
2. THE Stress_Instance SHALL 각각 독립적인 WebSocketTransport를 생성한다 (URL: wss://api.hyperliquid-testnet.xyz/ws)
3. THE Stress_Instance SHALL 각각 독립적인 EventClient를 WebSocketTransport로 초기화한다
4. THE Stress_Instance SHALL 각각 독립적인 WalletClient를 생성한다 (isTestnet: true)
5. WHEN Stress_Instance 생성 시, THE Stress_Instance SHALL 다음 3개 채널을 EventClient로 구독한다:
   - webData2: 사용자의 open order 및 open position 정보 수신
   - orderUpdates: 주문 업데이트 수신
   - l2Book: coin "BTC", nSigFigs 5 (오더북 데이터)
6. IF WebSocket 연결이 실패하면, THEN THE Stress_Instance SHALL 에러를 로그에 기록하고 해당 인스턴스를 실패 상태로 표시한다
7. THE Stress_Instance SHALL 다른 인스턴스의 성공/실패와 무관하게 독립적으로 동작한다

### 4.4 주기적 레버리지 변경

**User Story:** 개발자로서, 주기적으로 레버리지를 변경하여 exchange API에 부하를 가하고 싶다.

#### Acceptance Criteria

1. WHILE Stress_Instance가 실행 중인 동안, THE Stress_Instance SHALL 10초마다 레버리지 변경을 수행한다
2. WHEN 레버리지 변경 시, THE Stress_Instance SHALL Coin_List에서 랜덤으로 코인 하나를 선정한다
3. THE Stress_Instance SHALL WalletClient.updateLeverage를 호출하여 선정된 코인의 레버리지를 변경한다
4. IF 레버리지 변경이 실패하면, THEN THE Stress_Instance SHALL 에러를 로그에 기록하고 다음 주기에 재시도한다

### 4.5 주기적 Limit Order

**User Story:** 개발자로서, 주기적으로 주문을 넣어 order 관련 API에 부하를 가하고 싶다.

#### Acceptance Criteria

1. WHILE Stress_Instance가 실행 중인 동안, THE Stress_Instance SHALL 10초마다 limit order를 수행한다
2. WHEN limit order 시, THE Stress_Instance SHALL Coin_List에서 랜덤으로 코인 하나를 선정한다
3. THE Stress_Instance SHALL 선정된 코인의 현재 mid price를 조회한다
4. THE Stress_Instance SHALL 체결되지 않도록 현재 mid price 대비 현저히 낮은 가격으로 limit order를 설정한다 (예: mid price의 50% 이하)
5. WHEN 선정된 코인에 기존 open order가 존재하면, THE Stress_Instance SHALL WalletClient.cancel로 해당 order를 취소한 후 새 order를 넣는다
6. THE Stress_Instance SHALL WalletClient.order를 호출하여 limit order를 제출한다 (GTC, buy, reduce-only false)
7. IF order 제출이 실패하면, THEN THE Stress_Instance SHALL 에러를 로그에 기록하고 다음 주기에 재시도한다

### 4.6 코인 목록 조회

**User Story:** 개발자로서, 테스트넷에서 거래 가능한 코인 목록을 자동으로 가져오고 싶다.

#### Acceptance Criteria

1. WHEN Stress_Tester 시작 시, THE Stress_Tester SHALL PublicClient.meta()를 호출하여 거래 가능한 코인 목록을 조회한다
2. THE Stress_Tester SHALL 조회된 코인 목록을 모든 Stress_Instance가 공유하도록 한다
3. IF 코인 목록 조회가 실패하면, THEN THE Stress_Tester SHALL 에러 메시지를 표시하고 시작을 중단한다

### 4.7 실시간 메트릭 표시

**User Story:** 개발자로서, 스트레스 테스트의 현재 상태를 실시간으로 모니터링하고 싶다.

#### Acceptance Criteria

1. THE Metrics_Dashboard SHALL 현재 활성 WebSocket 연결 수를 표시한다
2. THE Metrics_Dashboard SHALL 전체 WebSocket 채널 구독 수를 표시한다 (인스턴스당 3개 채널 × N개 인스턴스)
3. THE Metrics_Dashboard SHALL 누적 GET 요청 수를 표시한다 (코인 목록 조회, mid price 조회, open order 조회 등)
4. THE Metrics_Dashboard SHALL 누적 POST 요청 수를 표시한다 (order 제출, order 취소, 레버리지 변경)
5. WHILE 테스트 실행 중인 동안, THE Metrics_Dashboard SHALL 메트릭을 실시간으로 갱신한다
6. THE Metrics_Dashboard SHALL 각 Stress_Instance의 개별 상태(연결됨/실행중/에러)를 표시한다

### 4.8 테스트 제어

**User Story:** 개발자로서, 스트레스 테스트를 시작하고 중단할 수 있어야 한다.

#### Acceptance Criteria

1. THE Stress_Tester SHALL "시작" 버튼을 제공한다
2. THE Stress_Tester SHALL "중단" 버튼을 제공한다
3. WHILE 테스트 실행 중인 동안, THE Stress_Tester SHALL 시작 버튼을 비활성화하고 중단 버튼을 활성화한다
4. WHEN "중단" 클릭 시, THE Instance_Manager SHALL 모든 Stress_Instance의 WebSocket 연결을 종료하고 주기적 작업을 중단한다
5. WHEN 테스트 중단 시, THE Stress_Tester SHALL 모든 open order를 취소하는 정리(cleanup) 작업을 수행한다
6. WHEN 테스트 중단 완료 시, THE Stress_Tester SHALL 최종 메트릭 요약을 표시한다

### 4.9 에러 처리

**User Story:** 개발자로서, 개별 인스턴스의 에러가 전체 테스트를 중단시키지 않기를 원한다.

#### Acceptance Criteria

1. IF 개별 Stress_Instance에서 WebSocket 연결이 끊어지면, THEN THE Stress_Instance SHALL 재연결을 시도한다 (WebSocketTransport의 reconnect 옵션 활용)
2. IF 개별 Stress_Instance에서 API 호출이 실패하면, THEN THE Stress_Instance SHALL 에러를 로그에 기록하고 다음 주기에 계속 실행한다
3. THE Instance_Manager SHALL 개별 인스턴스의 실패가 다른 인스턴스의 실행에 영향을 주지 않도록 격리한다
4. IF rate-limit (HTTP 429) 응답을 수신하면, THEN THE Stress_Instance SHALL 해당 사실을 Metrics_Dashboard에 표시하고 Retry-After 시간만큼 대기 후 재시도한다

### 4.10 로그 표시

**User Story:** 개발자로서, 각 인스턴스의 활동 로그를 확인하고 싶다.

#### Acceptance Criteria

1. THE Stress_Tester SHALL 각 Stress_Instance의 활동 로그를 시간순으로 표시한다
2. THE Stress_Tester SHALL 로그에 타임스탬프, 인스턴스 번호, 작업 유형(레버리지 변경/주문/취소/구독), 결과(성공/실패)를 포함한다
3. THE Stress_Tester SHALL 로그를 스크롤 가능한 영역에 표시한다
4. THE Stress_Tester SHALL 최근 로그 500건까지 유지하고 초과 시 오래된 로그를 제거한다
