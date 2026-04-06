# 구현 계획: HL Testnet Faucet Farmer

## 개요

기존 Supercycl Toolkit Next.js 앱에 두 번째 도구인 Faucet Farmer를 추가한다. Sub_Account 생성, USDC 전송, DepositWithPermit, Faucet Claim, USDC 회수까지의 전체 파이프라인을 클라이언트 사이드에서 단계별로 실행하는 UI를 구현한다.

## Tasks

- [x] 1. 도구 등록 및 의존성 설치

  - [x] 1.1 `viem`과 `hyperliquid` 패키지 설치

    - `npm install viem hyperliquid`
    - _Requirements: 3.1_

  - [x] 1.2 `src/config/tools.ts`에 Faucet Farmer 도구 항목 추가

    - slug: `hl-testnet-faucet-farmer`, name: `HL Testnet Faucet Farmer`
    - description에 도구 설명 포함
    - _Requirements: 3.1.1, 3.1.2_

  - [x] 1.3 `src/app/tools/[slug]/page.tsx`에 slug 매핑 추가
    - `hl-testnet-faucet-farmer` slug일 때 FaucetFarmer 컴포넌트 렌더링
    - 아직 컴포넌트가 없으므로 placeholder import와 조건 분기만 추가
    - _Requirements: 3.1.3_

- [x] 2. 타입 정의 및 상수

  - [x] 2.1 `src/types/faucet.ts` 생성

    - SubAccount, MainAccountInfo, AccountStepStatusType, AccountStepStatus, StepSummary, FaucetFarmerState, FarmerStep, PermitSignature, AccountBackup 인터페이스/타입 정의
    - _Requirements: 3.2, 3.3, 3.4, 3.5, 3.7, 3.8, 3.9, 3.10, 3.11_

  - [x] 2.2 `src/lib/faucet/constants.ts` 생성
    - USDC_CONTRACT, BRIDGE_ADDRESS, ARBITRUM_RPC, API URL 상수
    - PERMIT_DOMAIN, PERMIT_TYPES, USDC_ABI, USDC_DECIMALS
    - DEPOSIT_AMOUNT_USD (5), TRANSFER_AMOUNT_USD (5.5)
    - _Requirements: 3.3, 3.4, 3.5_

- [ ] 3. 계정 관리 라이브러리

  - [x] 3.1 `src/lib/faucet/account.ts` 구현

    - generateSubAccounts(count): viem으로 N개 계정 생성
    - saveToLocalStorage / loadFromLocalStorage: localStorage CRUD
    - exportToJson / importFromJson: JSON 직렬화/역직렬화 (AccountBackup 형식)
    - downloadBackup: Blob + anchor 클릭으로 JSON 파일 다운로드
    - maskPrivateKey: 처음 6자 + 마지막 4자만 노출
    - isBalanceSufficient(balance, N): N × 5_500_000 이상 여부 판정
    - computeSummary(statuses): success/failed/total 집계
    - getFailedAccounts(statuses): failed 상태 계정 주소 필터
    - getDepositReadyAccounts(accounts, depositCheckStatuses): depositCheck success인 계정 필터
    - buildClaimBody(address): {type: "claimDrip", user: address} 반환
    - _Requirements: 3.2.1–3.2.6, 3.3.5, 3.7.1, 3.7.2, 3.10.2–3.10.5, 3.11.4_

  - [ ]\* 3.2 Property 1: 계정 생성 수량 정확성 테스트

    - **Property 1: 계정 생성 수량 정확성**
    - fast-check으로 임의의 양의 정수 N에 대해 generateSubAccounts(N)이 정확히 N개 유효한 계정 반환 검증
    - **Validates: Requirements 3.2.2**

  - [ ]\* 3.3 Property 2: localStorage 왕복 테스트

    - **Property 2: SubAccount localStorage 왕복**
    - saveToLocalStorage → loadFromLocalStorage 왕복 일치 검증
    - **Validates: Requirements 3.2.4, 3.10.2, 3.10.3**

  - [ ]\* 3.4 Property 3: JSON 백업 왕복 테스트

    - **Property 3: SubAccount JSON 백업 왕복**
    - exportToJson → importFromJson 왕복 일치 검증
    - **Validates: Requirements 3.10.5**

  - [ ]\* 3.5 Property 5: 잔액 부족 판정 테스트

    - **Property 5: 잔액 부족 판정**
    - 임의의 bigint 잔액과 양의 정수 N에 대해 isBalanceSufficient 정확성 검증
    - **Validates: Requirements 3.3.5**

  - [ ]\* 3.6 Property 7: 단계 요약 집계 정확성 테스트

    - **Property 7: 단계 요약 집계 정확성**
    - 임의의 AccountStepStatus 맵에 대해 computeSummary 집계 정확성 검증
    - **Validates: Requirements 3.4.4, 3.5.6, 3.6.3, 3.7.5, 3.8.5, 3.9.5**

  - [ ]\* 3.7 Property 8: Faucet Claim 대상 필터링 테스트

    - **Property 8: Faucet Claim 대상 필터링**
    - depositCheck 'success' 계정만 반환되는지 검증
    - **Validates: Requirements 3.7.1**

  - [ ]\* 3.8 Property 9: Faucet Claim 요청 본문 구성 테스트

    - **Property 9: Faucet Claim 요청 본문 구성**
    - buildClaimBody가 올바른 형태 반환 검증
    - **Validates: Requirements 3.7.2**

  - [ ]\* 3.9 Property 10: 실패 계정 재시도 필터 테스트

    - **Property 10: 실패 계정 재시도 필터**
    - failed 상태 계정만 반환되는지 검증
    - **Validates: Requirements 3.10.4**

  - [ ]\* 3.10 Property 11: Private Key 마스킹 테스트
    - **Property 11: Private Key 마스킹**
    - 처음 6자 + 마지막 4자만 노출, 나머지 마스킹 검증
    - **Validates: Requirements 3.11.4**

