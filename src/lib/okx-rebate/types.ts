/** OKX CSV 한 행 */
export interface OkxRebateRow {
  brokerCode: string;
  level: string;
  instId: string;
  orderId: string;
  spotTradeAmt: number;
  derivativeTradeAmt: number;
  fee: number; // 음수 (OKX 원본)
  brokerRebate: number;
  netFee: number;
  settlementFee: number;
  subBrokerRebate: number;
  userRebate: number;
  affiliated: boolean;
  ts: number; // Unix ms
}

/** DB trade 레코드 (t_trade_history 행) */
export interface TradeRecord {
  orderId: string;
  tradeId: string;
  address: string | null;
  exchangeUid: string | null;
  symbol: string;
  direction: string;
  price: string;
  quantity: string;
  fee: string;
  tradedAt: string | null;
}

/** 상세 내역 행 — trade 단위 (DB) + order 단위 rebate (CSV) */
export interface TradeDetail {
  // DB (trade 레벨)
  orderId: string;
  tradeId: string;
  symbol: string;
  direction: string;
  price: number;
  quantity: number;
  tradedAt: string | null;
  // CSV (order 레벨)
  instId: string;
  brokerRebate: number;
  derivativeTradeAmt: number;
  csvFee: number; // OKX CSV fee (음수 원본)
  ts: number;
}

/** 주소별 집계 결과 */
export interface AddressRebateSummary {
  address: string;
  totalRebate: number;
  totalFee: number; // CSV fee 부호 반전 양수
  totalVolume: number; // price × quantity 합산
  tradeCount: number; // trade 건수 (DB 기준)
  orderCount: number; // order 건수 (CSV 기준)
  details: TradeDetail[];
}

/** 미매핑 주문 */
export interface UnmatchedOrder {
  orderId: string;
  instId: string;
  fee: number;
  brokerRebate: number;
  derivativeTradeAmt: number;
  ts: number;
}

/** 전체 주문 (원본 CSV + 매핑 여부) */
export interface AllOrderRow {
  orderId: string;
  instId: string;
  level: string;
  fee: number;
  netFee: number;
  brokerRebate: number;
  subBrokerRebate: number;
  userRebate: number;
  affiliated: boolean;
  derivativeTradeAmt: number;
  ts: number;
  mapped: boolean;
  address: string | null;
}

/** 전체 요약 */
export interface RebateSummary {
  totalRebate: number;
  totalFee: number;
  totalVolume: number;
  totalTradeCount: number;
  totalOrderCount: number;
  addressCount: number;
  unmatchedCount: number;
  unmatchedRebate: number;
}

/** 진행 단계 상태 */
export type StepState = "pending" | "running" | "done" | "error";

export interface StepStatus {
  label: string;
  state: StepState;
  detail?: string;
}

/** localStorage 캐시 항목 */
export interface CachedRange {
  key: string;
  beginDate: string;
  endDate: string;
  cachedAt: string;
  rowCount: number;
}

/** localStorage 캐시 데이터 */
export interface CachedCsvData {
  meta: CachedRange;
  rows: OkxRebateRow[];
}
