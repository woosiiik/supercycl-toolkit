import type { CollectRequest, CollectResult, NormalizedRow, RawPage } from "../../types";
import { fetchJson, hmacSha256Base64, buildQuery, num } from "../util";

// OKX 트레이드 방식 — 운영 웹앱(OkxPnl)과 동일.
// 실현손익·수수료: GET /api/v5/trade/fills-history (fillPnl + fee)
// 펀딩: GET /api/v5/account/bills-archive 에서 type=8(Funding Fee) 의 balChg
// (type=1 이체는 PnL 아님 → 제외). 포지션 종료 여부와 무관하게 거래 발생일 귀속.

const BASE = "https://www.okx.com";
const FILLS_PATH = "/api/v5/trade/fills-history";
const BILLS_PATH = "/api/v5/account/bills-archive";
const MAX_PAGES = 50;

function okxHeaders(apiKey: string, apiSecret: string, passphrase: string, path: string) {
  const ts = new Date().toISOString();
  const sign = hmacSha256Base64(apiSecret, ts + "GET" + path);
  return {
    "OK-ACCESS-KEY": apiKey,
    "OK-ACCESS-SIGN": sign,
    "OK-ACCESS-TIMESTAMP": ts,
    "OK-ACCESS-PASSPHRASE": passphrase,
    "Content-Type": "application/json",
  };
}

export async function collectOkxTrade(req: CollectRequest): Promise<CollectResult> {
  const { apiKey, apiSecret, passphrase } = req.credentials;
  const rawPages: RawPage[] = [];
  const rows: NormalizedRow[] = [];
  const warnings: string[] = [];
  let requestCount = 0;

  warnings.push("OKX 트레이드 방식 — fills-history(실현손익·수수료) + bills-archive type=8(펀딩) 합산. 운영 웹앱과 동일. 보유시간·포지션 승/패는 제공되지 않습니다.");

  // === ① 실현손익·수수료 (fills-history) ===
  let after = "";
  for (let page = 1; page <= MAX_PAGES; page++) {
    const qs = buildQuery({ instType: "SWAP", begin: req.startTime, end: req.endTime, limit: 100, after });
    const path = `${FILLS_PATH}?${qs}`;
    requestCount++;
    const { page: rp, ok, body } = await fetchJson(`fills-history p${page}`, BASE + path, {
      method: "GET",
      headers: okxHeaders(apiKey, apiSecret, passphrase, path),
    });
    rawPages.push(rp);
    const b = body as { code?: string; msg?: string; data?: OkxFill[] };
    if (!ok || (b?.code && b.code !== "0")) {
      warnings.push(`OKX fills-history 오류 (p${page}): code=${b?.code} msg=${b?.msg ?? rp.status}`);
      break;
    }
    const data = b?.data ?? [];
    if (data.length === 0) break;
    for (const d of data) {
      const row = normalizeFill(d);
      if (row) rows.push(row);
    }
    if (data.length < 100) break;
    const lastBillId = data[data.length - 1]?.billId;
    if (!lastBillId) break;
    after = lastBillId;
  }

  // === ② 펀딩 (bills-archive, type=8) ===
  after = "";
  for (let page = 1; page <= MAX_PAGES; page++) {
    const qs = buildQuery({ instType: "SWAP", type: "8", begin: req.startTime, end: req.endTime, limit: 100, after });
    const path = `${BILLS_PATH}?${qs}`;
    requestCount++;
    const { page: rp, ok, body } = await fetchJson(`bills-archive(funding) p${page}`, BASE + path, {
      method: "GET",
      headers: okxHeaders(apiKey, apiSecret, passphrase, path),
    });
    rawPages.push(rp);
    const b = body as { code?: string; msg?: string; data?: OkxBill[] };
    if (!ok || (b?.code && b.code !== "0")) {
      warnings.push(`OKX bills-archive(funding) 오류 (p${page}): code=${b?.code} msg=${b?.msg ?? rp.status}`);
      break;
    }
    const data = b?.data ?? [];
    if (data.length === 0) break;
    for (const d of data) {
      const row = normalizeFunding(d);
      if (row) rows.push(row);
    }
    if (data.length < 100) break;
    const lastBillId = data[data.length - 1]?.billId;
    if (!lastBillId) break;
    after = lastBillId;
  }

  return {
    exchange: "okx",
    rows,
    rawPages,
    warnings,
    meta: { requestCount, endpoints: [FILLS_PATH, BILLS_PATH], startTime: req.startTime, endTime: req.endTime },
  };
}

interface OkxFill {
  instId?: string;
  billId?: string;
  fillPnl?: string;
  fee?: string;
  ts?: string;
}

function normalizeFill(d: OkxFill): NormalizedRow | null {
  const price = d.fillPnl !== undefined && d.fillPnl !== "" ? num(d.fillPnl) : 0;
  const fee = d.fee !== undefined && d.fee !== "" ? num(d.fee) : 0; // OKX fee는 비용이 음수
  if (price === 0 && fee === 0) return null;
  return {
    exchange: "okx",
    id: `fill-${d.billId}`,
    symbol: d.instId ?? "",
    side: null,
    pricePnl: price,
    fee,
    funding: 0,
    netPnl: price + fee,
    openTime: null,
    closeTime: num(d.ts),
    holdTimeMs: null,
    win: null,
    unit: "fill",
  };
}

interface OkxBill {
  instId?: string;
  billId?: string;
  balChg?: string;
  pnl?: string;
  ts?: string;
}

function normalizeFunding(d: OkxBill): NormalizedRow | null {
  const funding = num(d.balChg) || num(d.pnl);
  if (funding === 0) return null;
  return {
    exchange: "okx",
    id: `funding-${d.billId}`,
    symbol: d.instId ?? "",
    side: null,
    pricePnl: 0,
    fee: 0,
    funding,
    netPnl: funding,
    openTime: null,
    closeTime: num(d.ts),
    holdTimeMs: null,
    win: null,
    unit: "income",
  };
}
