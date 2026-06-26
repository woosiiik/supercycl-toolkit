// 거래소 PNL 수집/검증 도구 — 공유 타입 (클라이언트/서버 공용, node 의존성 없음)
// 설계 근거: docs/pnl/exchange-pnl-comparison.md

export type ExchangeId =
  | "okx"
  | "bingx"
  | "bitget"
  | "gate"
  | "bybit"
  | "binance"
  | "hyperliquid";

/** 포지션 단위 데이터 제공 등급 */
export type SupportTier = "A" | "A-" | "B";

/** 자격증명 입력 필드 정의 */
export interface CredField {
  key: string; // credentials 객체의 키
  label: string;
  placeholder?: string;
  /** 콤마구분 등 추가 안내 */
  hint?: string;
  /** 민감 정보(마스킹) 여부 */
  secret?: boolean;
}

/** 거래소 메타데이터 */
export interface ExchangeMeta {
  id: ExchangeId;
  name: string;
  tier: SupportTier;
  /** 데이터 단위: 포지션 / 청산오더 / 원장(income) / 체결(fill) */
  unit: PositionUnit;
  /** 입력받을 자격증명 필드 */
  credFields: CredField[];
  /** 핵심 엔드포인트(표시용) */
  endpoint: string;
  /** 한 줄 수집 방식 설명 */
  note: string;
  /** 지원 지표 (UI 배지) */
  supports: {
    daily: boolean; // 일별
    last30d: boolean; // 30일
    bySymbol: boolean; // 심볼별
    holdTime: boolean; // hold time
    positionWinLoss: "yes" | "approx" | "no"; // 포지션 승/패 수
    winRate: "yes" | "approx" | "no"; // win/loss rate
  };
  /** 조회 가능한 보존기간(개월). null이면 시간 기준 한도 불명/해당없음 */
  retentionMonths: number | null;
  /** 보존 한도 표시 라벨 */
  retentionLabel: string;
}

export type PositionUnit = "position" | "closing_order" | "income" | "fill";

/**
 * 정규화된 PNL row.
 * 핵심: PnL을 net 단일값이 아니라 price/fee/funding 3컴포넌트로 분리 저장
 * → 수수료/펀딩 토글이 조회 단계의 단순 산술이 된다 (문서 §2.5).
 */
export interface NormalizedRow {
  exchange: ExchangeId;
  /** dedupe 키 (positionId / orderId / tranId / tid / 조합키) */
  id: string;
  symbol: string;
  side: "long" | "short" | null;
  /** 가격손익 */
  pricePnl: number;
  /** 수수료 (비용은 음수) */
  fee: number;
  /** 펀딩 (지급은 음수) */
  funding: number;
  /** net = pricePnl + fee + funding (거래소 제공값 우선, 없으면 합산) */
  netPnl: number;
  /** 포지션 오픈 시각 (ms). 미지원이면 null */
  openTime: number | null;
  /** 귀속 시각 = 종료/발생 시각 (ms) */
  closeTime: number;
  /** 보유 시간 (ms). 미지원이면 null */
  holdTimeMs: number | null;
  /** 승/패. 포지션 단위가 아니면 null */
  win: boolean | null;
  /** 데이터 단위 */
  unit: PositionUnit;
  /** 레버리지(배수). 제공하지 않는 거래소는 null/undefined (OKX·BingX·Bitget·Bybit만 제공) */
  leverage?: number | null;
}

/** 어댑터 → API 응답 */
export interface CollectResult {
  exchange: ExchangeId;
  /** 정규화된 row */
  rows: NormalizedRow[];
  /** 원본 API 응답 (페이지/호출 단위, 가공 없음) */
  rawPages: RawPage[];
  /** 수집 경고/주의 */
  warnings: string[];
  meta: {
    requestCount: number;
    endpoints: string[];
    startTime: number;
    endTime: number;
  };
}

export interface RawPage {
  label: string; // 예: "positions-history p1"
  url: string;
  status: number;
  /** 파싱된 JSON 응답 (또는 원문 텍스트) */
  body: unknown;
}

/** 수집 요청 파라미터 (클라이언트 → 서버) */
export interface CollectRequest {
  exchange: ExchangeId;
  credentials: Record<string, string>;
  startTime: number; // ms
  endTime: number; // ms
}

/** localStorage 저장 데이터(거래소별) */
export interface StoredData {
  exchange: ExchangeId;
  startTime: number;
  endTime: number;
  collectedAt: string; // ISO
  rows: NormalizedRow[];
  rawPages: RawPage[];
  warnings: string[];
  meta: CollectResult["meta"];
}
