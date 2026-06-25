# 거래소 PNL 수집/검증 도구 — 코드·기능·데이터 리뷰

> 리뷰 대상: `supercycl-toolkit` 의 "거래소 PNL 수집/검증" 메뉴 (slug: `exchange-pnl`)
> 대상 커밋: `ad28e2a` (HEAD) — 추가 커밋 4개(`7c15595` → `ad28e2a`)
> 설계 근거 문서: `pnl_was/docs/pnl/exchange-pnl-comparison.md` (+ `okx-pnl-collection-research.md`, `pnl-research-issues.md`)
> 리뷰 범위: API 라우트 / 7개 거래소 어댑터 / 정규화·집계 로직 / UI 표시 / 설계 문서
> 검증 방법: 코드 정독 + 공식 API 문서/SDK 교차검증(OKX python-okx SDK, ccxt, Bybit·Binance 공식 문서). **실제 거래소 키로의 라이브 호출은 수행하지 않음** → "라이브 확인 필요" 표기 항목은 실호출로만 최종 확정 가능.

---

## 0. 한눈에 보기 (요약)

전체적으로 **설계 의도(문서 §2.5의 "PnL을 가격손익·수수료·펀딩 3컴포넌트로 분리 저장 → 토글은 단순 산술")가 코드에 잘 반영**되어 있고, 7개 거래소의 인증(서명) 로직과 페이지네이션 방식은 **OKX를 제외하면 모두 정확**합니다. 거래소별 지원등급(A/A-/B)·미지원 지표("—") 표기, 원본 응답(raw) 노출, US 리전 차단 대응(fra1) 등 실전 디테일도 꼼꼼합니다.

다만 **OKX 어댑터에 데이터 정확성을 해치는 심각한 버그가 있습니다.** OKX는 7개 중 첫 번째이자 전용 리서치 문서까지 있는 핵심 거래소인데, **수집 기간(날짜 범위)이 실제로 적용되지 않고**, 포지션이 100건 이상인 계정에서는 **동일 데이터가 최대 30배 중복 수집**될 수 있습니다.

| # | 심각도 | 항목 | 위치 |
|---|:---:|---|---|
| H-1 | 🔴 High | OKX: `begin`/`end` 는 positions-history의 유효 파라미터가 아님 → **날짜 범위 미적용** | `adapters/okx.ts` |
| H-2 | 🔴 High | OKX: `after` 커서에 `posId`를 넣음(실제는 `uTime` ms 타임스탬프) → **페이지 중복(최대 30×) 또는 페이지네이션 무력화** | `adapters/okx.ts` |
| M-1 | 🟡 Med | OKX: side가 항상 `null` — 응답 필드는 `direction`인데 `posSide`를 읽음 | `adapters/okx.ts` |
| M-2 | 🟡 Med | 어디에도 `id` 기반 중복제거(dedupe)가 없음 — H-2와 결합 시 치명적 | `metrics.ts`, 전 어댑터 |
| M-3 | 🟡 Med | Hyperliquid 펀딩 row의 `unit`이 `"fill"` (Bybit는 `"income"`) → 종료건수·평균 분모·심볼 건수 왜곡 | `adapters/hyperliquid.ts` |
| M-4 | 🟡 Med | 수집 범위가 **USDT 무기한만** (OKX SWAP/ Bitget USDT-FUTURES 등). 코인마진·USDC·만기선물 누락 — UI 미고지 | 전 어댑터 |
| M-5 | 🟡 Med | `maxDuration=120s` + 전 요청 순차 실행 → 심볼·윈도우 많은 계정에서 타임아웃 가능 | `route.ts`, 어댑터 |
| L-1 | 🟢 Low | "Net PnL (30일)" 라벨이 선택 기간과 무관하게 고정 | `MetricsPanel.tsx` |
| L-2 | 🟢 Low | `win`(승/패)이 수집 시점 net 고정 → 수수료/펀딩 토글에 반응 안 함. OKX 웹은 가격손익 기준 | `metrics.ts`, 어댑터 |
| L-3 | 🟢 Low | Hyperliquid 지갑주소 필드가 `secret:false` → 빈 값이어도 수집 버튼 활성 | `exchanges.ts`, `ExchangeCard.tsx` |
| L-4 | 🟢 Low | BingX `meta.endpoints` 가 심볼 직접입력 시에도 income 포함 표기 | `adapters/bingx.ts` |
| S-1 | 🔵 보안 | `/api/exchange-pnl` 무인증 서명 프록시 + 키 평문 localStorage 저장 | `route.ts`, `storage.ts` |

