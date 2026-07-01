import type { CollectRequest, CollectResult, NormalizedRow, RawPage, ReconstructedPosition } from "../../types";
import { fetchJson, hmacSha256Hex, buildQuery, splitWindows, num, DAY_MS } from "../util";

// Binance(USDT-M) 트레이드 방식 — 운영 웹앱과 동일한 데이터 소스(income).
// net PnL: GET /fapi/v1/income (REALIZED_PNL/COMMISSION/FUNDING_FEE) 합산.
//
// 포지션 재구성(승/패·보유시간): GET /fapi/v1/userTrades 를 추가 호출(원본도 raw로 표시).
//   userTrades는 체결별 realizedPnl·commission·positionSide를 직접 제공 → 별도 조인 불필요.
//   userTrades는 symbol 필수라 income에서 거래 심볼을 먼저 추출해 순회한다.
//   (심볼, positionSide)별로 체결을 재생해 라운드트립을 묶는다(헤지 모드는 positionSide로 분리).

const BASE = "https://fapi.binance.com";
const INCOME_PATH = "/fapi/v1/income";
const TRADES_PATH = "/fapi/v1/userTrades";
const COMPONENT_TYPES = new Set(["REALIZED_PNL", "COMMISSION", "FUNDING_FEE"]);
const MAX_PAGES = 50;
const WINDOW = 7 * DAY_MS; // userTrades 요청 범위 최대 7일
const EPS = 1e-10;

export async function collectBinanceTrade(req: CollectRequest): Promise<CollectResult> {
  const { apiKey, apiSecret } = req.credentials;
  const rawPages: RawPage[] = [];
  const rows: NormalizedRow[] = [];
  const warnings: string[] = [];
  const symbols = new Set<string>();
  const fundings: FundingEvent[] = [];
  const trades: TradeP[] = [];
  let requestCount = 0;

  warnings.push("Binance 트레이드 방식 — net은 income 원장 합산(운영과 동일 소스). 포지션 재구성은 userTrades(realizedPnl·commission·positionSide)를 (심볼,positionSide)별로 재생합니다. userTrades는 symbol 필수라 income에서 심볼 추출. 검증 전 휴리스틱이니 원본(raw)과 교차확인하세요.");

  // === ① income (net rows + 심볼/펀딩 수집) ===
  let startTime = req.startTime;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const qs = buildQuery({ startTime, endTime: req.endTime, limit: 1000, timestamp: Date.now() });
    const sign = hmacSha256Hex(apiSecret, qs);
    requestCount++;
    const { page: rp, ok, body } = await fetchJson(`income p${page}`, `${BASE}${INCOME_PATH}?${qs}&signature=${sign}`, {
      method: "GET",
      headers: { "X-MBX-APIKEY": apiKey },
    });
    rawPages.push(rp);
    if (!ok) {
      const b = body as { code?: number; msg?: string };
      warnings.push(`Binance income 오류 (p${page}): code=${b?.code} msg=${b?.msg ?? rp.status}`);
      break;
    }
    const list = (Array.isArray(body) ? body : []) as BinanceIncome[];
    for (const d of list) {
      const row = normalizeIncome(d);
      if (row) rows.push(row);
      if (d.symbol && COMPONENT_TYPES.has(d.incomeType ?? "")) symbols.add(d.symbol);
      if (d.incomeType === "FUNDING_FEE" && d.symbol) fundings.push({ symbol: d.symbol, time: num(d.time), income: num(d.income) });
    }
    if (list.length < 1000) break;
    const lastTime = num(list[list.length - 1]?.time);
    if (!lastTime || lastTime + 1 <= startTime) break;
    startTime = lastTime + 1;
  }

  // === ② userTrades per symbol (포지션 재구성용) ===
  const windows = splitWindows(req.startTime, req.endTime, WINDOW);
  for (const symbol of symbols) {
    for (const w of windows) {
      const tag = `${symbol} ${new Date(w.start).toISOString().slice(0, 10)}`;
      let fromId: number | undefined;
      for (let page = 0; page < MAX_PAGES; page++) {
        const params: Record<string, string | number> = fromId !== undefined
          ? { symbol, limit: 1000, fromId, timestamp: Date.now() }
          : { symbol, startTime: w.start, endTime: w.end, limit: 1000, timestamp: Date.now() };
        const qs = buildQuery(params);
        const sign = hmacSha256Hex(apiSecret, qs);
        requestCount++;
        const { page: rp, ok, body } = await fetchJson(`userTrades ${tag} p${page}`, `${BASE}${TRADES_PATH}?${qs}&signature=${sign}`, {
          method: "GET",
          headers: { "X-MBX-APIKEY": apiKey },
        });
        rawPages.push(rp);
        if (!ok) {
          const b = body as { code?: number; msg?: string };
          warnings.push(`Binance userTrades 오류 (${tag} p${page}): code=${b?.code} msg=${b?.msg ?? rp.status}`);
          break;
        }
        const list = (Array.isArray(body) ? body : []) as BinanceTrade[];
        // fromId 페이지네이션은 시간창을 넘을 수 있어 window로 필터
        let overflowed = false;
        for (const d of list) {
          const t = num(d.time);
          if (t < w.start || t > w.end) {
            if (t > w.end) overflowed = true;
            continue;
          }
          const parsed = parseTrade(d);
          if (parsed) trades.push(parsed);
        }
        if (list.length < 1000 || overflowed) break;
        const lastId = Number(list[list.length - 1]?.id);
        if (!Number.isFinite(lastId)) break;
        fromId = lastId + 1;
      }
    }
  }

  const positions = reconstructPositions(trades, fundings);

  return {
    exchange: "binance",
    rows,
    positions,
    rawPages,
    warnings,
    meta: { requestCount, endpoints: [INCOME_PATH, TRADES_PATH], startTime: req.startTime, endTime: req.endTime },
  };
}

