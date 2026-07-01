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
  /** 포지션 재구성 방식 (체결→포지션 라운드트립) */
  reconstruct: {
    /** supported=구현됨 / planned=구현예정 / native=네이티브 포지션 히스토리 있어 재구성 불필요 */
    status: "supported" | "planned" | "native";
    /** 재구성에 쓰는(쓸) 엔드포인트·핵심 필드 */
    source: string;
    /** 방법 설명 */
    detail: string;
  };
}

export const TRADE_DOCS: Record<ExchangeId, TradeDoc> = {
  okx: {
    id: "okx",
    unitLabel: "체결(fills) + 펀딩",
    endpoint: "GET /api/v5/trade/fills-history + /api/v5/account/bills-archive(type=8)",
    fundingSource: { kind: "separate", label: "별도 원장 (bills-archive type=8)" },
    note: "체결 원장(fills-history)의 fillPnl·fee로 실현손익을, bills-archive type=8로 펀딩을 수집합니다. 운영 웹앱과 동일.",
    caveats: ["type=1(이체)는 PnL에서 제외", "fills-history 보존 약 3개월"],
    reconstruct: {
      status: "native",
      source: "positions-history (포지션 히스토리 기반 도구)",
      detail: "OKX는 네이티브 포지션 히스토리를 제공하므로 '포지션 히스토리 기반' 도구를 쓰면 됩니다. fills-history(fillSz·fillPnl)로도 재구성 가능하나 우선순위 낮음.",
    },
  },
  bingx: {
    id: "bingx",
    unitLabel: "원장(income)",
    endpoint: "GET /openApi/swap/v2/user/income",
    fundingSource: { kind: "inline", label: "원장 포함 (FUNDING_FEE)" },
    note: "income 원장에서 TRANSFER(이체)만 제외하고 나머지 전부를 net으로 합산합니다. 운영 웹앱과 동일.",
    caveats: ["30일 윈도우 분할", "심볼 순회 불필요 (원장은 전체 심볼 일괄)"],
    reconstruct: {
      status: "native",
      source: "positionHistory (포지션 히스토리 기반 도구)",
      detail: "BingX는 네이티브 포지션 히스토리를 제공합니다 → '포지션 히스토리 기반' 도구 사용. income 원장은 크기 정보가 없어 재구성 불가.",
    },
  },
  bitget: {
    id: "bitget",
    unitLabel: "원장(bill)",
    endpoint: "GET /api/v2/mix/account/bill (productType=USDT-FUTURES)",
    fundingSource: { kind: "inline", label: "원장 포함 (contract_settle_fee/settle_interest)" },
    note: "계정 원장을 businessType 세트로 거래/이체 분류하고 value=amount+fee로 합산합니다. 운영 웹앱과 동일한 분류 세트.",
    caveats: ["미분류 businessType은 경고 후 pnl로 귀속", "89일 윈도우 분할"],
    reconstruct: {
      status: "native",
      source: "history-position (포지션 히스토리 기반 도구)",
      detail: "Bitget은 네이티브 포지션 히스토리를 제공합니다 → '포지션 히스토리 기반' 도구 사용. account bill 원장은 크기 정보가 없어 재구성 불가(필요 시 order fills 활용).",
    },
  },
  gate: {
    id: "gate",
    unitLabel: "원장(account_book)",
    endpoint: "GET /api/v4/futures/usdt/account_book",
    fundingSource: { kind: "inline", label: "원장 포함 (type=fund)" },
    note: "선물 계정 원장에서 pnl/fee/fund/refr를 pnl로, dnw는 제외해 합산합니다. 운영 웹앱과 동일.",
    caveats: ["계정 단위 원장 — 일부 항목은 contract(심볼) 미포함 가능", "시간은 초(sec) 단위"],
    reconstruct: {
      status: "native",
      source: "position_close (포지션 히스토리 기반 도구)",
      detail: "Gate는 네이티브 포지션 히스토리를 제공합니다 → '포지션 히스토리 기반' 도구 사용. account_book은 크기 정보가 없어 재구성 불가(필요 시 my_trades 활용).",
    },
  },
  bybit: {
    id: "bybit",
    unitLabel: "원장(transaction-log)",
    endpoint: "GET /v5/account/transaction-log",
    fundingSource: { kind: "inline", label: "원장 포함 (type=SETTLEMENT)" },
    note: "계정 원장(transaction-log) 전체를 change로 합산합니다. TRANSFER만 제외, SETTLEMENT는 펀딩으로 분해. 운영 웹앱과 동일.",
    caveats: ["UNIFIED 계정 기준(Classic은 별도 엔드포인트)", "7일 윈도우 분할", "수수료는 change에 포함(별도 분리 안 함)"],
    reconstruct: {
      status: "supported",
      source: "execution/list(경계·보유시간) + closed-pnl(실현손익) 추가 호출",
      detail: "execution/list의 closedSize로 포지션 경계·오픈/청산 시각을 재구성하고, Bybit 자체 closedPnl(수수료 반영)을 시간구간으로 귀속합니다. 펀딩은 transaction-log SETTLEMENT. 추가 호출한 원본도 raw로 표시. UNIFIED·one-way 기준(헤지/orphan은 휴리스틱) — raw 교차확인 권장.",
    },
  },
  binance: {
    id: "binance",
    unitLabel: "원장(income)",
    endpoint: "GET /fapi/v1/income (REALIZED_PNL/COMMISSION/FUNDING_FEE)",
    fundingSource: { kind: "inline", label: "원장 포함 (FUNDING_FEE)" },
    note: "income 원장 합산. 운영 웹앱은 이 데이터로 PnL을 서버에서 계산하며, 데이터 소스는 동일합니다.",
    caveats: ["income REST 보존 약 3개월", "TRANSFER 등은 incomeType 필터로 제외"],
    reused: true,
    reconstruct: {
      status: "supported",
      source: "userTrades(realizedPnl·commission·positionSide) 추가 호출",
      detail: "(심볼,positionSide)별로 체결을 재생해 라운드트립을 묶고 체결별 realizedPnl·commission을 합산합니다. 헤지 모드는 positionSide(LONG/SHORT)로 분리. userTrades는 symbol 필수라 income에서 거래 심볼을 추출해 순회하며, 추가 호출한 원본도 raw로 표시. 검증 전 휴리스틱이니 raw 교차확인 권장.",
    },
  },
  hyperliquid: {
    id: "hyperliquid",
    unitLabel: "체결(fill) + 펀딩",
    endpoint: "POST /info (userFillsByTime + userFunding)",
    fundingSource: { kind: "separate", label: "별도 호출 (userFunding)" },
    note: "모든 체결의 (closedPnl − fee)를 합산 + 펀딩 별도 수집. 오픈 체결의 수수료도 포함(운영 웹앱과 동일).",
    caveats: ["최근 약 10,000 fill 한계로 장기 이력 누락 가능", "API key 없이 지갑 주소만"],
    reconstruct: {
      status: "supported",
      source: "userFillsByTime (startPosition·dir) + userFunding",
      detail: "체결을 코인별 시간순 재생해 '0→오픈→0 복귀'를 한 포지션으로 묶습니다(스케일인/부분청산/재진입 포함, 플립은 청산+신규 분리). 실현손익=Σ closedPnl, 수수료=Σ 체결수수료, 펀딩=열린 구간 시간매칭. startPosition으로 갭·orphan(범위 밖 오픈=보유시간 미상) 감지. → '포지션 재구성' 탭.",
    },
  },
};
