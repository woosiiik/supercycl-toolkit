import type { CollectRequest, CollectResult, NormalizedRow, RawPage } from "../../types";
import { fetchJson, num } from "../util";

// Hyperliquid 트레이드 방식 — 운영 웹앱(convertFillsToExchangeData)과 동일.
// userFillsByTime의 "모든 체결"을 value = closedPnl - fee 로 합산(오픈 체결의 수수료도 포함).
// + userFunding 을 펀딩으로 합산. 포지션 승/패·보유시간은 제공하지 않음(win=null).
// 포지션 방식(adapters/hyperliquid.ts)은 청산 fill만 카운트해 오픈 수수료를 제외하지만,
// 트레이드 방식은 웹앱과 동일하게 전 체결 수수료를 포함한다.

const URL = "https://api.hyperliquid.xyz/info";
const MAX_PAGES = 10;

export async function collectHyperliquidTrade(req: CollectRequest): Promise<CollectResult> {
  const user = (req.credentials.walletAddress || "").trim();
  const rawPages: RawPage[] = [];
  const rows: NormalizedRow[] = [];
  const warnings: string[] = [];
  let requestCount = 0;

  if (!user) {
    warnings.push("지갑 주소(0x..)가 필요합니다.");
    return { exchange: "hyperliquid", rows, rawPages, warnings, meta: { requestCount, endpoints: ["/info"], startTime: req.startTime, endTime: req.endTime } };
  }

  warnings.push("Hyperliquid 트레이드 방식 — 모든 체결의 (closedPnl − fee) + 펀딩 합산(오픈 체결 수수료 포함). 운영 웹앱과 동일. 보유시간·포지션 승/패는 제공되지 않습니다.");

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
    }
    if (funds.length < 500) break;
    const lastTime = num(funds[funds.length - 1]?.time);
    if (!lastTime || lastTime + 1 <= fStart) break;
    fStart = lastTime + 1;
  }

  return {
    exchange: "hyperliquid",
    rows,
    rawPages,
    warnings,
    meta: { requestCount, endpoints: ["/info userFillsByTime", "/info userFunding"], startTime: req.startTime, endTime: req.endTime },
  };
}

interface HlFill {
  coin?: string;
  closedPnl?: string;
  fee?: string;
  time?: number;
  dir?: string;
  tid?: number | string;
}

function normalizeFill(f: HlFill): NormalizedRow | null {
  const closed = num(f.closedPnl);
  const fee = num(f.fee);
  // 오픈/청산 무관 — 손익이나 수수료가 있으면 모두 포함 (웹앱과 동일)
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