interface BinanceIncome {
  symbol?: string;
  incomeType?: string;
  income?: string;
  time?: number;
  tranId?: number | string;
}

function normalizeIncome(d: BinanceIncome): NormalizedRow | null {
  const type = d.incomeType ?? "";
  if (!COMPONENT_TYPES.has(type)) return null;
  const amount = num(d.income);
  const isRealized = type === "REALIZED_PNL";
  const isFunding = type === "FUNDING_FEE";
  const isFee = type === "COMMISSION";
  return {
    exchange: "binance",
    id: `${d.tranId ?? ""}-${type}`,
    symbol: d.symbol ?? "",
    side: null,
    pricePnl: isRealized ? amount : 0,
    fee: isFee ? amount : 0,
    funding: isFunding ? amount : 0,
    netPnl: amount,
    openTime: null,
    closeTime: num(d.time),
    holdTimeMs: null,
    win: null,
    unit: isRealized ? "fill" : "income",
  };
}

// === 포지션 재구성 ===

interface BinanceTrade {
  symbol?: string;
  id?: number | string;
  side?: string; // BUY / SELL
  positionSide?: string; // BOTH / LONG / SHORT
  qty?: string;
  realizedPnl?: string;
  commission?: string;
  time?: number;
}
interface TradeP {
  symbol: string;
  posSide: string; // BOTH / LONG / SHORT
  time: number;
  id: number;
  sideSign: number; // BUY +1 / SELL -1
  qty: number;
  realizedPnl: number;
  commission: number; // 양수(비용)
}
interface FundingEvent {
  symbol: string;
  time: number;
  income: number;
}

function parseTrade(d: BinanceTrade): TradeP | null {
  const symbol = d.symbol;
  const qty = num(d.qty);
  if (!symbol || qty === 0) return null;
  return {
    symbol,
    posSide: d.positionSide ?? "BOTH",
    time: num(d.time),
    id: Number(d.id) || 0,
    sideSign: d.side === "SELL" ? -1 : 1,
    qty,
    realizedPnl: num(d.realizedPnl),
    commission: num(d.commission),
  };
}

interface PosAcc {
  symbol: string;
  side: "long" | "short";
  pos: number; // signed 포지션
  openTime: number | null;
  closeTime: number | null;
  lastTime: number;
  orphan: boolean;
  pricePnl: number;
  fee: number;
  funding: number;
  fillCount: number;
  maxSize: number;
}

