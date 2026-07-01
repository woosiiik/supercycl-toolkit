import type { ExchangeId } from "./types";

// 트레이드 히스토리(실현손익 원장) 기반 수집 방식 문서.
// 운영 웹앱(aggregator_web)의 PnL 수집 로직과 동일한 거래소 API/분류를 사용한다.
// 핵심 모델: "이체(dnw)를 제외한 잔액변동 원장을 net으로 합산". 포지션 종료 여부와 무관하게
// 거래/정산 발생 시점에 귀속 → 보유시간·포지션 승/패·승률은 알 수 없다(공통).

export interface TradeDoc {
  id: ExchangeId;
  /** 수집 단위 라벨 */
  unitLabel: string;
  /** 사용 엔드포인트 */
  endpoint: string;
  /** 펀딩(funding) 소스 */
  fundingSource: { kind: "inline" | "separate"; label: string };
  /** 한 줄 설명 */
  note: string;
  /** 주의사항 */
  caveats: string[];
  /** 이미 트레이드/원장 기반이라 포지션 도구와 동일 어댑터를 재사용하는지 */
  reused?: boolean;
}

export const TRADE_DOCS: Record<ExchangeId, TradeDoc> = {
  okx: {
    id: "okx",
    unitLabel: "체결(fills) + 펀딩",
    endpoint: "GET /api/v5/trade/fills-history + /api/v5/account/bills-archive(type=8)",
    fundingSource: { kind: "separate", label: "별도 원장 (bills-archive type=8)" },
    note: "체결 원장(fills-history)의 fillPnl·fee로 실현손익을, bills-archive type=8로 펀딩을 수집합니다. 운영 웹앱과 동일.",
    caveats: ["type=1(이체)는 PnL에서 제외", "fills-history 보존 약 3개월"],
  },
  bingx: {
    id: "bingx",
    unitLabel: "원장(income)",
    endpoint: "GET /openApi/swap/v2/user/income",
    fundingSource: { kind: "inline", label: "원장 포함 (FUNDING_FEE)" },
    note: "income 원장에서 TRANSFER(이체)만 제외하고 나머지 전부를 net으로 합산합니다. 운영 웹앱과 동일.",
    caveats: ["30일 윈도우 분할", "심볼 순회 불필요 (원장은 전체 심볼 일괄)"],
  },
  bitget: {
    id: "bitget",
    unitLabel: "원장(bill)",
    endpoint: "GET /api/v2/mix/account/bill (productType=USDT-FUTURES)",
    fundingSource: { kind: "inline", label: "원장 포함 (contract_settle_fee/settle_interest)" },
    note: "계정 원장을 businessType 세트로 거래/이체 분류하고 value=amount+fee로 합산합니다. 운영 웹앱과 동일한 분류 세트.",
    caveats: ["미분류 businessType은 경고 후 pnl로 귀속", "89일 윈도우 분할"],
  },
  gate: {
    id: "gate",
    unitLabel: "원장(account_book)",
    endpoint: "GET /api/v4/futures/usdt/account_book",
    fundingSource: { kind: "inline", label: "원장 포함 (type=fund)" },
    note: "선물 계정 원장에서 pnl/fee/fund/refr를 pnl로, dnw는 제외해 합산합니다. 운영 웹앱과 동일.",
    caveats: ["계정 단위 원장 — 일부 항목은 contract(심볼) 미포함 가능", "시간은 초(sec) 단위"],
  },
  bybit: {
    id: "bybit",
    unitLabel: "원장(transaction-log)",
    endpoint: "GET /v5/account/transaction-log",
    fundingSource: { kind: "inline", label: "원장 포함 (type=SETTLEMENT)" },
    note: "계정 원장(transaction-log) 전체를 change로 합산합니다. TRANSFER만 제외, SETTLEMENT는 펀딩으로 분해. 운영 웹앱과 동일.",
    caveats: ["UNIFIED 계정 기준(Classic은 별도 엔드포인트)", "7일 윈도우 분할", "수수료는 change에 포함(별도 분리 안 함)"],
  },
  binance: {
    id: "binance",
    unitLabel: "원장(income)",
    endpoint: "GET /fapi/v1/income (REALIZED_PNL/COMMISSION/FUNDING_FEE)",
    fundingSource: { kind: "inline", label: "원장 포함 (FUNDING_FEE)" },
    note: "income 원장 합산. 운영 웹앱은 이 데이터로 PnL을 서버에서 계산하며, 데이터 소스는 동일합니다.",
    caveats: ["income REST 보존 약 3개월", "TRANSFER 등은 incomeType 필터로 제외"],
    reused: true,
  },
  hyperliquid: {
    id: "hyperliquid",
    unitLabel: "체결(fill) + 펀딩",
    endpoint: "POST /info (userFillsByTime + userFunding)",
    fundingSource: { kind: "separate", label: "별도 호출 (userFunding)" },
    note: "모든 체결의 (closedPnl − fee)를 합산 + 펀딩 별도 수집. 오픈 체결의 수수료도 포함(운영 웹앱과 동일).",
    caveats: ["최근 약 10,000 fill 한계로 장기 이력 누락 가능", "API key 없이 지갑 주소만"],
  },
};
