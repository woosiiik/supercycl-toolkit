import type { CollectRequest, CollectResult, NormalizedRow, RawPage, ReconstructedPosition } from "../../types";
import { fetchJson, num } from "../util";

// Hyperliquid 트레이드 방식 — 운영 웹앱(convertFillsToExchangeData)과 동일.
// userFillsByTime의 "모든 체결"을 value = closedPnl - fee 로 합산(오픈 체결의 수수료도 포함).
// + userFunding 을 펀딩으로 합산.
//
// 추가: fills를 심볼별 시간순 재생하여 포지션(라운드트립)을 재구성한다.
// startPosition(체결 직전 signed 포지션)을 이용해 오픈~청산 구간을 묶고, 각 포지션에
// 실현손익(Σ closedPnl)·수수료(Σ fill fee)를 합산하며, userFunding을 시간구간으로 귀속한다.

const URL = "https://api.hyperliquid.xyz/info";
const MAX_PAGES = 10;
const EPS = 1e-9;

export async function collectHyperliquidTrade(req: CollectRequest): Promise<CollectResult> {
  const user = (req.credentials.walletAddress || "").trim();
  const rawPages: RawPage[] = [];
  const rows: NormalizedRow[] = [];
  const warnings: string[] = [];
  const allFills: ParsedFill[] = [];
  const allFundings: FundingEvent[] = [];
  let requestCount = 0;

  if (!user) {
    warnings.push("지갑 주소(0x..)가 필요합니다.");
    return { exchange: "hyperliquid", rows, rawPages, warnings, meta: { requestCount, endpoints: ["/info"], startTime: req.startTime, endTime: req.endTime } };
  }

  warnings.push("Hyperliquid 트레이드 방식 — 모든 체결의 (closedPnl − fee) + 펀딩 합산(오픈 체결 수수료 포함). 운영 웹앱과 동일. '포지션 재구성' 탭에서 체결을 재생해 포지션 단위 승/패·보유시간을 제공합니다.");

  // === 모든 fill (closedPnl - fee) ===
  let startTime = req.startTime;
  for (let page = 1; page <= MAX_PAGES; page++) {
    requestCount++;
    const { page: rp, ok, body } = await fetchJson(`userFillsByTime p${page}`, URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "userFillsByTime", user, startTime, endTime: req.endTime }),
    });
    rawPages.push(rp);
    if (!ok || !Array.isArray(body)) {
      warnings.push(`Hyperliquid fills 응답 오류 (p${page}): status=${rp.status}`);
      break;
    }
    const fills = body as HlFill[];
    for (const f of fills) {
      const row = normalizeFill(f);
      if (row) rows.push(row);
      const parsed = parseFill(f);
      if (parsed) allFills.push(parsed);
    }
    if (fills.length < 2000) break;
    const lastTime = num(fills[fills.length - 1]?.time);
    if (!lastTime || lastTime + 1 <= startTime) break;
    startTime = lastTime + 1;
  }

  // === funding ===
  let fStart = req.startTime;
  for (let page = 1; page <= MAX_PAGES; page++) {
    requestCount++;
    const { page: rp, ok, body } = await fetchJson(`userFunding p${page}`, URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "userFunding", user, startTime: fStart, endTime: req.endTime }),
    });
    rawPages.push(rp);
    if (!ok || !Array.isArray(body)) {
      warnings.push(`Hyperliquid funding 응답 오류 (p${page}): status=${rp.status}`);
      break;
    }
    const funds = body as HlFunding[];
    for (const f of funds) {
      const row = normalizeFunding(f);
      if (row) rows.push(row);
      const usdc = num(f.delta?.usdc);
      if (usdc !== 0 && f.delta?.coin) allFundings.push({ coin: f.delta.coin, time: num(f.time), usdc });
    }
    if (funds.length < 500) break;
    const lastTime = num(funds[funds.length - 1]?.time);
    if (!lastTime || lastTime + 1 <= fStart) break;
    fStart = lastTime + 1;
  }

  const positions = reconstructPositions(allFills, allFundings);

  return {
    exchange: "hyperliquid",
    rows,
    positions,
    rawPages,
    warnings,
    meta: { requestCount, endpoints: ["/info userFillsByTime", "/info userFunding"], startTime: req.startTime, endTime: req.endTime },
  };
}

interface HlFill {
  coin?: string;
  px?: string;
  sz?: string;
  side?: string; // "B"(buy) / "A"(sell)
  startPosition?: string; // 체결 직전 signed 포지션
  closedPnl?: string;
  fee?: string;
  time?: number;
  dir?: string;
  tid?: number | string;
}

function normalizeFill(f: HlFill): NormalizedRow | null {
  const closed = num(f.closedPnl);
  const fee = num(f.fee);
  if (closed === 0 && fee === 0) return null;
  return {
    exchange: "hyperliquid",
    id: `fill-${f.tid ?? ""}`,
    symbol: f.coin ?? "",
    side: null,
    pricePnl: closed,
    fee: -fee,
    funding: 0,
    netPnl: closed - fee,
    openTime: null,
    closeTime: num(f.time),
    holdTimeMs: null,
    win: null,
    unit: "fill",
  };
}