function reconstructPositions(trades: TradeP[], fundings: FundingEvent[]): ReconstructedPosition[] {
  const sorted = [...trades].sort((a, b) => a.time - b.time || a.id - b.id);
  const openByKey = new Map<string, PosAcc>();
  const done: PosAcc[] = [];

  const sideOf = (t: TradeP, before: number, after: number): "long" | "short" => {
    if (t.posSide === "LONG") return "long";
    if (t.posSide === "SHORT") return "short";
    // one-way(BOTH): 청산(realizedPnl!=0)이며 신규시작이면 방향은 청산 대상 = SELL이 롱을 닫음
    const ref = Math.abs(before) > EPS ? before : after !== 0 ? after : t.sideSign > 0 ? -1 : 1;
    return ref >= 0 ? "long" : "short";
  };

  for (const t of sorted) {
    const key = `${t.symbol}|${t.posSide}`;
    let acc = openByKey.get(key);
    const before = acc?.pos ?? 0;
    const delta = t.sideSign * t.qty;
    const after = before + delta;

    if (!acc) {
      const orphan = Math.abs(before) <= EPS && t.realizedPnl !== 0; // 청산인데 알려진 오픈 없음
      acc = {
        symbol: t.symbol,
        side: sideOf(t, before, after),
        pos: 0,
        openTime: orphan ? null : t.time,
        closeTime: null,
        lastTime: t.time,
        orphan,
        pricePnl: 0,
        fee: 0,
        funding: 0,
        fillCount: 0,
        maxSize: 0,
      };
      openByKey.set(key, acc);
    }

    acc.pos = after;
    acc.pricePnl += t.realizedPnl;
    acc.fee += -t.commission;
    acc.fillCount += 1;
    acc.lastTime = t.time;
    acc.maxSize = Math.max(acc.maxSize, Math.abs(before), Math.abs(after));

    const flipped = Math.abs(before) > EPS && Math.abs(after) > EPS && Math.sign(before) !== Math.sign(after);
    if (flipped || Math.abs(after) <= EPS) {
      acc.closeTime = t.time;
      done.push(acc);
      openByKey.delete(key);
      if (flipped) {
        // 반대방향 신규 포지션이 이 체결에서 시작
        const na: PosAcc = {
          symbol: t.symbol,
          side: after >= 0 ? "long" : "short",
          pos: after,
          openTime: t.time,
          closeTime: null,
          lastTime: t.time,
          orphan: false,
          pricePnl: 0,
          fee: 0,
          funding: 0,
          fillCount: 0,
          maxSize: Math.abs(after),
        };
        openByKey.set(key, na);
      }
    }
  }

  for (const acc of openByKey.values()) done.push(acc);

  // 펀딩(FUNDING_FEE) 시간구간 귀속
  for (const f of fundings) {
    let best: PosAcc | null = null;
    let bestStart = Number.NEGATIVE_INFINITY;
    for (const p of done) {
      if (p.symbol !== f.symbol) continue;
      const start = p.openTime ?? Number.NEGATIVE_INFINITY;
      const end = p.closeTime ?? Number.POSITIVE_INFINITY;
      if (f.time < start || f.time > end) continue;
      if (start >= bestStart) {
        bestStart = start;
        best = p;
      }
    }
    if (best) best.funding += f.income;
  }

  return done.map((p): ReconstructedPosition => {
    const open = p.closeTime === null;
    const netPnl = p.pricePnl + p.fee + p.funding;
    return {
      exchange: "binance",
      coin: p.symbol,
      side: p.side,
      openTime: p.openTime,
      closeTime: p.closeTime,
      holdTimeMs: p.openTime !== null && p.closeTime !== null ? p.closeTime - p.openTime : null,
      maxSize: p.maxSize,
      pricePnl: p.pricePnl,
      fee: p.fee,
      funding: p.funding,
      netPnl,
      win: open ? null : netPnl > 0,
      fillCount: p.fillCount,
      orphan: p.orphan,
      open,
    };
  });
}
