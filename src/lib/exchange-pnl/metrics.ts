import type { NormalizedRow, ExchangeId } from "./types";
import { EXCHANGES } from "./exchanges";

// 정규화 row → 지표 계산. 수수료/펀딩 토글은 net을 재계산하는 단순 산술.

// 거래소 표준 표시 순서 (툴팁 내역을 거래소별로 묶기 위함)
const EX_ORDER: Record<string, number> = Object.fromEntries(EXCHANGES.map((e, i) => [e.id, i]));

export interface PnlToggles {
  includeFee: boolean;
  includeFunding: boolean;
}

/** 토글 적용 net = pricePnl + (fee?) + (funding?) */
export function effectiveNet(row: NormalizedRow, t: PnlToggles): number {
  return row.pricePnl + (t.includeFee ? row.fee : 0) + (t.includeFunding ? row.funding : 0);
}

/** 일별 차트 hover 시 보여줄 내역 한 줄 (거래소·심볼 단위로 묶음) */
export interface DailyEntry {
  exchange: ExchangeId;
  symbol: string;
  side: "long" | "short" | null;
  leverage: number | null;
  pricePnl: number; // 가격손익(closed PnL)
  fee: number; // 수수료
  funding: number; // 펀딩
  net: number; // 토글 반영 net
  count: number;
  minClose: number; // 그룹 내 최초 종료시각(ms)
  maxClose: number; // 그룹 내 최종 종료시각(ms)
}

export interface DailyPoint {
  date: string; // YYYY-MM-DD (UTC)
  pricePnl: number;
  fee: number;
  funding: number;
  net: number;
  /** 그 날짜 내역 (거래소+심볼 그룹, |net| 내림차순) */
  entries: DailyEntry[];
}

export interface SymbolPoint {
  symbol: string;
  pricePnl: number;
  fee: number;
  funding: number;
  net: number;
  count: number; // 전체 레코드 수 (거래 + 수수료/펀딩 원장)
  tradeCount: number; // 거래 레코드 수 (순수 수수료·펀딩 원장 제외)
  /** 이 심볼 행에 기여한 거래소들 (합산 보기에서 표기용) */
  exchanges: ExchangeId[];
}

/** 순수 수수료/펀딩 원장 행이 아니라 실제 거래(포지션/청산/fill/실현손익)인지 */
function isTradeRow(r: NormalizedRow): boolean {
  // income 단위인데 가격손익이 0이면 = 순수 수수료 또는 펀딩 원장 → 거래 아님
  return !(r.unit === "income" && r.pricePnl === 0);
}

export interface HoldTimeStats {
  /** 평균 보유시간(ms) */
  overallAvg: number;
  winAvg: number;
  lossAvg: number;
  /** holdTime 이 있는 row 수 */
  sampleCount: number;
}

export interface Metrics {
  rowCount: number;
  /** 포지션/청산오더/fill 단위 카운트 (income 제외) */
  closedCount: number;
  totalNet: number;
  totalPrice: number;
  totalFee: number;
  totalFunding: number;
  avgNet: number; // closedCount 기준 평균
  profit: number; // net > 0 합
  loss: number; // net < 0 합
  // 근사 포함(포지션 + 청산오더 + fill 단위 전부)
  winCount: number | null;
  lossCount: number | null;
  winRate: number | null; // 0~1
  // 정식(포지션 단위 = unit "position": OKX·BingX·Bitget·Gate)만
  winCountStrict: number | null;
  lossCountStrict: number | null;
  winRateStrict: number | null; // 0~1
  daily: DailyPoint[];
  bySymbol: SymbolPoint[];
  holdTime: HoldTimeStats | null;
  /** 데이터 단위들 (혼합 시 표시) */
  units: string[];
  /** 포지션 승/패 지원 여부 (win 필드가 채워진 row가 있는지) */
  positionGranular: boolean;
}

function dateKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

const DAY = 86400000;
const MAX_FILL_DAYS = 800; // 폭주 방지(비정상적으로 큰 범위면 채우지 않음)

function utcMidnight(ms: number): number {
  return Date.parse(new Date(ms).toISOString().slice(0, 10) + "T00:00:00Z");
}

/**
 * 거래 없는 날짜를 0으로 채워 연속된 날짜축을 만든다 (UTC).
 * range(조회기간 ms)가 주어지면 그 기간 전체를 덮도록 양끝까지 채운다(거래 없는 날 포함).
 * 없으면 첫 거래일~마지막 거래일 사이만 채운다.
 */
