import type { ExchangeId } from "./types";

// 거래소별 수집 방식 문서 — docs/pnl/exchange-pnl-comparison.md + 실제 어댑터 구현 기준.
// "수집 방식" 탭에서 렌더링. 흐름 다이어그램은 ASCII.

export interface FieldMap {
  raw: string; // 원본 필드
  norm: string; // 정규화 매핑
}

export interface ExchangeDoc {
  id: ExchangeId;
  classification: string;
  auth: string;
  /** 수집 흐름 단계 */
  flow: string[];
  /** ASCII 흐름 다이어그램 */
  diagram: string;
  /** 가져오는 주요 필드 → 정규화 매핑 */
  fields: FieldMap[];
  pnlDef: string;
  /** 펀딩(funding) 수집 소스 — 포지션/원장 row에 포함인지, 별도 호출/원장인지 */
  fundingSource: { kind: "inline" | "separate"; label: string };
  /** ✅ 알 수 있는 것 */
  knowable: string[];
  /** ❌ 모르는 것 (+ 이유) */
  unknowable: string[];
  retention: string;
  rateLimit: string;
  caveats: string[];
}

export const EXCHANGE_DOCS: Record<ExchangeId, ExchangeDoc> = {
  okx: {
    id: "okx",
    classification: "[A] 포지션 히스토리 — 닫힌 포지션 1건 = 1 row (오픈·종료시각 포함)",
    auth: "API Key + Secret + Passphrase / HMAC-SHA256(base64), 헤더 OK-ACCESS-KEY/SIGN/TIMESTAMP/PASSPHRASE",
    flow: [
      "positions-history (instType=SWAP, begin/end ms, limit=100) 호출",
      "응답 마지막 posId 를 after 커서로 다음 페이지 요청",
      "100건 미만이 올 때까지 반복 (최대 30페이지)",
    ],
    diagram: `┌──────────────────────────────┐
│ positions-history?after=…    │◀─┐
│   instType=SWAP, limit=100   │  │ after = 마지막 posId
└──────────────┬───────────────┘  │
               └───(100건이면)─────┘
               │ (100건 미만)
               ▼
        정규화 row (1포지션=1row)`,
    fields: [
      { raw: "instId", norm: "symbol" },
      { raw: "posSide (long/short)", norm: "side" },
      { raw: "pnl", norm: "가격손익(pricePnl)" },
      { raw: "fee", norm: "수수료(fee)" },
      { raw: "fundingFee", norm: "펀딩(funding)" },
      { raw: "realizedPnl", norm: "net (= pnl+fee+fundingFee)" },
      { raw: "cTime / uTime", norm: "openTime / closeTime → holdTime" },
    ],
    pnlDef: "net = realizedPnl, 컴포넌트(pnl·fee·fundingFee) 모두 분리 제공 → 종료일 귀속",
    fundingSource: { kind: "inline", label: "포지션 row 포함 (fundingFee)" },
    knowable: ["일별 PnL", "30일 합계·평균", "심볼별 PnL", "보유시간(전체·승·패)", "포지션 종료/승/패 수", "win/loss rate"],
    unknowable: ["보존기간(~3개월) 이전 포지션은 조회 불가 → 주기 증분 수집 전제"],
    retention: "약 3개월",
    rateLimit: "OKX 표준 한도 (positions-history 별도 가중치)",
    caveats: ["timestamp는 ISO8601 형식", "after 커서는 posId 기준(시간 아님)"],
  },

  bingx: {
    id: "bingx",
    classification: "[A] 포지션 히스토리 (심볼 순회 필요)",
    auth: "API Key + Secret / HMAC-SHA256, 헤더 X-BX-APIKEY, signature는 쿼리스트링에 append",
    flow: [
      "심볼 미입력 시: income 원장(/swap/v2/user/income, symbol 선택)을 먼저 호출",
      "income 응답에서 거래에 등장한 distinct 심볼을 추출",
      "추출된 심볼 개수만큼 positionHistory를 반복 호출 (심볼 × 89일 윈도우)",
      "심볼을 직접 입력하면 1~2단계(income 추출)를 건너뜀",
    ],
    diagram: `① 심볼 미입력
┌─────────────────────┐
│ income 원장 호출      │ (symbol 파라미터 선택)
└──────────┬──────────┘
           ▼
   distinct symbols
   [BTC-USDT, ETH-USDT, SOL-USDT, …]   ← N개
           │
           ▼  심볼마다 반복 (N회)
┌─────────────────────────────┐
│ positionHistory?symbol=…    │ × N
│   (89일 윈도우 분할)          │
└──────────┬──────────────────┘
           ▼
       정규화 row

② 심볼 직접 입력 시 → income 단계 생략, 바로 positionHistory × 입력심볼수`,
    fields: [
      { raw: "symbol", norm: "symbol" },
      { raw: "positionSide (LONG/SHORT)", norm: "side" },
      { raw: "realisedProfit", norm: "가격손익(pricePnl)" },
      { raw: "positionCommission", norm: "수수료(fee)" },
      { raw: "totalFunding", norm: "펀딩(funding)" },
      { raw: "netProfit", norm: "net" },
      { raw: "openTime / updateTime", norm: "openTime / closeTime → holdTime" },
    ],
    pnlDef: "net = netProfit = realisedProfit + positionCommission + totalFunding (분해 제공) → 종료일 귀속",
    fundingSource: { kind: "inline", label: "포지션 row 포함 (totalFunding)" },
    knowable: ["일별 PnL", "30일 합계·평균", "심볼별 PnL", "보유시간(전체·승·패)", "포지션 종료/승/패 수", "win/loss rate"],
    unknowable: [
      "심볼 파라미터가 필수라 '거래한 심볼 목록'을 먼저 알아야 함 → income으로 자동 추출",
      "income에 흔적이 없는 심볼은 자동추출에서 누락될 수 있음 (직접 입력으로 보완)",
    ],
    retention: "약 3개월 (요청 span 최대 3개월)",
    rateLimit: "2025-10-16자 개정 — account/trade 한도 재확인 권장",
    caveats: ["positionHistory는 symbol 필수", "부분청산 다회 시 positionId row 생성 방식 확인 필요"],
  },

  bitget: {
    id: "bitget",
    classification: "[A] 포지션 히스토리 — productType만으로 전체 심볼 일괄",
    auth: "API Key + Secret + Passphrase / HMAC-SHA256(base64), 헤더 ACCESS-KEY/SIGN/TIMESTAMP/PASSPHRASE",
    flow: [
      "기간을 89일 윈도우로 분할 (요청당 90일 초과 불가)",
      "각 윈도우에서 history-position(productType=USDT-FUTURES, limit=100) 호출",
      "응답 endId 를 idLessThan 커서로 다음 페이지 요청",
    ],
    diagram: `기간 → 89일 윈도우로 분할
┌── window 1 ──┐ ┌── window 2 ──┐ …
│ history-pos  │ │ history-pos  │
│ idLessThan ◀─┼─┐             │
└──────────────┘ │ endId       │
       └─────────┘ (커서)
           ▼
   전체 심볼 포지션 row 일괄`,
    fields: [
      { raw: "symbol", norm: "symbol" },
      { raw: "holdSide (long/short)", norm: "side" },
      { raw: "pnl", norm: "가격손익(pricePnl)" },
      { raw: "openFee + closeFee", norm: "수수료(fee)" },
      { raw: "totalFunding", norm: "펀딩(funding)" },
      { raw: "netProfit", norm: "net" },
      { raw: "ctime / utime", norm: "openTime / closeTime → holdTime" },
    ],
    pnlDef: "net = netProfit, 컴포넌트(pnl·openFee/closeFee·totalFunding) 분리 → 종료일 귀속",
    fundingSource: { kind: "inline", label: "포지션 row 포함 (totalFunding)" },
    knowable: ["일별 PnL", "30일 합계·평균", "심볼별 PnL", "보유시간(전체·승·패)", "포지션 종료/승/패 수", "win/loss rate"],
    unknowable: ["보존기간(3개월) 이전은 조회 불가"],
    retention: "3개월 (요청 span 최대 90일)",
    rateLimit: "20 req/s per UID",
    caveats: ["startTime~endTime 간격 90일 초과 시 오류 → 윈도우 분할 필수", "utime=종료시각/netProfit 계산식 실데이터 검증 권장"],
  },

  gate: {
    id: "gate",
    classification: "[A] 포지션 히스토리 — settle만으로 전체 심볼 일괄",
    auth: "API Key + Secret / HMAC-SHA512, 헤더 KEY/SIGN/Timestamp (payload에 SHA512(body) 포함)",
    flow: [
      "position_close(settle=usdt, from/to 초단위, limit=100) 호출",
      "offset 을 100씩 늘려 다음 페이지 요청",
      "100건 미만이 올 때까지 반복",
    ],
    diagram: `┌────────────────────────────────┐
│ futures/usdt/position_close     │◀─┐
│   from/to(sec), limit=100,      │  │ offset += 100
│   offset=0,100,200,…            │  │
└──────────────┬─────────────────┘  │
               └───(100건이면)───────┘
               ▼
        정규화 row (1포지션=1row)`,
    fields: [
      { raw: "contract", norm: "symbol" },
      { raw: "side (long/short)", norm: "side" },
      { raw: "pnl_pnl", norm: "가격손익(pricePnl)" },
      { raw: "pnl_fee", norm: "수수료(fee)" },
      { raw: "pnl_fund", norm: "펀딩(funding)" },
      { raw: "first_open_time / time", norm: "openTime / closeTime → holdTime" },
    ],
    pnlDef: "net = pnl = pnl_pnl + pnl_fund + pnl_fee (가격손익/펀딩/수수료 분해) → 종료일 귀속",
    fundingSource: { kind: "inline", label: "포지션 row 포함 (pnl_fund)" },
    knowable: ["일별 PnL", "30일 합계·평균", "심볼별 PnL", "보유시간(전체·승·패)", "포지션 종료/승/패 수", "win/loss rate"],
    unknowable: ["보존기간 약 180일(6개월) — from이 180일 초과 시 INVALID_PARAM_VALUE (실호출 확인됨)"],
    retention: "최근 180일 (약 6개월). from 180일 초과 시 오류",
    rateLimit: "수치 확인 필요",
    caveats: ["단일 PK 미제공 → (contract,side,first_open_time,time) 조합키로 dedupe", "시간은 초(sec) 단위"],
  },

  bybit: {
    id: "bybit",
    classification: "[A-] 청산오더 단위 손익 — 포지션이 아니라 '포지션을 닫은 주문' 1건이 1 row",
    auth: "API Key + Secret / HMAC-SHA256, 헤더 X-BAPI-API-KEY/TIMESTAMP/RECV-WINDOW/SIGN",
    flow: [
      "기간을 7일 윈도우로 분할 (단일요청 7일 제한)",
      "① 각 윈도우에서 closed-pnl(category=linear, limit=100) 호출 → 청산손익·수수료",
      "② 각 윈도우에서 transaction-log(type=SETTLEMENT, limit=50) 호출 → 펀딩 (별도 원장)",
      "각각 nextPageCursor 로 페이지네이션",
    ],
    diagram: `기간 → 7일 윈도우로 분할, 각 윈도우마다 2개 소스
┌─ 7d ──────────────────────┐
│ ① closed-pnl              │ → 청산손익(net) + 수수료
│    (cursor 페이지)         │
│ ② transaction-log         │ → 펀딩(SETTLEMENT)
│    type=SETTLEMENT         │    실제 발생일 귀속
└──────────┬────────────────┘
           ▼  합산
   청산오더 row + 펀딩 row`,
    fields: [
      { raw: "symbol", norm: "symbol" },
      { raw: "closedPnl", norm: "net (수수료 포함 여부 검증 필요)" },
      { raw: "openFee + closeFee", norm: "수수료(fee)" },
      { raw: "updatedTime", norm: "closeTime (귀속시각)" },
      { raw: "orderId", norm: "dedupe 키" },
      { raw: "createdTime (청산주문 시각)", norm: "⚠ 포지션 오픈시각 아님" },
      { raw: "txlog.funding (SETTLEMENT)", norm: "펀딩(funding) — 별도 호출, 실제 발생일" },
    ],
    pnlDef: "청산손익=closed-pnl(net·수수료), 펀딩=transaction-log SETTLEMENT(실제 발생일 귀속). 둘을 합쳐 net 산출",
    fundingSource: { kind: "separate", label: "별도 원장 (transaction-log SETTLEMENT)" },
    knowable: ["일별 PnL", "30일 합계·평균", "심볼별 PnL", "펀딩(별도 원장 수집)"],
    unknowable: [
      "보유시간(hold time) — 포지션 오픈시각이 없음(청산주문 시각만 존재)",
      "포지션 단위 승/패 수·승률 — 부분청산 시 1포지션이 여러 row → '청산오더 단위' 근사만 가능",
    ],
    retention: "closed-pnl·transaction-log 2년, 단일요청 7일 윈도우",
    rateLimit: "closed-pnl 50/s per UID, IP 600/5s",
    caveats: ["createdTime/updatedTime은 청산주문 시각 — 오픈시각 아님", "부분청산 시 카운트는 포지션이 아닌 청산오더 기준"],
  },

  binance: {
    id: "binance",
    classification: "[B] income 방식 — 실현손익 원장 합산 (공개 REST는 닫힌 포지션 히스토리 미노출)",
    auth: "API Key + Secret / HMAC-SHA256, 헤더 X-MBX-APIKEY, signature는 쿼리에 append",
    flow: [
      "income(startTime/endTime, limit=1000) 호출 — 모든 incomeType 수집",
      "REALIZED_PNL / COMMISSION / FUNDING_FEE 만 컴포넌트 row로 정규화 (TRANSFER 등 제외)",
      "마지막 time+1ms 를 다음 startTime 으로 시간 페이지네이션",
    ],
    diagram: `┌───────────────────────────────┐
│ income?startTime=…&limit=1000 │◀─┐
└──────────────┬────────────────┘  │ startTime = 마지막 time+1ms
               └───(1000건이면)─────┘
               ▼
   incomeType 필터
   ├ REALIZED_PNL → 가격손익 row
   ├ COMMISSION   → 수수료 row
   └ FUNDING_FEE  → 펀딩 row
   (income 1건 = 컴포넌트 1개 = row 1개)`,
    fields: [
      { raw: "symbol", norm: "symbol" },
      { raw: "incomeType=REALIZED_PNL", norm: "가격손익(pricePnl)" },
      { raw: "incomeType=COMMISSION", norm: "수수료(fee)" },
      { raw: "incomeType=FUNDING_FEE", norm: "펀딩(funding)" },
      { raw: "time", norm: "closeTime (실제 발생일)" },
      { raw: "tranId", norm: "dedupe 키" },
    ],
    pnlDef: "각 컴포넌트를 실제 발생일에 귀속 → 일별 분해가 정확. net = 컴포넌트 합",
    fundingSource: { kind: "inline", label: "income 원장 포함 (FUNDING_FEE)" },
    knowable: ["일별 PnL (실제 발생일 귀속, 정확)", "30일 합계·평균", "심볼별 PnL"],
    unknowable: [
      "보유시간 — 포지션 경계 정보 없음",
      "포지션 종료/승/패 수·승률 — 포지션 경계 없음 (userTrades 역산은 정책상 제외)",
    ],
    retention: "userTrades 6개월 / income 3개월 (REST)",
    rateLimit: "weight 기반 (income weight 30)",
    caveats: ["income에 TRANSFER 등 입출금/이체가 섞임 → 반드시 incomeType 필터", "REST는 포지션 히스토리를 노출하지 않음(웹/앱 내부 집계만 존재)"],
  },

  hyperliquid: {
    id: "hyperliquid",
    classification: "[B] income 방식 (fills closedPnl) — API key 없음, 지갑 주소로 공개 조회",
    auth: "인증 없음 — 온체인 지갑 주소(0x..)만 필요. info(읽기) 엔드포인트는 공개",
    flow: [
      "userFillsByTime(user, startTime, endTime) 호출 — 체결(fill) 단위",
      "응답 2000건이면 마지막 time+1ms 로 다음 페이지 (전체 최근 10,000 fill 한계)",
      "별도로 userFunding 호출 — 펀딩 원장 (펀딩 토글용)",
      "closedPnl≠0 또는 dir에 'Close' 포함된 fill만 정규화",
    ],
    diagram: `POST /info  (지갑 주소만, key 불필요)
┌─────────────────────────┐   ┌──────────────────┐
│ userFillsByTime         │   │ userFunding      │
│  (2000건/응답, ~10k 한계)│   │  (펀딩 원장)      │
└───────────┬─────────────┘   └────────┬─────────┘
            ▼                          ▼
   closedPnl 있는 fill          펀딩 row (별도 소스)
            └──────────┬───────────────┘
                       ▼  합산
                  정규화 row (fill 단위)`,
    fields: [
      { raw: "coin", norm: "symbol" },
      { raw: "closedPnl", norm: "가격손익(pricePnl)" },
      { raw: "fee", norm: "수수료(fee) — net = closedPnl − fee" },
      { raw: "dir (Close Long/Short)", norm: "side" },
      { raw: "time", norm: "closeTime" },
      { raw: "userFunding.delta.usdc", norm: "펀딩(funding) — 별도 호출" },
      { raw: "tid", norm: "dedupe 키" },
    ],
    pnlDef: "net = closedPnl − fee. 펀딩은 userFunding에서 별도 수집(실제 발생일 귀속)",
    fundingSource: { kind: "separate", label: "별도 호출 (userFunding)" },
    knowable: ["일별 PnL", "30일 합계·평균", "심볼별 PnL"],
    unknowable: [
      "보유시간 — 오픈~종료 시각 없음",
      "포지션 단위 승/패 — fill 단위 승률만 근사 가능(포지션 단위는 역산 필요 → 제외)",
    ],
    retention: "userFills 최근 2000 / userFillsByTime 전체 최근 10,000 fill — 활발한 트레이더는 장기 이력 손실 가능",
    rateLimit: "IP weight 1200/분, userFills weight 20, 주소별 누적거래량 기반 한계",
    caveats: ["API key 없음 — 수집 단위는 지갑 주소", "spot/perp는 coin 형식으로 구분", "펀딩은 fills와 별도 파이프라인"],
  },
};
