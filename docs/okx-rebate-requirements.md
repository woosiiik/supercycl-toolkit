# 요구사항 문서: OKX 리베이트 조회

## 소개

Supercycl은 코인 선물거래 애그리게이터로서 OKX 거래소와 브로커 프로그램 계약을 맺고 있다. 사용자들이 OKX에서 거래할 때 발생하는 수수료의 일부가 리베이트(커미션)로 Supercycl에 돌아온다. 이 도구는 OKX 브로커 API를 통해 리베이트 상세 CSV를 다운로드하고, PNL DB의 `t_trade_history` 테이블과 매핑하여 주소(address)별 리베이트 현황을 조회/분석/내보내기하는 기능을 제공한다.

## 용어 정의

- **OKX_Broker_API**: OKX 브로커 커미션 API (`/api/v5/broker/rebate/...`)
- **Rebate_CSV**: OKX에서 다운로드한 리베이트 상세 CSV 파일 (14개 컬럼)
- **PNL_DB**: Supercycl PNL 서비스의 MySQL 데이터베이스 (`pnl_db`)
- **Trade_History**: PNL_DB의 `t_trade_history` 테이블 — `order_id`와 `address` 매핑 정보 보유
- **User_Table**: PNL_DB의 `t_user` 테이블 — `address`와 `affiliate_no` 정보 보유
- **Unmatched_Order**: Rebate_CSV에는 있지만 Trade_History에서 매핑되는 `order_id`가 없는 레코드
- **Rebate_Cache**: 한 번 다운로드한 Rebate_CSV 데이터를 재사용할 수 있도록 저장한 캐시

---

## 1. 도구 등록 및 라우팅

**User Story:** 운영자로서, 사이드바에서 OKX 리베이트 조회 도구를 선택하여 접근하고 싶다.

### Acceptance Criteria

1. THE Toolkit_App SHALL tools 배열에 slug `"okx-rebate"`, name `"OKX 리베이트 조회"` 항목을 포함한다
2. WHEN 사이드바에서 "OKX 리베이트 조회" 클릭 시, THE Toolkit_App SHALL 해당 Tool_Page 컴포넌트를 렌더링한다
3. THE Tool_Page SHALL 도구 설명을 상단에 표시한다 (ToolHeader 컴포넌트 사용)

---

## 2. 입력값

**User Story:** 운영자로서, 조회 기간, OKX 브로커 인증 정보, PNL DB 접속 정보를 입력하여 리베이트 데이터를 조회하고 싶다.

### Acceptance Criteria

#### 2.1 기간 입력
1. THE Tool_Page SHALL 시작 날짜와 종료 날짜를 선택할 수 있는 날짜 입력 필드를 제공한다
2. IF 종료 날짜가 시작 날짜보다 이전이면, THEN THE Tool_Page SHALL 유효성 에러를 표시하고 실행을 차단한다
3. WHEN 날짜가 선택되지 않은 경우, THEN THE Tool_Page SHALL 실행 버튼을 비활성화한다

#### 2.2 OKX 브로커 인증 정보
1. THE Tool_Page SHALL OKX API Key, API Secret, API Passphrase 입력 필드를 제공한다
2. THE Tool_Page SHALL API Secret과 API Passphrase를 마스킹하여 표시한다
3. IF 세 개 필드 중 하나라도 비어있으면, THEN THE Tool_Page SHALL 실행 버튼을 비활성화한다

#### 2.3 PNL DB 접속 정보
1. THE Tool_Page SHALL PNL DB의 host, port, user, password 입력 필드를 제공한다
2. THE Tool_Page SHALL database 이름 필드를 제공하며, 기본값은 `"pnl_db"`로 한다
3. THE Tool_Page SHALL host 기본값을 `"127.0.0.1"`, port 기본값을 `3306`으로 한다
4. THE Tool_Page SHALL password를 마스킹하여 표시한다

#### 2.4 입력값 보존
1. THE Tool_Page SHALL OKX 브로커 인증 정보와 PNL DB 접속 정보(password 제외)를 localStorage에 저장하여 페이지 새로고침 후에도 유지한다
2. THE Tool_Page SHALL password, API Secret, API Passphrase는 localStorage에 저장하지 않는다

---

## 3. OKX 리베이트 CSV 다운로드

**User Story:** 운영자로서, OKX 브로커 API를 통해 지정 기간의 리베이트 상세 CSV를 다운로드하고 싶다.

### Acceptance Criteria

#### 3.1 CSV 생성 요청 (Step 1: IDLE → CSV_FILE_REQUESTED)
1. WHEN "실행" 버튼 클릭 시, THE Tool_Page SHALL OKX 브로커 API `POST /api/v5/broker/rebate/details-download-link`를 호출하여 CSV 생성을 요청한다
2. THE Tool_Page SHALL 요청 시 `beginDate`, `endDate`, `brokerType: "Api"` 파라미터를 전달한다
3. WHEN 요청 성공 시, THE Tool_Page SHALL 응답의 `ts` 값을 `requestId`로 저장한다
4. THE Tool_Page SHALL 현재 진행 상태를 "CSV 생성 요청 중..."으로 표시한다

