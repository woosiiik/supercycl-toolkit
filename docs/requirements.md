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

## 4. (미정) 추가 도구

> 향후 추가될 도구의 요구사항이 여기에 정리됩니다.