function fillDateGaps(daily: DailyPoint[], range?: { start: number; end: number }): DailyPoint[] {
  const byDate = new Map(daily.map((d) => [d.date, d]));
  let startMs = daily.length ? Date.parse(daily[0].date + "T00:00:00Z") : Number.POSITIVE_INFINITY;
  let endMs = daily.length ? Date.parse(daily[daily.length - 1].date + "T00:00:00Z") : Number.NEGATIVE_INFINITY;
  if (range) {
    startMs = Math.min(startMs, utcMidnight(range.start));
    endMs = Math.max(endMs, utcMidnight(range.end));
  }
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs > endMs) return daily;
  if ((endMs - startMs) / DAY > MAX_FILL_DAYS) return daily; // 안전장치
  const out: DailyPoint[] = [];
  for (let t = startMs; t <= endMs; t += DAY) {
    const date = new Date(t).toISOString().slice(0, 10);
    out.push(byDate.get(date) ?? { date, pricePnl: 0, fee: 0, funding: 0, net: 0, entries: [] });
  }
  return out;
}

/** (exchange, id) 기준 중복 제거 — 페이지 경계·커서 오용으로 인한 중복 방어 */
export function dedupeRows(rows: NormalizedRow[]): NormalizedRow[] {
  const seen = new Set<string>();
  const out: NormalizedRow[] = [];
  for (const r of rows) {
    const key = `${r.exchange}:${r.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

export function computeMetrics(rows: NormalizedRow[], t: PnlToggles, range?: { start: number; end: number }): Metrics {
  rows = dedupeRows(rows);
  let totalNet = 0;
  let totalPrice = 0;
  let totalFee = 0;
  let totalFunding = 0;
  let profit = 0;
  let loss = 0;

  const dailyMap = new Map<string, DailyPoint>();
  const dailyEntries = new Map<string, Map<string, DailyEntry>>(); // date → (exchange:symbol → entry)
  const symbolMap = new Map<string, SymbolPoint>();
  const symbolExchanges = new Map<string, Set<ExchangeId>>();
  const units = new Set<string>();

  // 포지션 승/패: win 필드가 채워진(=포지션/청산오더/fill 단위) row만 카운트
  let winCount = 0;
  let lossCount = 0;
  let hasWinField = false;
  // 정식(포지션 단위)만 별도 카운트
  let winCountStrict = 0;
  let lossCountStrict = 0;

  // hold time
  let htOverallSum = 0;
  let htWinSum = 0;
  let htLossSum = 0;
  let htCount = 0;
  let htWinCount = 0;
  let htLossCount = 0;

  let closedCount = 0;

  for (const r of rows) {
    units.add(r.unit);
    const net = effectiveNet(r, t);
    totalNet += net;
    totalPrice += r.pricePnl;
    totalFee += r.fee;
    totalFunding += r.funding;
    if (net > 0) profit += net;
    else if (net < 0) loss += net;

    // 일별
    const dk = dateKey(r.closeTime);
    const dp = dailyMap.get(dk) ?? { date: dk, pricePnl: 0, fee: 0, funding: 0, net: 0, entries: [] };
    dp.pricePnl += r.pricePnl;
    dp.fee += r.fee;
    dp.funding += r.funding;
    dp.net += net;
    dailyMap.set(dk, dp);
    // 일별 내역(거래소+심볼 그룹)
    const em = dailyEntries.get(dk) ?? new Map<string, DailyEntry>();
    const lev = r.leverage ?? null;
    // 거래소+심볼+방향+레버리지가 같은 건끼리 묶음 (방향/레버리지가 한 줄에 일관)
    const ekey = `${r.exchange}:${r.symbol}:${r.side ?? ""}:${lev ?? ""}`;
    const entry = em.get(ekey) ?? {
      exchange: r.exchange,
      symbol: r.symbol,
      side: r.side,
      leverage: lev,
      pricePnl: 0,
      fee: 0,
      funding: 0,
      net: 0,
      count: 0,
      minClose: Number.POSITIVE_INFINITY,
      maxClose: 0,
    };
    entry.pricePnl += r.pricePnl;
    entry.fee += r.fee;
    entry.funding += r.funding;
    entry.net += net;
    entry.count += 1;
    // 종료시각은 실제 청산(closed-pnl: position/closing_order/fill) 행에만 의미가 있다.
    // income/funding 행(정산 시각이 00:00/08:00/16:00 등)은 제외 → 툴팁에 시간 미표시.
    if (r.unit !== "income" && r.closeTime > 0) {
      entry.minClose = Math.min(entry.minClose, r.closeTime);
      entry.maxClose = Math.max(entry.maxClose, r.closeTime);
    }
    em.set(ekey, entry);
    dailyEntries.set(dk, em);

    // 심볼별
    const sp = symbolMap.get(r.symbol) ?? { symbol: r.symbol, pricePnl: 0, fee: 0, funding: 0, net: 0, count: 0, tradeCount: 0, exchanges: [] };
    sp.pricePnl += r.pricePnl;
    sp.fee += r.fee;
    sp.funding += r.funding;
    sp.net += net;
    sp.count += 1;
    if (isTradeRow(r)) sp.tradeCount += 1;
    symbolMap.set(r.symbol, sp);
    const exSet = symbolExchanges.get(r.symbol) ?? new Set<ExchangeId>();
    exSet.add(r.exchange);
    symbolExchanges.set(r.symbol, exSet);

    if (r.unit !== "income") closedCount += 1;

    if (r.win !== null) {
      hasWinField = true;
      if (r.win) winCount += 1;
      else lossCount += 1;
      // 정식: 포지션 단위 row만
      if (r.unit === "position") {
        if (r.win) winCountStrict += 1;
        else lossCountStrict += 1;
      }
    }

    if (r.holdTimeMs !== null && r.holdTimeMs > 0) {
      htOverallSum += r.holdTimeMs;
      htCount += 1;
      if (r.win) {
        htWinSum += r.holdTimeMs;
        htWinCount += 1;
      } else {
        htLossSum += r.holdTimeMs;
        htLossCount += 1;
      }
    }
  }

  const sortedDaily = [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date));
  for (const dp of sortedDaily) {
    const em = dailyEntries.get(dp.date);
    // 거래소별로 묶고(표준 순서), 같은 거래소 안에서는 |net| 큰 순
    dp.entries = em
      ? [...em.values()].sort((a, b) => {
          const ea = EX_ORDER[a.exchange] ?? 99;
          const eb = EX_ORDER[b.exchange] ?? 99;
          if (ea !== eb) return ea - eb;
          return Math.abs(b.net) - Math.abs(a.net);
        })
      : [];
  }
  // 거래 없는 날짜도 0으로 채워 연속 표시 (range가 있으면 조회기간 전체를 덮음)
  const daily = fillDateGaps(sortedDaily, range);
  for (const sp of symbolMap.values()) {
    sp.exchanges = [...(symbolExchanges.get(sp.symbol) ?? [])];
  }
  const bySymbol = [...symbolMap.values()].sort((a, b) => b.net - a.net);

  const totalWL = winCount + lossCount;
  const totalWLStrict = winCountStrict + lossCountStrict;
  const holdTime: HoldTimeStats | null =
    htCount > 0
      ? {
          overallAvg: htOverallSum / htCount,
          winAvg: htWinCount > 0 ? htWinSum / htWinCount : 0,
          lossAvg: htLossCount > 0 ? htLossSum / htLossCount : 0,
          sampleCount: htCount,
        }
      : null;

  return {
    rowCount: rows.length,
    closedCount,
    totalNet,
    totalPrice,
    totalFee,
    totalFunding,
    avgNet: closedCount > 0 ? totalNet / closedCount : 0,
    profit,
    loss,
    winCount: hasWinField ? winCount : null,
    lossCount: hasWinField ? lossCount : null,
    winRate: hasWinField && totalWL > 0 ? winCount / totalWL : null,
    winCountStrict: totalWLStrict > 0 ? winCountStrict : null,
    lossCountStrict: totalWLStrict > 0 ? lossCountStrict : null,
    winRateStrict: totalWLStrict > 0 ? winCountStrict / totalWLStrict : null,
    daily,
    bySymbol,
    holdTime,
    units: [...units],
    positionGranular: hasWinField,
  };
}

/** 여러 거래소 row를 합쳐 거래소 식별이 가능하도록(이미 exchange 필드 있음) 그대로 합산 */
export function combineRows(byExchange: Partial<Record<ExchangeId, NormalizedRow[]>>, selected: ExchangeId[]): NormalizedRow[] {
  const out: NormalizedRow[] = [];
  for (const ex of selected) {
    const rows = byExchange[ex];
    if (rows) out.push(...rows);
  }
  return out;
}

export function formatHoldTime(ms: number): string {
  if (!ms || ms <= 0) return "—";
  const h = ms / (1000 * 60 * 60);
  if (h < 1) return `${(h * 60).toFixed(0)}분`;
  if (h < 24) return `${h.toFixed(1)}시간`;
  return `${(h / 24).toFixed(1)}일`;
}