- [ ] 4. 체크포인트 — 계정 관리 라이브러리 검증

  - 모든 테스트 통과 확인, 질문이 있으면 사용자에게 문의

- [ ] 5. 잔액 조회 라이브러리

  - [x] 5.1 `src/lib/faucet/balance.ts` 구현

    - getUsdcBalance(address): viem publicClient로 USDC balanceOf 호출
    - getEthBalance(address): viem publicClient로 ETH 잔액 조회
    - getHyperliquidBalance(address, isTestnet): Hyperliquid info API로 잔액 조회
    - 잔액 포맷 유틸: USDC → 소수점 2자리, ETH → 소수점 6자리
    - _Requirements: 3.3.2, 3.3.3, 3.3.4, 3.6.1, 3.6.2_

  - [ ]\* 5.2 Property 4: 잔액 포맷팅 정확성 테스트
    - **Property 4: 잔액 포맷팅 정확성**
    - 임의의 bigint에 대해 USDC 소수점 2자리, ETH 소수점 6자리 포맷 검증
    - **Validates: Requirements 3.3.3, 3.3.4**

- [ ] 6. USDC 전송 라이브러리

  - [x] 6.1 `src/lib/faucet/transfer.ts` 구현
    - transferUsdc(privateKey, toAddress, amountUsd): viem walletClient로 ERC-20 transfer 실행
    - parseUnits로 금액 변환, txHash 반환
    - _Requirements: 3.4.1, 3.4.2, 3.4.3_

- [ ] 7. Deposit 라이브러리

  - [x] 7.1 `src/lib/faucet/deposit.ts` 구현
    - signPermit(privateKey, owner, value, nonce, deadline): viem signTypedData로 EIP-2612 Permit 서명
    - 서명 분할 로직 (r, s, v)
    - submitDeposit(user, usd, deadline, signature): depositWithPermit API POST 호출
    - nonce 조회를 위한 USDC contract nonces() 호출 포함
    - _Requirements: 3.5.1, 3.5.2, 3.5.3, 3.5.4, 3.5.5_