> 심각도 정의: 🔴 그대로 두면 표시 수치가 틀림 / 🟡 일부 조건에서 수치·동작 오류 / 🟢 표현·UX / 🔵 보안 고려.

---

## 1. 아키텍처 개요

```
[브라우저]                         [Next.js Route Handler]              [거래소 REST]
 ExchangePnl.tsx                    /api/exchange-pnl (nodejs)           okx/bingx/...
  - API key는 localStorage           - exchange/credentials 검증           - 서명된 GET/POST
  - 기간/토글 상태                    - getAdapter(exchange) 호출           - 원본 JSON 응답
  - fetch POST {creds,start,end} ──▶  - 어댑터가 HMAC 서명·호출  ──────────▶
                              ◀────── - { rows[], rawPages[], warnings, meta } 반환
  - computeMetrics(rows, toggles) (클라이언트 집계·표시)
```

핵심 설계 결정과 평가:

- **키를 서버에 저장하지 않고 매 요청 전달** — read-only 키 전제에서 합리적. (단, 키는 서버 함수를 *경유*하므로 "서버 미저장"이 "서버 미통과"는 아님 → S-1 참고.)
- **PnL 3컴포넌트 분리(`pricePnl`/`fee`/`funding`) + 클라이언트 토글 재계산** — 문서 §2.5 설계를 정확히 구현. `effectiveNet = pricePnl + (fee?) + (funding?)` (`metrics.ts`). 좋은 설계.
- **거래소별 어댑터 + 공용 util(서명/HTTP/윈도우 분할)** — 구조가 깔끔하고 확장 용이.
- **원본 응답(rawPages) 보존·노출** — "검증용 도구"라는 목적에 부합. `RawDataView`의 유형별 건수 집계(Binance incomeType, Bybit closed-pnl vs SETTLEMENT, HL dir)는 누락 진단에 유용.

### 잘 된 점 (그대로 유지 권장)

1. **서명 로직 7개 모두 정확** (아래 §3 각 항목 참고). 특히 Gate HMAC-SHA512의 `method\npath\nquery\nSHA512(body)\nts` 페이로드, Bybit `ts+apiKey+recvWindow+qs`, Bitget/OKX `ts+method+requestPath+body` 모두 공식 스펙과 일치.
2. **US 리전 차단 대응(`ad28e2a`)** — Vercel 기본 리전(iad1)에서 Bybit/Binance/OKX가 403/451로 막히는 실문제를 `vercel.json regions=["fra1"]` + 라우트 `preferredRegion="fra1"` + Bybit 호스트 폴백(`api.bybit.com`→`api.bytick.com`) + 기본 User-Agent로 정확히 해결. 실전 감각이 좋음.
3. **지원등급 분리 표시** — `winRateStrict`(포지션 단위 = OKX·BingX·Bitget·Gate만) vs `winRate`(청산오더·fill 근사 포함)를 카드로 분리. 문서 §3-2의 "거래소별 지원 등급 표시" 요구를 충족.
4. **혼합 단위 안전장치** — income/fill 단위 거래소가 섞이면 "포지션 단위 정보 없음" 안내, 미지원 지표는 "—" 처리.

---

## 2. 데이터 흐름 정확성 (수집 → 정규화 → 집계 → 표시)