interface HlFunding {
  time?: number;
  delta?: { coin?: string; usdc?: string };
}

function normalizeFunding(f: HlFunding): NormalizedRow | null {
  const usdc = num(f.delta?.usdc);
  if (usdc === 0) return null;
  return {
    exchange: "hyperliquid",
    id: `funding-${f.time}-${f.delta?.coin ?? ""}`,
    symbol: f.delta?.coin ?? "",
    side: null,
    pricePnl: 0,
    fee: 0,
    funding: usdc,
    netPnl: usdc,
    openTime: null,
    closeTime: num(f.time),
    holdTimeMs: null,
    win: null,
    unit: "income",
  };
}

// === 포지션 재구성 ===

interface ParsedFill {
  coin: string;
  time: number;
  startPos: number; // 체결 직전 signed 포지션
  delta: number; // signed 체결 수량 (buy=+, sell=-)
  closedPnl: number;
  fee: number; // 양수(비용)
  tid: string;
}

interface FundingEvent {
  coin: string;
  time: number;
  usdc: number;
}

function parseFill(f: HlFill): ParsedFill | null {
  const coin = f.coin;
  const sz = num(f.sz);
  if (!coin || sz === 0) return null;
  const sign = f.side === "A" ? -1 : 1; // A=매도(-), B=매수(+)
  return {
    coin,
    time: num(f.time),
    startPos: num(f.startPosition),
    delta: sign * sz,
    closedPnl: num(f.closedPnl),
    fee: num(f.fee),
    tid: String(f.tid ?? ""),
  };
}

interface PosAcc {
  coin: string;
  side: "long" | "short";
  openTime: number | null;
  closeTime: number | null;
  orphan: boolean;
  pricePnl: number;
  fee: number; // 음수(비용)
  funding: number;
  fillCount: number;
  maxSize: number;
}

function reconstructPositions(fills: ParsedFill[], fundings: FundingEvent[]): ReconstructedPosition[] {
  // 시간순(동시각은 tid) 정렬
  const sorted = [...fills].sort((a, b) => a.time - b.time || a.tid.localeCompare(b.tid));
  const openByCoin = new Map<string, PosAcc>();
  const done: PosAcc[] = [];

  const startAcc = (coin: string, before: number, after: number, time: number): PosAcc => {
    const orphan = Math.abs(before) > EPS;
    const ref = orphan ? before : after;
    return {
      coin,
      side: ref >= 0 ? "long" : "short",
      openTime: orphan ? null : time,
      closeTime: null,
      orphan,
      pricePnl: 0,
      fee: 0,
      funding: 0,
      fillCount: 0,
      maxSize: 0,
    };
  };

  for (const f of sorted) {
    const before = f.startPos;
    const after = before + f.delta;
    let acc = openByCoin.get(f.coin);
    if (!acc) {
      acc = startAcc(f.coin, before, after, f.time);
      openByCoin.set(f.coin, acc);
    }
    // 이 체결을 현재 포지션(청산 대상)에 반영
    acc.pricePnl += f.closedPnl;
    acc.fee += -f.fee;
    acc.fillCount += 1;
    acc.maxSize = Math.max(acc.maxSize, Math.abs(before), Math.abs(after));

    const flipped = Math.abs(before) > EPS && Math.abs(after) > EPS && Math.sign(before) !== Math.sign(after);
    if (flipped || Math.abs(after) <= EPS) {
      acc.closeTime = f.time;
      done.push(acc);
      openByCoin.delete(f.coin);
      if (flipped) {
        // 반대방향 신규 포지션이 이 체결에서 시작 (크기 |after|)
        const na = startAcc(f.coin, 0, after, f.time);
        na.maxSize = Math.abs(after);
        openByCoin.set(f.coin, na);
      }
    }
  }

  // 미청산 포지션
  const openAccs = [...openByCoin.values()];
  const all = [...done, ...openAccs];

  attachFunding(all, fundings);

  return all.map((p): ReconstructedPosition => {
    const open = p.closeTime === null;
    const netPnl = p.pricePnl + p.fee + p.funding;
    return {
      exchange: "hyperliquid",
      coin: p.coin,
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

// 각 펀딩 이벤트를 그 코인의 "열린 포지션 구간"에 시간으로 귀속
function attachFunding(positions: PosAcc[], fundings: FundingEvent[]): void {
  for (const fnd of fundings) {
    // 해당 코인 포지션 중 구간 포함 후보. openTime null=구간 시작 -∞, closeTime null=+∞
    let best: PosAcc | null = null;
    let bestStart = Number.NEGATIVE_INFINITY;
    for (const p of positions) {
      if (p.coin !== fnd.coin) continue;
      const start = p.openTime ?? Number.NEGATIVE_INFINITY;
      const end = p.closeTime ?? Number.POSITIVE_INFINITY;
      if (fnd.time < start || fnd.time > end) continue;
      // 겹칠 경우 가장 늦게 열린(=해당 시각 실제 보유) 포지션 선택
      if (start >= bestStart) {
        bestStart = start;
        best = p;
      }
    }
    if (best) best.funding += fnd.usdc;
  }
}