#### 3.2 다운로드 링크 조회 (Step 2: CSV_FILE_REQUESTED → DOWNLOAD_LINK_READY)
1. AFTER CSV 생성 요청 성공 후, THE Tool_Page SHALL OKX 브로커 API `GET /api/v5/broker/rebate/download-link`를 주기적으로 폴링하여 다운로드 링크를 조회한다
2. THE Tool_Page SHALL 폴링 시 `isPending: false`, `beginDate`, `endDate`, `brokerType: "Api"` 파라미터를 전달한다
3. THE Tool_Page SHALL 응답에서 `cTime`이 `requestId`와 일치하고 `state`가 `"finished"`인 항목을 찾는다
4. WHEN 해당 항목을 찾으면, THE Tool_Page SHALL `fileHref` 값을 다운로드 URL로 저장한다
5. WHEN 해당 항목이 아직 없으면, THE Tool_Page SHALL 일정 간격(예: 5초) 후 재폴링한다
6. THE Tool_Page SHALL 현재 진행 상태를 "다운로드 링크 대기 중..."으로 표시한다

#### 3.3 CSV 파일 다운로드 (Step 3: DOWNLOAD_LINK_READY → CSV_FILE_DOWNLOADED)
1. WHEN 다운로드 URL이 준비되면, THE Tool_Page SHALL 해당 URL에서 CSV 파일 내용을 다운로드한다
2. THE Tool_Page SHALL 다운로드된 CSV 데이터를 메모리에 저장한다
3. THE Tool_Page SHALL 현재 진행 상태를 "CSV 다운로드 중..."으로 표시한다

#### 3.4 OKX API 인증
1. THE Tool_Page SHALL OKX API 요청 시 HMAC-SHA256 서명을 생성하여 헤더에 포함한다
2. THE Tool_Page SHALL 다음 헤더를 포함한다: `OK-ACCESS-KEY`, `OK-ACCESS-SIGN`, `OK-ACCESS-TIMESTAMP`, `OK-ACCESS-PASSPHRASE`

#### 3.5 에러 처리
1. IF OKX API 호출이 실패하면, THEN THE Tool_Page SHALL 에러 메시지를 표시하고 프로세스를 중단한다
2. IF 폴링이 일정 횟수(예: 60회) 이상 반복되면, THEN THE Tool_Page SHALL 타임아웃 에러를 표시한다
3. THE Tool_Page SHALL 각 단계의 성공/실패 상태를 시각적으로 표시한다

#### 3.6 진행 상태 표시
1. THE Tool_Page SHALL 전체 프로세스를 단계별로 표시한다 (CSV 생성 요청 → 링크 대기 → 다운로드 → DB 매핑 → 완료)
2. THE Tool_Page SHALL 현재 진행 중인 단계를 시각적으로 강조한다
3. THE Tool_Page SHALL 각 완료된 단계에 체크 표시를 한다

---

## 4. CSV 캐싱

**User Story:** 운영자로서, OKX에서 한 번 다운로드한 CSV 데이터를 저장해서 같은 기간을 다시 조회할 때 재다운로드 없이 즉시 사용하고 싶다.

### Acceptance Criteria

1. WHEN CSV 다운로드가 완료되면, THE Tool_Page SHALL 해당 데이터를 기간 정보와 함께 localStorage에 캐싱한다
2. WHEN 실행 버튼 클릭 시 동일 기간의 캐시 데이터가 존재하면, THE Tool_Page SHALL OKX API 호출을 건너뛰고 캐시 데이터를 사용한다
3. WHEN 캐시 데이터를 사용하는 경우, THE Tool_Page SHALL "캐시된 데이터 사용 중"이라는 안내를 표시한다
4. THE Tool_Page SHALL 캐시를 무시하고 새로 다운로드할 수 있는 "새로 다운로드" 옵션을 제공한다
5. THE Tool_Page SHALL 캐시 목록을 관리(확인/삭제)할 수 있는 UI를 제공한다

---

## 5. DB 매핑 및 주소별 집계

**User Story:** 운영자로서, CSV의 각 주문(order_id)을 PNL DB와 매핑하여 사용자 주소(address)별 리베이트 현황을 확인하고 싶다.

### Acceptance Criteria

#### 5.1 order_id → address 매핑
1. WHEN CSV 데이터가 준비되면, THE Tool_Page SHALL CSV 내 모든 고유 `order_id`를 수집한다
2. THE Tool_Page SHALL PNL_DB의 `t_trade_history` 테이블에서 해당 `order_id`들의 `address`를 조회한다
3. THE Tool_Page SHALL 조회 시 Next.js API Route를 통해 서버 사이드에서 DB 쿼리를 수행한다