| 단계 | 평가 | 비고 |
|---|---|---|
| 수집(어댑터) | ⚠️ | OKX만 기간 미적용·중복(H-1/H-2). 나머지 6개는 기간 파라미터/커서 정확 |
| 정규화(`NormalizedRow`) | 🟡 | 컴포넌트 매핑은 대체로 정확. OKX side null(M-1), HL 펀딩 unit(M-3) |
| 집계(`computeMetrics`) | 🟡 | 토글 산술·승률 분리는 정확. dedupe 부재(M-2), closedCount에 HL 펀딩 포함(M-3) |
| 표시(`MetricsPanel`/`RawDataView`) | 🟢 | 적응형 숫자 포맷·심볼 출처 배지 양호. "30일" 라벨 고정(L-1) |

집계 로직(`metrics.ts`) 자체는 견고합니다. 일별 버킷은 `closeTime`(귀속시각)을 UTC 날짜로 그룹핑하고, 토글에 따라 net을 재계산하며, 승률을 정식/근사로 분리합니다. 문제는 **입력 row의 품질**(OKX 중복·기간 누락)과 **dedupe 부재**입니다 — 집계가 정확해도 입력이 오염되면 결과가 틀립니다.

---

## 3. 거래소별 상세 리뷰 (7개)

각 항목: 엔드포인트 / 서명 / 페이지네이션·기간 / PnL 컴포넌트 / hold time·승패 / 검증 상태.

### 3-1. OKX — [A] 포지션 히스토리 · 🔴 **버그 있음**

- **엔드포인트**: `GET /api/v5/account/positions-history` (instType=SWAP). ✅ 올바른 엔드포인트.
- **서명**: `base64(HMAC-SHA256(secret, ISO8601_ts + "GET" + requestPath))`, 헤더 `OK-ACCESS-*`. ✅ 정확.
- **PnL 컴포넌트 매핑**: `pnl`→가격손익, `fee`→수수료, `fundingFee`→펀딩, `realizedPnl`→net. ✅ **정확** — ccxt 샘플로 항등식 확인: `pnl(27.12) + fee(-1.696) + fundingFee(-11.87) = realizedPnl(13.55)`. (단 `liqPenalty`는 컴포넌트에서 누락 → 청산 포지션에서 net이 미세하게 어긋남, 영향 작음.)

- 🔴 **H-1 기간(날짜 범위) 미적용**: 어댑터는 `begin: req.startTime, end: req.endTime` 를 쿼리에 넣지만, **positions-history에는 `begin`/`end` 파라미터가 없습니다.** (공식 `python-okx` SDK의 `get_positions_history` 파라미터는 `instType, instId, mgnMode, type, posId, after, before, limit` 뿐.) OKX는 모르는 쿼리 파라미터를 무시하므로, **사용자가 어떤 기간을 골라도 OKX는 보존기간(~3개월) 내 최신 포지션을 그대로 반환**합니다. 클라이언트단 기간 필터도 없어(아래 M-2), "최근 7일"을 골라도 최대 3개월치가 섞여 들어옵니다.

- 🔴 **H-2 페이지네이션 커서 오용**: 다음 페이지 커서를 `after = data[data.length-1].posId` 로 설정합니다. 그러나 positions-history의 `after`/`before`는 **`uTime` 기준 ms 타임스탬프**입니다. (ccxt 공식 구현 주석: *after = "timestamp in ms of the latest position to fetch based on the last update time of the position"*.) `posId`(예: `681423155054862336`)를 ms 타임스탬프로 해석하면 수천만 년 후가 되어, OKX는 "그보다 이른 기록 = 전부"를 반환 → **매 페이지가 동일한 최신 100건**이 됩니다. 100건 이상인 계정은 `data.length < 100` 종료조건에 안 걸려 **`MAX_PAGES=30`까지 같은 100건을 반복 수집**하고, dedupe도 없어 **net·건수·승률·차트가 최대 30배 부풀려집니다.** (포지션이 100건 미만이면 1페이지에서 종료되어 중복은 없지만, H-1로 기간은 여전히 무시됨.)

  ```ts
  // 현재 (잘못됨)
  begin: req.startTime, end: req.endTime,   // ← 무효 파라미터, 무시됨
  ...
  after = data[data.length - 1]?.posId ?? "";  // ← uTime(ms)여야 함

  // 권장
  // begin/end 제거, after = 마지막 row 의 uTime(ms)
  after = data[data.length - 1]?.uTime ?? "";
  // 그리고 uTime < req.startTime 도달 시 중단 + closeTime 을 [start,end] 로 클립
  ```

