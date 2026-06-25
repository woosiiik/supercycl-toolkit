import type { CollectRequest, CollectResult, NormalizedRow, RawPage } from "../types";
import { fetchJson, num } from "./util";

// Hyperliquid — [B] income 방식 (fills closedPnl). POST /info
// API key 없음 — 지갑 주소만으로 공개 조회.
// userFillsByTime: 청산 fill의 closedPnl/fee. userFunding: 펀딩 원장. hold time 불가.

const URL = "https://api.hyperliquid.xyz/info";
const MAX_PAGES = 10; // 응답당 2000, 전체 최근 10,000 fill 한계

export async function collectHyperliquid(req: CollectRequest): Promise<CollectResult> {
  const user = (req.credentials.walletAddress || "").trim();
  const rawPages: RawPage[] = [];
  const rows: NormalizedRow[] = [];
  const warnings: string[] = [];
  let requestCount = 0;

  if (!user) {
    warnings.push("지갑 주소(0x..)가 필요합니다.");
    return { exchange: "hyperliquid", rows, rawPages, warnings, meta: { requestCount, endpoints: ["/info"], startTime: req.startTime, endTime: req.endTime } };
  }

  warnings.push("Hyperliquid는 fill 단위 closedPnl 합산입니다 — hold time 미지원, 승/패는 fill 기준 근사. 최근 10,000 fill 한계로 장기 이력은 누락될 수 있습니다.");

  // === fills (closedPnl) ===
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

  // === funding (펀딩 토글용 별도 원장) ===
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
    for (const f of funds) rows.push(normalizeFunding(f));
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
  dir?: string; // "Close Long" 등
  tid?: number | string;
  side?: string; // B/A
}

function normalizeFill(f: HlFill): NormalizedRow | null {
  const closed = num(f.closedPnl);
  const fee = num(f.fee);
  // 청산 fill만 (closedPnl != 0 또는 dir에 Close 포함)
  const isClose = (f.dir || "").includes("Close");
  if (!isClose && closed === 0) return null;
  const net = closed - fee;
  const dir = (f.dir || "").toLowerCase();
  const side = dir.includes("long") ? "long" : dir.includes("short") ? "short" : null;
  return {
    exchange: "hyperliquid",
    id: `fill-${f.tid ?? ""}`,
    symbol: f.coin ?? "",
    side,
    pricePnl: closed,
    fee: -fee,
    funding: 0,
    netPnl: net,
    openTime: null,
    closeTime: num(f.time),
    holdTimeMs: null,
    win: closed > 0,
    unit: "fill",
  };
}

interface HlFunding {
  time?: number;
  delta?: { coin?: string; usdc?: string };
}

function normalizeFunding(f: HlFunding): NormalizedRow {
  const usdc = num(f.delta?.usdc);
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
    // 펀딩 원장은 체결(fill)이 아님 → income 으로 분류해 종료건수/평균 분모에서 제외 (Bybit와 통일)
    unit: "income",
  };
}