#### 5.2 주소별 집계
1. THE Tool_Page SHALL 매핑된 데이터를 `address` 기준으로 집계하여 다음 값을 계산한다:
   - 해당 주소의 총 리베이트 합계 (`brokerRebate` 합산)
   - 해당 주소의 총 수수료 합계 (`fee` 합산, 부호 반전하여 양수로)
   - 해당 주소의 거래 건수
2. THE Tool_Page SHALL 전체 합산 요약도 표시한다 (총 리베이트, 총 수수료, 총 거래 건수, 매핑된 주소 수)

---

## 6. 결과 표시

**User Story:** 운영자로서, 주소별 리베이트를 합산값(요약)과 상세 내역을 함께 볼 수 있어야 한다.

### Acceptance Criteria

#### 6.1 요약 테이블 (주소별 합산)
1. THE Tool_Page SHALL 주소별 합산 테이블을 표시한다
2. THE Tool_Page SHALL 각 행에 다음 컬럼을 포함한다: address, 총 리베이트(USDT), 총 수수료(USDT), 거래 건수
3. WHEN 컬럼 헤더 클릭 시, THE Tool_Page SHALL 해당 컬럼 기준으로 오름차순/내림차순 정렬한다
4. THE Tool_Page SHALL 테이블 상단에 전체 합산 요약(총 리베이트, 총 수수료, 총 건수, 주소 수)을 표시한다

#### 6.2 상세 테이블 (주문별 내역)
1. WHEN 요약 테이블에서 특정 address 행을 클릭하면, THE Tool_Page SHALL 해당 주소의 상세 거래 내역을 표시한다
2. THE Tool_Page SHALL 상세 내역에 다음 컬럼을 포함한다: OrderId, InstId(종목), Fee, BrokerRebate, DerivativeTradeAmt(거래량), TS(거래시각)
3. THE Tool_Page SHALL 상세 내역을 거래 시각 기준으로 정렬하여 표시한다

---

## 7. affiliate_no 필터링

**User Story:** 운영자로서, `t_user` 테이블의 `affiliate_no`가 1인 사용자만 필터링하여 조회하고 싶다.

### Acceptance Criteria

1. THE Tool_Page SHALL `affiliate_no = 1` 필터 토글(체크박스 또는 스위치)을 제공한다
2. WHEN 필터가 활성화되면, THE Tool_Page SHALL PNL_DB의 `t_user` 테이블에서 `affiliate_no = 1`인 address 목록을 조회한다
3. WHEN 필터가 활성화되면, THE Tool_Page SHALL 요약 테이블과 상세 테이블 모두 해당 address만 표시한다
4. WHEN 필터가 활성화된 상태에서 CSV 내보내기 시, THE Tool_Page SHALL 필터링된 데이터만 내보낸다
5. THE Tool_Page SHALL 필터 적용 시 합산 요약도 필터링된 결과 기준으로 재계산하여 표시한다

---

## 8. Unmatched Order 확인

**User Story:** 운영자로서, OKX CSV에는 있지만 PNL DB에서 매핑되지 않는 주문을 별도로 확인하고 싶다.

### Acceptance Criteria

1. THE Tool_Page SHALL "매핑 결과" 탭과 "미매핑 주문" 탭을 제공한다
2. THE "미매핑 주문" 탭 SHALL Trade_History에서 `order_id`가 매핑되지 않은 CSV 레코드 목록을 표시한다
3. THE "미매핑 주문" 탭 SHALL 각 행에 다음 컬럼을 포함한다: OrderId, InstId, Fee, BrokerRebate, DerivativeTradeAmt, TS
4. THE Tool_Page SHALL 미매핑 건수를 탭 타이틀에 표시한다 (예: "미매핑 주문 (42)")
5. THE Tool_Page SHALL 미매핑 주문의 리베이트 합계를 별도로 표시한다

---

## 9. CSV 내보내기

**User Story:** 운영자로서, 조회된 리베이트 데이터를 CSV 파일로 내보내어 외부에서 활용하고 싶다.

### Acceptance Criteria

1. THE Tool_Page SHALL "CSV 다운로드" 버튼을 제공한다
2. WHEN "CSV 다운로드" 클릭 시, THE Tool_Page SHALL 현재 표시 중인 데이터(필터 적용 포함)를 CSV 파일로 생성한다
3. THE CSV SHALL 요약 테이블 기준으로 다음 컬럼을 포함한다: address, 총 리베이트(USDT), 총 수수료(USDT), 거래 건수
4. THE CSV 파일명 SHALL 기간 정보를 포함한다 (예: `okx-rebate-2026-04-01-to-2026-04-23.csv`)
5. THE Tool_Page SHALL 미매핑 주문 탭에서도 별도의 CSV 내보내기를 제공한다