- 🟡 **M-1 side 항상 null**: positions-history 응답의 방향 필드는 **`direction`** ("long"/"short")인데, `normalize()`는 `d.posSide`(실시간 positions 엔드포인트의 필드)를 읽습니다. 결과적으로 OKX의 모든 row에서 `side=null`("—"로 표시). 집계 수치에는 영향 없으나 표시·향후 방향별 분석에 영향.

- **hold time / 승패**: `cTime`/`uTime`로 holdTime 산출, `win=net>0`. 등급 A로서 의도대로 동작(중복 문제 해결 시).
- **검증 상태**: 엔드포인트·서명·컴포넌트 매핑 = 문서/공식소스로 확인. H-1/H-2/M-1 = 공식 SDK·ccxt로 확인된 **실제 버그**.

> OKX는 등급 A의 대표 거래소라 이 버그의 체감 영향이 가장 큽니다. **합산 보기**에서도 OKX의 부풀려진 수치가 전체를 왜곡합니다. 최우선 수정 권장.

### 3-2. BingX — [A] 포지션 히스토리(심볼 순회) · ✅ 양호

- **엔드포인트**: `GET /openApi/swap/v1/trade/positionHistory` + 심볼 미입력 시 `GET /openApi/swap/v2/user/income`에서 거래 심볼 자동 추출. ✅
- **서명**: `HMAC-SHA256(secret, queryString)` 후 `&signature=` append, 헤더 `X-BX-APIKEY`. ✅ 전송 쿼리와 서명 대상이 동일해 일관.
- **페이지네이션·기간**: `startTs`/`endTs` + `pageIndex`/`pageSize=100`, 89일 윈도우 분할. ✅ 기간 정상 적용.
- **PnL**: `realisedProfit`/`positionCommission`/`totalFunding`, net은 `netProfit` 우선. ✅ 컴포넌트 분해.
- **주의/소견**:
  - 🟢 **L-4**: 사용자가 심볼을 직접 입력하면 income을 호출하지 않는데도 `meta.endpoints`가 `[INCOME_PATH, PATH]`로 표기됨(원본 데이터 탭의 엔드포인트 표기만 부정확, 수집 자체는 정상).
  - income 자동추출은 income 원장에 흔적 있는 심볼만 잡으므로, income에 안 잡히는 심볼은 누락될 수 있음(어댑터/문서가 "직접 입력으로 보완" 안내 — 적절).
  - 서명을 URL-인코딩된 값으로 계산하는데, 일반 선물 심볼(영문+하이픈)·숫자만 다뤄 실무상 문제 없음(특수문자 심볼에서만 이론적 리스크).
- **검증 상태**: 파라미터·필드명은 BingX 관례와 일치. rate limit 최신치는 문서(B-2)대로 **라이브 확인 권장**.

### 3-3. Bitget — [A] 포지션 히스토리 · ✅ 양호