- [ ] 8. Faucet 및 USD_Send 라이브러리

  - [x] 8.1 `src/lib/faucet/faucet.ts` 구현

    - claimFaucet(address): POST FAUCET_API {type: "claimDrip", user: address}
    - sendUsd(privateKey, destination, amount, isTestnet): Hyperliquid SDK usdClassSend 호출
    - _Requirements: 3.7.1–3.7.4, 3.8.1–3.8.4, 3.9.1–3.9.4_

  - [ ]\* 8.2 Property 6: 순차 실행 에러 격리 테스트
    - **Property 6: 순차 실행 에러 격리**
    - 일부 계정 실패 시 나머지 계정 정상 처리 계속 검증
    - **Validates: Requirements 3.4.3, 3.5.5, 3.7.4, 3.8.4, 3.9.4**

- [ ] 9. 체크포인트 — 라이브러리 레이어 검증

  - 모든 테스트 통과 확인, 질문이 있으면 사용자에게 문의

- [x] 10. UI 컴포넌트 구현

  - [x] 10.1 `src/components/faucet-farmer/SecurityWarning.tsx` 구현

    - 보안 경고 배너 (정적 메시지, props 없음)
    - _Requirements: 3.11.1_

  - [x] 10.2 `src/components/faucet-farmer/AccountStatusTable.tsx` 구현

    - Sub_Account별 상태 테이블 (address, status, txHash, error, amount)
    - private key 마스킹 표시, 클릭 시 전체 표시
    - _Requirements: 3.4.2, 3.5.4, 3.7.3, 3.8.3, 3.9.3, 3.11.4_

  - [x] 10.3 `src/components/faucet-farmer/SubAccountManager.tsx` 구현

    - 계정 수(N) 입력 (기본값 1), 생성 버튼
    - 기존 계정 존재 시 백업 다운로드 후 교체 로직
    - 계정 목록 표시, 백업 다운로드 버튼, JSON 파일 업로드 복원
    - _Requirements: 3.2.1–3.2.6, 3.10.5, 3.11.2, 3.11.3_

  - [x] 10.4 `src/components/faucet-farmer/MainAccountInput.tsx` 구현

    - Main_Account private key 입력 필드
    - 입력 시 address 자동 도출, USDC/ETH 잔액 조회 및 표시
    - 잔액 부족 경고 표시
    - _Requirements: 3.3.1–3.3.5, 3.11.5_

  - [x] 10.5 `src/components/faucet-farmer/StepPanel.tsx` 구현
    - 단계별 실행 버튼 + 진행 상태 + 요약 표시 공통 컴포넌트
    - disabled, isRunning 상태 처리
    - _Requirements: 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10.1_

- [ ] 11. 메인 FaucetFarmer 컴포넌트

  - [x] 11.1 `src/components/faucet-farmer/FaucetFarmer.tsx` 구현
    - 전체 상태 관리 (FaucetFarmerState)
    - SecurityWarning, SubAccountManager, MainAccountInput 배치
    - 6개 단계 (transfer, deposit, depositCheck, faucetClaim, testnetRecover, mainnetRecover) 각각 StepPanel + AccountStatusTable 조합
    - 각 단계 실행 핸들러: Sub_Account 순차 처리, 상태 실시간 업데이트, 에러 격리
    - 실패 계정 재시도 버튼 연동
    - localStorage에서 Sub_Account 복원 (페이지 로드 시)
    - _Requirements: 3.4–3.9, 3.10.1–3.10.4, 3.12.1–3.12.3_

- [x] 12. 통합 및 라우팅 연결

  - [x] 12.1 `src/app/tools/[slug]/page.tsx`에서 FaucetFarmer 컴포넌트 import 및 렌더링 연결
    - 1.3에서 추가한 placeholder를 실제 FaucetFarmer 컴포넌트로 교체
    - _Requirements: 3.1.2, 3.1.3_

- [ ] 13. 최종 체크포인트 — 전체 통합 검증
  - 모든 테스트 통과 확인, 질문이 있으면 사용자에게 문의

## Notes

- `*` 표시된 태스크는 선택 사항이며 빠른 MVP를 위해 건너뛸 수 있음
- 각 태스크는 추적 가능성을 위해 구체적인 요구사항을 참조함
- 체크포인트에서 점진적 검증 수행
- Property 테스트는 fast-check 라이브러리 사용
- 모든 코드는 TypeScript, 클라이언트 사이드 전용 (서버 API 라우트 불필요)
