import type { ExchangeMeta, ExchangeId } from "./types";

// 7개 거래소 메타데이터 — docs/pnl/exchange-pnl-comparison.md 의 비교 테이블 기반.
// credFields 는 거래소별 인증 방식 차이를 그대로 반영(passphrase 유무 등).

export const EXCHANGES: ExchangeMeta[] = [
  {
    id: "okx",
    name: "OKX",
    tier: "A",
    unit: "position",
    endpoint: "GET /api/v5/account/positions-history (instType=SWAP)",
    note: "포지션 1건=1 row, cTime/uTime, pnl/fee/fundingFee 분리. after cursor 페이지네이션, dedupe=posId.",
    credFields: [
      { key: "apiKey", label: "API Key", secret: true },
      { key: "apiSecret", label: "API Secret", secret: true },
      { key: "passphrase", label: "Passphrase", secret: true },
    ],
    supports: { daily: true, last30d: true, bySymbol: true, holdTime: true, positionWinLoss: "yes", winRate: "yes" },
    retentionMonths: 3,
    retentionLabel: "최근 약 3개월",
  },
  {
    id: "bingx",
    name: "BingX",
    tier: "A",
    unit: "position",
    endpoint: "GET /openApi/swap/v1/trade/positionHistory (심볼별 순회)",
    note: "positionHistory는 symbol 필수지만, income 원장에서 거래 심볼을 자동 추출해 순회합니다. realisedProfit/positionCommission/totalFunding 분해.",
    credFields: [
      { key: "apiKey", label: "API Key", secret: true },
      { key: "apiSecret", label: "API Secret", secret: true },
      {
        key: "symbols",
        label: "조회 심볼 (선택)",
        placeholder: "비워두면 income에서 자동 추출",
        hint: "비워두면 income 원장에서 거래한 심볼을 자동 추출합니다. 특정 심볼만 빠르게 보려면 콤마로 구분해 입력하세요(예: BTC-USDT,ETH-USDT).",
      },
    ],
    supports: { daily: true, last30d: true, bySymbol: true, holdTime: true, positionWinLoss: "yes", winRate: "yes" },
    retentionMonths: 3,
    retentionLabel: "최근 약 3개월",
  },
  {
    id: "bitget",
    name: "Bitget",
    tier: "A",
    unit: "position",
    endpoint: "GET /api/v2/mix/position/history-position (productType=USDT-FUTURES)",
    note: "productType만으로 전체 심볼 일괄. ctime/utime, pnl/openFee+closeFee/totalFunding 분해. idLessThan 커서.",
    credFields: [
      { key: "apiKey", label: "API Key", secret: true },
      { key: "apiSecret", label: "API Secret", secret: true },
      { key: "passphrase", label: "Passphrase", secret: true },
    ],
    supports: { daily: true, last30d: true, bySymbol: true, holdTime: true, positionWinLoss: "yes", winRate: "yes" },
    retentionMonths: 3,
    retentionLabel: "최근 3개월",
  },
  {
    id: "gate",
    name: "Gate",
    tier: "A",
    unit: "position",
    endpoint: "GET /api/v4/futures/usdt/position_close (settle=usdt)",
    note: "settle만으로 전체 심볼 일괄. pnl_pnl/pnl_fund/pnl_fee 분해, first_open_time/time. HMAC-SHA512.",
    credFields: [
      { key: "apiKey", label: "API Key", secret: true },
      { key: "apiSecret", label: "API Secret", secret: true },
    ],
    supports: { daily: true, last30d: true, bySymbol: true, holdTime: true, positionWinLoss: "yes", winRate: "yes" },
    retentionMonths: null,
    retentionLabel: "미확인 (실호출 확인 필요)",
  },
  {
    id: "bybit",
    name: "Bybit",
    tier: "A-",
    unit: "closing_order",
    endpoint: "GET /v5/position/closed-pnl + transaction-log(SETTLEMENT)",
    note: "청산오더 단위(포지션 아님) → hold time 불가, 승/패는 청산오더 근사. 펀딩은 transaction-log에서 별도 수집.",
    credFields: [
      { key: "apiKey", label: "API Key", secret: true },
      { key: "apiSecret", label: "API Secret", secret: true },
    ],
    supports: { daily: true, last30d: true, bySymbol: true, holdTime: false, positionWinLoss: "approx", winRate: "approx" },
    retentionMonths: 24,
    retentionLabel: "2년 (요청당 7일 윈도우)",
  },
  {
    id: "binance",
    name: "Binance (USDT-M)",
    tier: "B",
    unit: "income",
    endpoint: "GET /fapi/v1/income (REALIZED_PNL/COMMISSION/FUNDING_FEE)",
    note: "income 원장 합산. ①②③만 가능, hold time·포지션 승/패는 불가. 실제 발생일 귀속(일별 정확).",
    credFields: [
      { key: "apiKey", label: "API Key", secret: true },
      { key: "apiSecret", label: "API Secret", secret: true },
    ],
    supports: { daily: true, last30d: true, bySymbol: true, holdTime: false, positionWinLoss: "no", winRate: "no" },
    retentionMonths: 3,
    retentionLabel: "income 3개월 (REST)",
  },
  {
    id: "hyperliquid",
    name: "Hyperliquid",
    tier: "B",
    unit: "fill",
    endpoint: "POST /info (userFillsByTime closedPnl + userFunding)",
    note: "API key 없음 — 지갑 주소(0x..)만으로 공개 조회. fill 단위 closedPnl 합산. hold time 불가.",
    credFields: [
      {
        key: "walletAddress",
        label: "지갑 주소",
        placeholder: "0x...",
        hint: "Hyperliquid는 API key가 없습니다. 온체인 지갑 주소만 입력하면 공개 조회됩니다.",
      },
    ],
    supports: { daily: true, last30d: true, bySymbol: true, holdTime: false, positionWinLoss: "approx", winRate: "approx" },
    retentionMonths: null,
    retentionLabel: "최근 약 10,000 fill (시간 무관)",
  },
];

export const EXCHANGE_MAP: Record<ExchangeId, ExchangeMeta> = Object.fromEntries(
  EXCHANGES.map((e) => [e.id, e]),
) as Record<ExchangeId, ExchangeMeta>;

export function getExchange(id: ExchangeId): ExchangeMeta {
  return EXCHANGE_MAP[id];
}

/** 거래소별 고정 색상 (차트/배지) */
export const EXCHANGE_COLORS: Record<ExchangeId, string> = {
  okx: "#0ea5e9",
  bingx: "#3b82f6",
  bitget: "#06b6d4",
  gate: "#ef4444",
  bybit: "#f59e0b",
  binance: "#eab308",
  hyperliquid: "#22c55e",
};