- **엔드포인트**: `GET /api/v2/mix/position/history-position` (productType=USDT-FUTURES). ✅
- **서명**: `base64(HMAC-SHA256(secret, ts + "GET" + requestPath(?query)))`, 헤더 `ACCESS-KEY/SIGN/TIMESTAMP/PASSPHRASE` + `locale`. ✅ 정확.
- **페이지네이션·기간**: `idLessThan = 응답 endId` 커서, 89일 윈도우 분할(요청당 90일 초과 불가 대응). ✅
- **PnL**: `pnl`→가격, `openFee+closeFee`→수수료, `totalFunding`→펀딩, net은 `netProfit` 우선. ✅
- **검증 상태**: 서명·페이지네이션 구조 정확. `ctime`/`utime` 의미와 `netProfit` 계산식은 문서(B-6)대로 **실데이터 1건 검증 권장**(공식 문서가 SPA라 자동 추출이 막혀 미확정으로 남은 항목).

### 3-4. Gate — [A] 포지션 히스토리 · ✅ 양호

- **엔드포인트**: `GET /api/v4/futures/usdt/position_close` (settle=usdt). ✅
- **서명**: `HMAC-SHA512`, payload `GET\n{fullPath}\n{query}\n{SHA512(body)}\n{ts}`, 헤더 `KEY/SIGN/Timestamp`. ✅ 공식 스펙과 일치.
- **페이지네이션·기간**: `from`/`to`(초 단위 — `Math.floor(ms/1000)` 정확) + `offset += 100`. ✅
- **PnL**: `pnl_pnl`/`pnl_fee`/`pnl_fund` 분해, net = 컴포넌트 합. ✅ (Gate `pnl`이 가격손익만일 가능성에 대비해 컴포넌트 합을 net으로 쓰는 처리 적절.)
- **dedupe id**: `(contract, side, first_open_time, time)` 조합키 — 문서 권고와 일치(단 실제 dedupe 적용은 없음, M-2).
- **주의**: `offset` 상한·보존기간은 문서(B-5)대로 **라이브 확인 필요**. 포지션이 매우 많으면 `MAX_PAGES=30`(3000건) 상한에 걸릴 수 있음.

### 3-5. Bybit — [A-] 청산오더 단위 · ✅ 양호(근사 한계는 의도된 설계)

- **엔드포인트**: `GET /v5/position/closed-pnl` + 펀딩용 `GET /v5/account/transaction-log` (type=SETTLEMENT). ✅
- **서명**: `HMAC-SHA256(secret, ts + apiKey + recvWindow + qs)`, 헤더 `X-BAPI-*`. ✅
- **페이지네이션·기간**: 7일 윈도우 분할 + `nextPageCursor`. ✅ (단일요청 7일 제한 대응.)
- **PnL 재구성**: `net = closedPnl`, `fee = -(openFee+closeFee)`, `pricePnl = net - fee`. ✅ **자기일관적**으로 확인됨 — Bybit 공식 헬프센터상 청산손익(realized P&L)은 **거래 수수료를 이미 반영**하고 펀딩은 별도이므로, `pricePnl = closedPnl + (openFee+closeFee)` = 수수료 전 가격손익으로 정확히 역산됨. 펀딩은 transaction-log에서 별도 수집(실제 발생일 귀속). 문서가 "수수료 포함 여부 검증 권장"이라 남겼던 항목인데, 구현 가정이 **맞습니다.**
- **hold time / 승패**: 청산오더 단위라 hold time = null, 승/패는 "청산오더 근사"(unit=`closing_order`) — 문서·UI 모두 △로 정직하게 표기. ✅
- **소견**: 호스트 403 폴백은 status===403만 처리(451 등은 미폴백). 펀딩 금액은 `funding→cashFlow→change` 폴백 — 합리적.

### 3-6. Binance (USDT-M) — [B] income 방식 · ✅ 양호

- **엔드포인트**: `GET /fapi/v1/income`. ✅
- **서명**: `HMAC-SHA256(secret, qs)` append, 헤더 `X-MBX-APIKEY`. ✅
- **페이지네이션·기간**: `limit=1000` + `startTime = 마지막 time+1ms` 시간 커서. ✅ **확인**: income은 userTrades와 달리 7일 범위 제한이 없어, 30일 범위를 시간 커서로 페이징하는 현재 방식이 맞음.
- **컴포넌트**: `REALIZED_PNL`/`COMMISSION`/`FUNDING_FEE`만 정규화(TRANSFER 등 제외). ✅ 실제 발생일 귀속이라 일별 분해 정확.
- **hold time/승패**: income 단위라 불가(win=null, unit=`income`) — 의도대로. ✅
- **소견**: incomeType 미지정으로 전체를 받아 클라이언트 필터(원본 보존에 유리, weight 다소 증가). `RawDataView`의 incomeType별 건수·FUNDING_FEE 0건 안내가 친절.

### 3-7. Hyperliquid — [B] income(fills closedPnl) · 🟡 사소 버그

- **엔드포인트**: `POST /info` — `userFillsByTime`(체결) + `userFunding`(펀딩). API key 없이 지갑주소로 공개 조회. ✅
- **페이지네이션·기간**: `startTime = 마지막 time+1ms`, 응답 2000건 기준 다음 페이지, `MAX_PAGES=10`(~10k fill 한계). ✅
- **PnL**: `net = closedPnl - fee`, `pricePnl = closedPnl`, `fee = -fee`. ✅ 문서 정의와 일치.
- 🟡 **M-3 펀딩 row의 unit이 `"fill"`**: `normalizeFunding()`이 `unit: "fill"`로 설정합니다(Bybit의 펀딩 row는 `"income"`). `computeMetrics`의 `closedCount`는 `unit !== "income"`을 세므로 **HL 펀딩 원장이 "종료 건수"에 포함**되어 평균 PnL/건 분모와 심볼별 건수를 부풀립니다. (승/패는 win=null이라 영향 없음.) → `"income"`으로 통일 권장.
- 🟢 **L-3**: 지갑주소 필드가 `secret:false`라 빈 값이어도 수집 버튼이 활성화됨(어댑터가 경고로 우아하게 처리하긴 함).
- **소견**: 펀딩 페이지 종료 조건 `funds.length < 500`은 근거가 약한 매직넘버(응답 상한과 무관). 큰 영향은 없으나 응답 실제 상한 기준으로 정리 권장.

---

## 4. 횡단 관심사 (전 거래소 공통)

### M-2 🟡 중복제거(dedupe) 미구현
`NormalizedRow.id`(posId/orderId/tranId/tid/조합키)를 잘 만들어 두었지만 **실제로 id 기준 dedupe를 수행하는 코드가 없습니다.** 정상 커서를 쓰는 6개 거래소는 페이지 중복이 거의 없어 실무상 문제가 적지만, 윈도우 경계(양끝 inclusive) 중복 가능성이 남고, **OKX(H-2)에서는 치명적**입니다. 집계 직전 `id` 기준 dedupe를 한 곳에 두면 H-2의 피해도 완화됩니다(근본 수정은 커서 교정).

### M-4 🟡 수집 범위 = USDT 무기한만
OKX `SWAP`, Bitget `USDT-FUTURES`, Gate `settle=usdt`, Binance `fapi(USDT-M)`, BingX swap — 모두 **USDT 마진 무기한**만 수집합니다. 코인마진(COIN-M/inverse), USDC 마진, 만기 선물(OKX FUTURES 등)은 빠집니다. OKX 리서치 문서는 "instType = SWAP/FUTURES 수집"을 의도했는데 코드는 SWAP만 처리합니다. 대부분의 사용자는 USDT 무기한이 대부분이라 영향은 제한적이지만, **UI에 "USDT 무기한 기준" 범위 고지**가 없어 사용자가 전량으로 오해할 수 있습니다.

### M-5 🟡 타임아웃·순차 실행
`route.ts` `maxDuration=120`(2분), 모든 거래소 요청이 **완전 순차**입니다. BingX(심볼 N개 × 윈도우 × 페이지)·Bybit(다수 7일 윈도우 × 2소스 × 페이지)는 요청 수가 빠르게 늘어 2분 한도를 넘길 수 있습니다(특히 활발한 계정의 장기간 조회). rate-limit 보호(요청 간 지연)도 없어 거래소측 차단 위험도 잠재. 현재는 검토용 도구라 수용 가능하나, 기간 축소 권고·진행률 표시·필요 시 부분결과 반환을 고려.

### L-1 🟢 "30일" 라벨 고정
`MetricsPanel`의 "Net PnL (30일)" 라벨이 사용자가 고른 기간과 무관하게 항상 "30일"로 표기됩니다. 일별 차트도 반환된 모든 날짜를 그립니다. 선택 기간을 라벨에 반영 권장.

### L-2 🟢 승/패 정의와 토글 불일치
`win`은 수집 시점에 `net(전체) > 0`으로 고정되어, 수수료/펀딩 토글을 꺼도 승/패·승보유시간/패보유시간 분류는 바뀌지 않습니다(Net PnL 수치만 바뀜). 또한 OKX 웹 UI는 승/패를 가격손익(`pnl`>0) 기준으로 셈 — 어댑터의 net 기준과 달라 **거래소 화면과 승률이 다를 수 있습니다.** 검증 도구로서 "어느 기준인지" 명시 또는 토글 연동 권장.

### S-1 🔵 보안 고려
- `/api/exchange-pnl`는 **무인증** 엔드포인트입니다. 호출 시 제공된 자격증명으로 서버가 서명·외부 호출을 대행합니다. 호스트가 어댑터별로 고정되어 임의 SSRF 위험은 낮지만, 인증·rate-limit이 없어 컴퓨팅 남용·탐침에 노출됩니다. 배포 환경이 공개라면 접근 제어 추가를 권장합니다.
- API key는 **localStorage 평문 저장**(코드 주석에 "read-only 키 전제"로 명시)이며, 매 요청 시 **서버 함수를 경유**합니다("서버 미저장"이 "서버 미통과"는 아님). read-only 키 전제에선 수용 가능하나, XSS 시 키 노출 가능성과 함께 사용자 고지 권장.

---

## 5. 설계 문서 리뷰 (`exchange-pnl-comparison.md` 외)

문서 자체의 품질은 높습니다. 7개 거래소를 [A]/[A-]/[B]로 분류한 판단 규칙("복잡한 역산은 불가로 간주")이 명확하고, §2.5의 컴포넌트 분리 → 토글 설계는 구현으로 잘 이어졌습니다. `pnl-research-issues.md`가 자체 교차검증으로 다수 항목을 이미 수정/추적 중이라는 점도 좋습니다.

발견한 문서 이슈:

1. **(직접적 버그 유발 가능성) OKX 페이지네이션·dedupe 서술 혼동** — §2-1이 "after/before cursor 페이지네이션, dedupe=`posId`"를 **한 줄에** 적어, *페이지네이션 커서*와 *중복제거 키*가 모두 posId인 것처럼 읽힙니다. 실제로 `okx-pnl-collection-research.md` §8은 "after/before 커서(**ms ts**)"로 올바르게 적고 있습니다. 코드가 `after`에 posId를 넣은 H-2 버그는 이 혼동과 정확히 맞닿아 있습니다. → 문서를 "**페이지네이션 = uTime(ms) 기준 after/before**, **dedupe = posId**(서로 다른 값)"로 명확히 분리 권장.
2. **다수 항목이 "라이브 확인 필요"인 채로 구현됨** — Gate 보존기간(B-5), Bitget `ctime/utime/netProfit`(B-6), OKX·Gate 요청당 시간 윈도우 상한(B-4), BingX 최신 rate limit(B-2)은 문서에서 미확정(⚪)인데, 도구는 이 가정 위에 만들어졌습니다. 도구의 "원본 데이터" 탭이 바로 이 검증용이므로, 실제 키로 1회씩 호출해 문서의 ⚪ 항목을 닫는 것이 다음 단계로 적절합니다.
3. **수집 범위(USDT 무기한)와 문서의 instType 의도 불일치**(M-4) — 문서는 OKX SWAP/FUTURES를 언급하나 코드는 SWAP만. 문서에 "현 구현은 USDT 무기한만"을 명시하면 혼선 방지.
4. 나머지(D-2 정책적 제외 각주, B-1 Binance "REST 미노출" 표현 등)는 `pnl-research-issues.md`에서 이미 반영·정리됨. 문서 내용상의 사실오류는 추가로 발견되지 않았습니다.

---

## 6. 권장 조치 (우선순위순)

1. **🔴 OKX 어댑터 수정 (최우선)**
   - `begin`/`end` 제거. `after` 커서를 `uTime`(ms)로 교체. `uTime < startTime` 도달 시 중단하고, 안전망으로 `closeTime`을 `[startTime, endTime]`로 클립.
   - side는 `direction` 필드에서 파싱.
   - 가능하면 SWAP + FUTURES 모두 수집(M-4).
2. **🟡 집계 직전 `id` 기준 dedupe 추가** (M-2) — OKX 피해 완화 + 윈도우 경계 중복 방지.
3. **🟡 Hyperliquid 펀딩 row `unit`을 `"income"`으로 변경** (M-3).
4. **🟡 수집 범위(USDT 무기한) UI 고지 + 타임아웃 가드/진행률** (M-4, M-5).
5. **🟢 라벨·승패 정의 정리** (L-1, L-2), 지갑주소 필수화(L-3), BingX endpoints 표기(L-4).
6. **🔵 무인증 라우트 접근제어 검토** (S-1).
7. **검증 단계 권장**: 거래소별 read-only 키로 1회씩 수집 후, **거래소 웹 UI의 "Last 30 days" 수치와 대조**. 특히 OKX는 수정 전후로 동일 계정 net을 비교하면 중복/기간 버그가 즉시 드러납니다. (현재 자동화 테스트가 전무하므로, 정규화 함수에 대한 단위 테스트 추가도 권장.)

---

## 부록 A. 검증에 사용한 출처

- OKX positions-history 파라미터: 공식 `python-okx` SDK `okx/Account.py`(`get_positions_history`) — `begin`/`end` 없음 확인.
- OKX `after`/`before` 의미(uTime ms) 및 응답 필드(`direction`, `realizedPnl=pnl+fee+fundingFee`): [ccxt `okx` 구현](https://github.com/ccxt/ccxt) `fetchPositionsHistory` 주석·샘플 응답.
- Bybit closed-pnl 수수료 포함 여부: [Bybit Closed PnL 문서](https://bybit-exchange.github.io/docs/v5/position/close-pnl) 및 헬프센터 P&L 계산 안내.
- Binance income 7일 제한 부재(7일 제한은 userTrades): [Binance Get Income History](https://developers.binance.com/docs/derivatives/usds-margined-futures/account/rest-api/Get-Income-History), [Account Trade List](https://developers.binance.com/docs/derivatives/usds-margined-futures/trade/rest-api/Account-Trade-List).

> 외부 출처 내용은 라이선스 준수를 위해 요약·재구성했습니다(Content was rephrased for compliance with licensing restrictions). 코드/파라미터 사실은 레포 파일과 공식 SDK를 직접 대조한 결과입니다.

## 부록 B. 리뷰 범위 / 한계

- 정적 코드 리뷰 + 공식 문서/SDK 교차검증으로 수행했으며, **실제 거래소 키로의 라이브 호출과 거래소 웹 수치 대조는 미수행**입니다. H-1/H-2/M-1은 공식 SDK·ccxt로 확정된 사항이지만, OKX가 비정상 `after` 값을 "에러 반환"할지 "최신 100건 반복 반환"할지의 정확한 분기는 라이브 호출로만 최종 확정됩니다(어느 쪽이든 결과는 오류 — 중복 또는 기간 미적용).
- 빌드/타입체크는 별도 실행하지 않았습니다(기존 커밋 코드 기준 리뷰).
